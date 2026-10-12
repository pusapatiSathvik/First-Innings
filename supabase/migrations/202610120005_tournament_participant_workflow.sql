-- Usernames, captain-added members, participant tournament links, and a minimal
-- admin umpire flow. All writes remain database-validated and audited.

alter table public.profiles add column if not exists username text;

update public.profiles p
set username = left(
  coalesce(
    nullif(trim(both '-' from regexp_replace(lower(coalesce(nullif(p.full_name, ''), u.email, 'player')), '[^a-z0-9]+', '-', 'g')), ''),
    'player'
  ), 23
) || '-' || left(replace(p.id::text, '-', ''), 8)
from auth.users u
where u.id = p.id and p.username is null;

alter table public.profiles alter column username set not null;
alter table public.profiles add constraint profiles_username_format
  check (username ~ '^[a-z0-9][a-z0-9-]{2,31}$');
create unique index profiles_username_lower_uidx on public.profiles (lower(username));

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_name text := coalesce(new.raw_user_meta_data ->> 'full_name', '');
  v_base text;
begin
  v_base := left(coalesce(nullif(trim(both '-' from regexp_replace(lower(coalesce(nullif(v_name, ''), new.email, 'player')), '[^a-z0-9]+', '-', 'g')), ''), 'player'), 23);
  insert into public.profiles (id, full_name, username)
  values (new.id, v_name, v_base || '-' || left(replace(new.id::text, '-', ''), 8));
  insert into public.user_roles (user_id, role) values (new.id, 'player');
  return new;
end;
$$;

create or replace function public.captain_add_team_member_by_username(p_team_id uuid, p_username text)
returns table(user_id uuid, username text, full_name text)
language plpgsql security definer set search_path = '' as $$
declare
  v_team public.teams%rowtype;
  v_tournament public.tournaments%rowtype;
  v_player uuid;
  v_username text;
  v_full_name text;
  v_membership public.tournament_members%rowtype;
  v_has_membership boolean;
begin
  if not public.is_team_captain(p_team_id) then raise exception 'Captain permission required' using errcode='42501'; end if;
  select * into v_team from public.teams where id=p_team_id for update;
  if not found or v_team.status in ('withdrawn','rejected') then raise exception 'Team is not active'; end if;
  if v_team.roster_locked_at is not null then raise exception 'Team roster is locked'; end if;
  select * into v_tournament from public.tournaments where id=v_team.tournament_id;
  if v_tournament.state <> 'registration_open' then raise exception 'Tournament registration is closed'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_team.tournament_id::text, 0));
  select p.id,p.username,p.full_name into v_player,v_username,v_full_name
    from public.profiles p where lower(p.username)=lower(trim(p_username));
  if v_player is null then raise exception 'No account found for that username'; end if;
  if v_player=(select auth.uid()) then raise exception 'You are already the team captain'; end if;
  select * into v_membership from public.tournament_members where tournament_id=v_team.tournament_id and user_id=v_player for update;
  v_has_membership := found;
  if v_has_membership and v_membership.status in ('active','pending') then raise exception 'This user already has an active or pending membership in the tournament'; end if;
  if (select count(*) from public.team_members where team_id=p_team_id and status='active') >= v_tournament.roster_max then
    raise exception 'Roster limit reached';
  end if;
  if v_has_membership then
    update public.tournament_members set team_id=p_team_id,status='active',requested_at=now(),decided_at=now(),decided_by=(select auth.uid()) where id=v_membership.id;
  else
    insert into public.tournament_members(tournament_id,team_id,user_id,status,decided_at,decided_by)
      values(v_team.tournament_id,p_team_id,v_player,'active',now(),(select auth.uid()));
  end if;
  insert into public.team_members(tournament_id,team_id,user_id,role,status)
    values(v_team.tournament_id,p_team_id,v_player,'player','active')
    on conflict(team_id,user_id) do update set role='player',status='active',joined_at=now(),left_at=null;
  insert into public.user_roles(user_id,role,assigned_by)
    values(v_player,'player',(select auth.uid())) on conflict(user_id,role) do nothing;
  insert into public.notifications(user_id,kind,title,body)
    values(v_player,'membership_approved','Added to a team','A team captain added you to a tournament squad.');
  perform public.write_audit('captain_added_member','team',p_team_id,null,jsonb_build_object('user_id',v_player,'username',v_username));
  return query select v_player,v_username,v_full_name;
end;
$$;

