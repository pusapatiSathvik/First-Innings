-- Use the auth UUID as the canonical identity everywhere. Usernames are mutable,
-- case-insensitive unique handles used only for lookup and display.

create unique index if not exists profiles_username_lower_uidx
  on public.profiles (lower(username));

-- Profile identity fields are changed only through the validated function below.
revoke update on public.profiles from authenticated;

create or replace function public.update_my_username(p_username text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_username text := lower(trim(coalesce(p_username, '')));
  v_old_username text;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if v_username !~ '^[a-z0-9][a-z0-9-]{2,31}$' then
    raise exception 'Username must be 3–32 characters using lowercase letters, numbers, or hyphens';
  end if;

  select p.username into v_old_username
  from public.profiles as p
  where p.id = v_user_id
  for update;
  if not found then raise exception 'Profile not found'; end if;

  -- The unique index is the final authority and safely arbitrates concurrent claims.
  update public.profiles as p
  set username = v_username, updated_at = now()
  where p.id = v_user_id;

  if v_old_username is distinct from v_username then
    perform public.write_audit(
      'profile_username_changed', 'profile', v_user_id, null,
      jsonb_build_object('old_username', v_old_username, 'new_username', v_username)
    );
  end if;
  return v_username;
exception
  when unique_violation then
    raise exception 'That username is already taken' using errcode = '23505';
end;
$$;

revoke all on function public.update_my_username(text) from public, anon, authenticated;
grant execute on function public.update_my_username(text) to authenticated;

-- Replace the output name `user_id` with `account_id` so profile search results
-- cannot shadow SQL columns or be mistaken for the immutable membership key.
drop function if exists public.captain_search_tournament_users(uuid, text);
create function public.captain_search_tournament_users(p_team_id uuid, p_query text)
returns table(account_id uuid, username text, full_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tournament_id uuid;
  v_tournament_state text;
  v_query text := trim(coalesce(p_query, ''));
begin
  if not public.is_team_captain(p_team_id) then
    raise exception 'Captain permission required' using errcode = '42501';
  end if;
  if char_length(v_query) < 3 then raise exception 'Enter at least three characters to search'; end if;
  if v_query ~ '[%_]' then raise exception 'Search text cannot contain wildcard characters'; end if;

  select t.tournament_id into v_tournament_id
  from public.teams as t
  where t.id = p_team_id;
  if v_tournament_id is null then raise exception 'Team not found'; end if;

  select tr.state into v_tournament_state
  from public.tournaments as tr
  where tr.id = v_tournament_id;
  if v_tournament_state <> 'registration_open' then raise exception 'Tournament registration is closed'; end if;
  if exists (
    select 1 from public.teams as t
    where t.id = p_team_id and t.roster_locked_at is not null
  ) then raise exception 'Team roster is locked'; end if;

  return query
  select p.id, p.username, p.full_name
  from public.profiles as p
  where p.id <> (select auth.uid())
    and (
      p.id::text = lower(v_query)
      or lower(p.username) like lower(v_query) || '%'
      or p.full_name ilike v_query || '%'
    )
    and not exists (
      select 1 from public.tournament_members as tm
      where tm.tournament_id = v_tournament_id
        and tm.user_id = p.id
        and tm.status in ('pending', 'active')
    )
  order by
    case when p.id::text = lower(v_query) then 0
         when lower(p.username) = lower(v_query) then 1
         else 2 end,
    p.username
  limit 20;
end;
$$;

-- The canonical mutation accepts only the immutable auth UUID, returns no row
-- (avoiding PL/pgSQL output-variable name collisions), and owns the full
-- transactional membership operation. It never resolves a username.
drop function if exists public.captain_add_team_member_by_user_id(uuid, uuid);
create function public.captain_add_team_member_by_user_id(p_team_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_tournament_id uuid;
  v_tournament_state text;
  v_roster_max integer;
  v_roster_locked_at timestamptz;
  v_team_status text;
  v_username text;
  v_membership_id uuid;
  v_membership_status text;
begin
  if v_actor_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_user_id is null then raise exception 'Choose an account first'; end if;
  if not public.is_team_captain(p_team_id) then
    raise exception 'Captain permission required' using errcode = '42501';
  end if;
  if p_user_id = v_actor_id then raise exception 'You are already the team captain'; end if;

  select t.tournament_id into v_tournament_id
  from public.teams as t where t.id = p_team_id;
  if v_tournament_id is null then raise exception 'Team not found'; end if;

  -- Serialize all membership decisions in this tournament, including the case
  -- where the target has no existing membership row yet.
  perform pg_advisory_xact_lock(hashtextextended(v_tournament_id::text, 0));
  select tr.state, tr.roster_max into v_tournament_state, v_roster_max
  from public.tournaments as tr
  where tr.id = v_tournament_id
  for update;
  if not found or v_tournament_state <> 'registration_open' then
    raise exception 'Tournament registration is closed';
  end if;

  select t.status, t.roster_locked_at into v_team_status, v_roster_locked_at
  from public.teams as t
  where t.id = p_team_id and t.tournament_id = v_tournament_id
  for update;
  if not found then raise exception 'Team not found'; end if;
  if not public.is_team_captain(p_team_id) then
    raise exception 'Captain permission required' using errcode = '42501';
  end if;
  if v_team_status in ('withdrawn', 'rejected') then raise exception 'Team is not active'; end if;
  if v_roster_locked_at is not null then raise exception 'Team roster is locked'; end if;

  select p.username into v_username
  from public.profiles as p
  where p.id = p_user_id;
  if not found then raise exception 'User account not found'; end if;

  select tm.id, tm.status into v_membership_id, v_membership_status
  from public.tournament_members as tm
  where tm.tournament_id = v_tournament_id and tm.user_id = p_user_id
  for update;
  if found and v_membership_status in ('active', 'pending') then
    raise exception 'This user already has an active or pending membership in the tournament';
  end if;

  if (select count(*) from public.team_members as member_row
      where member_row.team_id = p_team_id and member_row.status = 'active') >= v_roster_max then
    raise exception 'Roster limit reached';
  end if;

  if v_membership_id is not null then
    update public.tournament_members as tm
    set team_id = p_team_id,
        status = 'active',
        requested_at = now(),
        decided_at = now(),
        decided_by = v_actor_id
    where tm.id = v_membership_id;
  else
    insert into public.tournament_members(tournament_id, team_id, user_id, status, decided_at, decided_by)
    values (v_tournament_id, p_team_id, p_user_id, 'active', now(), v_actor_id);
  end if;

  insert into public.team_members(tournament_id, team_id, user_id, role, status)
  values (v_tournament_id, p_team_id, p_user_id, 'player', 'active')
  on conflict (team_id, user_id) do update
    set role = 'player', status = 'active', joined_at = now(), left_at = null;

  insert into public.user_roles(user_id, role, assigned_by)
  values (p_user_id, 'player', v_actor_id)
  on conflict (user_id, role) do nothing;

  insert into public.notifications(user_id, kind, title, body)
  values (p_user_id, 'membership_approved', 'Added to a team', 'A team captain added you to a tournament squad.');

  perform public.write_audit(
    'captain_added_member', 'team', p_team_id, null,
    jsonb_build_object('user_id', p_user_id, 'username', v_username)
  );
end;
$$;

-- Preserve the legacy username RPC safely for older clients, but resolve the
-- handle once and route all writes through the UUID-based canonical operation.
create or replace function public.captain_add_team_member_by_username(p_team_id uuid, p_username text)
returns table(user_id uuid, username text, full_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target_id uuid;
  v_username text;
  v_full_name text;
begin
  select p.id, p.username, p.full_name
  into v_target_id, v_username, v_full_name
  from public.profiles as p
  where lower(p.username) = lower(trim(p_username));
  if v_target_id is null then raise exception 'No account found for that username'; end if;
  perform public.captain_add_team_member_by_user_id(p_team_id, v_target_id);
  return query select v_target_id, v_username, v_full_name;
end;
$$;

revoke all on function public.captain_search_tournament_users(uuid, text) from public, anon, authenticated;
revoke all on function public.captain_add_team_member_by_user_id(uuid, uuid) from public, anon, authenticated;
revoke all on function public.captain_add_team_member_by_username(uuid, text) from public, anon, authenticated;
grant execute on function public.captain_search_tournament_users(uuid, text) to authenticated;
grant execute on function public.captain_add_team_member_by_user_id(uuid, uuid) to authenticated;
grant execute on function public.captain_add_team_member_by_username(uuid, text) to authenticated;

notify pgrst, 'reload schema';