create or replace function public.list_team_roster_with_username(p_team_id uuid)
returns table(user_id uuid, username text, full_name text, member_role text, membership_status text, requested_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_team_captain(p_team_id) and not public.has_role('admin') and not exists(
    select 1 from public.team_members m where m.team_id=p_team_id and m.user_id=(select auth.uid()) and m.status='active'
  ) then raise exception 'Team membership required' using errcode='42501'; end if;
  return query
    select tm.user_id,p.username,coalesce(p.full_name,''),coalesce(m.role,'player'),tm.status,tm.requested_at
    from public.tournament_members tm
    join public.profiles p on p.id=tm.user_id
    left join public.team_members m on m.tournament_id=tm.tournament_id and m.team_id=tm.team_id and m.user_id=tm.user_id
    where tm.team_id=p_team_id and tm.status in ('pending','active')
    order by (tm.status='pending') desc,tm.requested_at;
end;
$$;

create or replace function public.admin_join_match_as_official(p_match_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_status text; v_tournament uuid; v_user uuid := (select auth.uid());
begin
  if not public.has_role('admin') then raise exception 'admin role required' using errcode='42501'; end if;
  select status,tournament_id into v_status,v_tournament from public.matches where id=p_match_id for update;
  if not found or v_status <> 'scheduled' then raise exception 'Only scheduled matches can be joined as umpire'; end if;
  if exists(select 1 from public.match_officials where match_id=p_match_id and revoked_at is null) then
    if exists(select 1 from public.match_officials where match_id=p_match_id and user_id=v_user and revoked_at is null) then return; end if;
    raise exception 'This match already has an active umpire assignment';
  end if;
  insert into public.match_officials(match_id,user_id,assigned_by)
    values(p_match_id,v_user,v_user);
  perform public.write_audit('admin_joined_as_umpire','match',p_match_id,null,jsonb_build_object('tournament_id',v_tournament));
end;
$$;

create or replace function public.admin_list_my_umpire_matches()
returns table(match_id uuid,tournament_id uuid,tournament_name text,round_number integer,match_number integer,status text,
  team_a_id uuid,team_a_name text,team_b_id uuid,team_b_name text,winner_team_id uuid,scheduled_for timestamptz,venue text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_role('admin') then raise exception 'admin role required' using errcode='42501'; end if;
  return query
    select m.id,m.tournament_id,t.name,m.round_number,m.match_number,m.status,m.team_a_id,ta.name,m.team_b_id,tb.name,m.winner_team_id,m.scheduled_for,m.venue
    from public.match_officials o
    join public.matches m on m.id=o.match_id
    join public.tournaments t on t.id=m.tournament_id
    left join public.teams ta on ta.id=m.team_a_id
    left join public.teams tb on tb.id=m.team_b_id
    where o.user_id=(select auth.uid()) and o.revoked_at is null
    order by m.scheduled_for nulls last,m.round_number,m.match_number;
end;
$$;

create or replace function public.admin_list_open_umpire_matches()
returns table(id uuid,tournament_id uuid,tournament_name text,round_number integer,match_number integer,
  team_a_id uuid,team_a_name text,team_b_id uuid,team_b_name text,scheduled_for timestamptz,venue text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_role('admin') then raise exception 'admin role required' using errcode='42501'; end if;
  return query
    select m.id,m.tournament_id,t.name,m.round_number,m.match_number,m.team_a_id,ta.name,m.team_b_id,tb.name,m.scheduled_for,m.venue
    from public.matches m
    join public.tournaments t on t.id=m.tournament_id
    left join public.teams ta on ta.id=m.team_a_id
    left join public.teams tb on tb.id=m.team_b_id
    where m.status='scheduled' and t.state in ('ready','live')
      and not exists(select 1 from public.match_officials o where o.match_id=m.id and o.revoked_at is null)
    order by m.scheduled_for nulls last,m.round_number,m.match_number;
end;
$$;

create or replace function public.umpire_finalize_assigned_match(p_match_id uuid,p_winner_team_id uuid,p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.matches where id=p_match_id for update;
  if not found then raise exception 'Match not found'; end if;
  if not public.has_role('admin') or not exists(
    select 1 from public.match_officials
    where match_id=p_match_id and user_id=(select auth.uid()) and revoked_at is null
  ) then raise exception 'An active umpire assignment is required' using errcode='42501'; end if;
  perform public.admin_finalize_match_optional(p_match_id,p_winner_team_id,p_reason);
end;
$$;

-- These wrappers let admins omit free-text reasons while preserving the existing
-- guarded operations and their audit trail. A generic audit reason is used only
-- when no reason was supplied.
create or replace function public.admin_transition_tournament_optional(p_tournament_id uuid,p_new_state text,p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_transition_tournament(p_tournament_id,p_new_state,
    case when p_new_state='cancelled' then coalesce(nullif(trim(p_reason),''),'Cancelled by administrator') else p_reason end);
end; $$;

create or replace function public.admin_decide_team_optional(p_team_id uuid,p_approve boolean,p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_decide_team(p_team_id,p_approve,
    case when p_approve then p_reason else coalesce(nullif(trim(p_reason),''),'Team rejection by administrator') end);
end; $$;

create or replace function public.admin_cancel_match_optional(p_match_id uuid,p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_cancel_match(p_match_id,coalesce(nullif(trim(p_reason),''),'Cancelled by administrator'));
end; $$;

create or replace function public.admin_mark_match_abandoned_optional(p_match_id uuid,p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_mark_match_abandoned(p_match_id,coalesce(nullif(trim(p_reason),''),'Abandoned by administrator'));
end; $$;

create or replace function public.admin_finalize_match_optional(p_match_id uuid,p_winner_team_id uuid,p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_finalize_match(p_match_id,p_winner_team_id,coalesce(nullif(trim(p_reason),''),'Winner declared by administrator/umpire'));
end; $$;

create or replace function public.admin_reschedule_match_optional(p_match_id uuid,p_scheduled_for timestamptz,p_venue text,p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if nullif(trim(p_reason),'') is null then
    perform public.admin_schedule_match(p_match_id,p_scheduled_for,p_venue);
    perform public.write_audit('match_rescheduled','match',p_match_id,'Rescheduled by administrator');
  else
    perform public.admin_reschedule_match(p_match_id,p_scheduled_for,p_venue,p_reason);
  end if;
end; $$;

create or replace function public.admin_override_roster_optional(p_team_id uuid,p_user_id uuid,p_action text,p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_override_roster(p_team_id,p_user_id,p_action,coalesce(nullif(trim(p_reason),''),'Roster override by administrator'));
end; $$;

revoke all on function public.captain_add_team_member_by_username(uuid,text) from public,anon,authenticated;
revoke all on function public.list_team_roster_with_username(uuid) from public,anon,authenticated;
revoke all on function public.admin_join_match_as_official(uuid) from public,anon,authenticated;
revoke all on function public.admin_list_my_umpire_matches() from public,anon,authenticated;
revoke all on function public.admin_list_open_umpire_matches() from public,anon,authenticated;
revoke all on function public.umpire_finalize_assigned_match(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.admin_transition_tournament_optional(uuid,text,text) from public,anon,authenticated;
revoke all on function public.admin_decide_team_optional(uuid,boolean,text) from public,anon,authenticated;
revoke all on function public.admin_cancel_match_optional(uuid,text) from public,anon,authenticated;
revoke all on function public.admin_mark_match_abandoned_optional(uuid,text) from public,anon,authenticated;
revoke all on function public.admin_finalize_match_optional(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.admin_reschedule_match_optional(uuid,timestamptz,text,text) from public,anon,authenticated;
revoke all on function public.admin_override_roster_optional(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.captain_add_team_member_by_username(uuid,text) to authenticated;
grant execute on function public.list_team_roster_with_username(uuid) to authenticated;
grant execute on function public.admin_join_match_as_official(uuid) to authenticated;
grant execute on function public.admin_list_my_umpire_matches() to authenticated;
grant execute on function public.admin_list_open_umpire_matches() to authenticated;
grant execute on function public.umpire_finalize_assigned_match(uuid,uuid,text) to authenticated;
grant execute on function public.admin_transition_tournament_optional(uuid,text,text) to authenticated;
grant execute on function public.admin_decide_team_optional(uuid,boolean,text) to authenticated;
grant execute on function public.admin_cancel_match_optional(uuid,text) to authenticated;
grant execute on function public.admin_mark_match_abandoned_optional(uuid,text) to authenticated;
grant execute on function public.admin_finalize_match_optional(uuid,uuid,text) to authenticated;
grant execute on function public.admin_reschedule_match_optional(uuid,timestamptz,text,text) to authenticated;
grant execute on function public.admin_override_roster_optional(uuid,uuid,text,text) to authenticated;
