-- Stage 2: tournament lifecycle, team registration, membership, roster controls,
-- invitation secrets, administrative overrides, and audit history.
create extension if not exists pgcrypto;

create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 100),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text not null default '' check (char_length(description) <= 4000),
  venue text not null default '' check (char_length(venue) <= 200),
  starts_on date,
  ends_on date,
  registration_deadline timestamptz,
  format text not null default 'knockout' check (format in ('knockout')),
  team_limit integer not null default 16 check (team_limit between 2 and 64),
  roster_min integer not null default 2 check (roster_min between 1 and 30),
  roster_max integer not null default 12 check (roster_max between 1 and 30),
  scoring_rules jsonb not null default '{"overs_per_innings":6,"wickets_per_innings":5,"wide_runs":1,"no_ball_runs":1,"tie_rule":"super_over"}'::jsonb,
  state text not null default 'draft' check (state in ('draft','registration_open','registration_closed','ready','live','completed','cancelled')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (roster_min <= roster_max),
  check (starts_on is null or ends_on is null or starts_on <= ends_on)
);
create index tournaments_public_state_idx on public.tournaments(state, starts_on);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id),
  name text not null check (char_length(trim(name)) between 2 and 60),
  captain_id uuid not null references auth.users(id),
  status text not null default 'pending' check (status in ('pending','approved','rejected','withdrawn')),
  roster_locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tournament_id)
);
create unique index teams_tournament_name_lower_idx on public.teams(tournament_id, lower(name)) where status <> 'withdrawn';
create index teams_tournament_status_idx on public.teams(tournament_id, status);

-- One current/most recent team request per user per tournament. Withdrawn or
-- rejected requests can be replaced only through a later authorized operation.
create table public.tournament_members (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id),
  team_id uuid not null,
  user_id uuid not null references auth.users(id),
  status text not null check (status in ('pending','active','rejected','withdrawn')),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users(id),
  unique (tournament_id, user_id),
  unique (tournament_id, user_id, team_id),
  foreign key (team_id, tournament_id) references public.teams(id, tournament_id)
);
create index tournament_members_team_status_idx on public.tournament_members(team_id, status);

create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null,
  team_id uuid not null,
  user_id uuid not null references auth.users(id),
  role text not null default 'player' check (role in ('captain','player')),
  status text not null default 'active' check (status in ('active','withdrawn')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  unique (team_id, user_id),
  foreign key (team_id, tournament_id) references public.teams(id, tournament_id),
  check ((status = 'active' and left_at is null) or (status = 'withdrawn' and left_at is not null))
);
create unique index team_members_one_active_team_idx on public.team_members(tournament_id, user_id) where status = 'active';
create index team_members_team_status_idx on public.team_members(team_id, status);

create table public.team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id),
  token_hash bytea not null unique,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id),
  check (expires_at > created_at)
);
create index team_invites_team_active_idx on public.team_invites(team_id, expires_at) where revoked_at is null;

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid not null,
  reason text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_entity_idx on public.audit_logs(entity_type, entity_id, created_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_unread_idx on public.notifications(user_id, created_at desc) where read_at is null;

create or replace function public.has_role(p_role text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists(select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = p_role);
$$;
revoke all on function public.has_role(text) from public, anon;
grant execute on function public.has_role(text) to authenticated;

create or replace function public.is_team_captain(p_team_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists(select 1 from public.teams t where t.id = p_team_id and t.captain_id = (select auth.uid()))
    and exists(select 1 from public.team_members m where m.team_id = p_team_id and m.user_id = (select auth.uid()) and m.role = 'captain' and m.status = 'active');
$$;
revoke all on function public.is_team_captain(uuid) from public, anon;
grant execute on function public.is_team_captain(uuid) to authenticated;

create or replace function public.write_audit(
  p_action text, p_entity_type text, p_entity_id uuid, p_reason text default null, p_details jsonb default '{}'::jsonb
) returns void language sql security definer set search_path = '' as $$
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, reason, details)
  values ((select auth.uid()), p_action, p_entity_type, p_entity_id, p_reason, coalesce(p_details, '{}'::jsonb));
$$;
revoke all on function public.write_audit(text,text,uuid,text,jsonb) from public, anon, authenticated;

-- Resolve pgcrypto's installed schema from its extension catalog because
-- Supabase commonly installs extensions outside public.
create or replace function public.hash_team_invite(p_code text)
returns bytea language plpgsql security definer set search_path = '' as $$
declare v_schema text; v_hash bytea;
begin
  select n.nspname into v_schema from pg_catalog.pg_extension e join pg_catalog.pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto';
  if v_schema is null then raise exception 'pgcrypto extension is required'; end if;
  execute pg_catalog.format('select %I.digest(pg_catalog.convert_to($1,''UTF8''),''sha256'')',v_schema) into v_hash using p_code;
  return v_hash;
end;
$$;
revoke all on function public.hash_team_invite(text) from public, anon, authenticated;

create or replace function public.validate_scoring_rules(p_rules jsonb)
returns jsonb language plpgsql immutable security definer set search_path = '' as $$
declare v_rules jsonb; v_value text;
begin
  v_rules := '{"overs_per_innings":6,"wickets_per_innings":5,"wide_runs":1,"no_ball_runs":1,"tie_rule":"super_over"}'::jsonb || coalesce(p_rules,'{}'::jsonb);
  if jsonb_typeof(v_rules) <> 'object' then raise exception 'Scoring rules must be a JSON object'; end if;
  foreach v_value in array array[v_rules->>'overs_per_innings',v_rules->>'wickets_per_innings',v_rules->>'wide_runs',v_rules->>'no_ball_runs'] loop
    if v_value is null or v_value !~ '^[0-9]+$' then raise exception 'Scoring rule limits must be whole numbers'; end if;
  end loop;
  if (v_rules->>'overs_per_innings')::integer not between 1 and 50 then raise exception 'Overs per innings must be 1–50'; end if;
  if (v_rules->>'wickets_per_innings')::integer not between 1 and 10 then raise exception 'Wickets per innings must be 1–10'; end if;
  if (v_rules->>'wide_runs')::integer not between 1 and 5 or (v_rules->>'no_ball_runs')::integer not between 1 and 5 then raise exception 'Wide and no-ball extras must be 1–5'; end if;
  if coalesce(v_rules->>'tie_rule','') not in ('super_over','bowl_out','shared') then raise exception 'Unsupported tie resolution'; end if;
  return v_rules;
end;
$$;

-- Exposed tables are read-only to clients; all writes go through scoped RPCs.
alter table public.tournaments enable row level security;
alter table public.teams enable row level security;
alter table public.tournament_members enable row level security;
alter table public.team_members enable row level security;
alter table public.team_invites enable row level security;
alter table public.audit_logs enable row level security;
alter table public.notifications enable row level security;

create policy "Public can view non-draft tournaments" on public.tournaments
  for select to anon using (state <> 'draft');
create policy "Authenticated can view public and admin tournaments" on public.tournaments
  for select to authenticated using (state <> 'draft' or public.has_role('admin'));
create policy "Public can view approved teams" on public.teams
  for select to anon using (status = 'approved');
create policy "Team members and admins can view teams" on public.teams
  for select to authenticated using (status = 'approved' or captain_id = (select auth.uid()) or public.has_role('admin') or exists(select 1 from public.team_members m where m.team_id=id and m.user_id=(select auth.uid()) and m.status='active') or exists(select 1 from public.tournament_members tm where tm.team_id=id and tm.user_id=(select auth.uid())));
create policy "Users and team captains can view membership rows" on public.tournament_members
  for select to authenticated using (user_id = (select auth.uid()) or public.is_team_captain(team_id) or public.has_role('admin'));
create policy "Users and team captains can view roster rows" on public.team_members
  for select to authenticated using (user_id = (select auth.uid()) or public.is_team_captain(team_id) or public.has_role('admin'));
create policy "Admins can view audit history" on public.audit_logs
  for select to authenticated using (public.has_role('admin'));
create policy "Users can view their notifications" on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Users can mark their notifications read" on public.notifications
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.tournaments, public.teams, public.tournament_members, public.team_members, public.team_invites, public.audit_logs, public.notifications from anon, authenticated;
grant select on public.tournaments, public.teams to anon, authenticated;
grant select on public.tournament_members, public.team_members, public.audit_logs, public.notifications to authenticated;

create or replace function public.admin_create_tournament(
  p_name text, p_slug text, p_description text default '', p_venue text default '',
  p_starts_on date default null, p_ends_on date default null, p_registration_deadline timestamptz default null,
  p_team_limit integer default 16, p_roster_min integer default 2, p_roster_max integer default 12, p_scoring_rules jsonb default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.has_role('admin') then raise exception 'admin role required' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_name,''))) not between 2 and 100 then raise exception 'Tournament name must be 2–100 characters'; end if;
  if p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then raise exception 'Slug must contain lowercase letters, numbers, and hyphens'; end if;
  if p_roster_min < 1 or p_roster_max < p_roster_min or p_roster_max > 30 then raise exception 'Invalid roster limits'; end if;
  insert into public.tournaments(name, slug, description, venue, starts_on, ends_on, registration_deadline, team_limit, roster_min, roster_max, scoring_rules, created_by)
  values (trim(p_name), p_slug, coalesce(p_description,''), coalesce(p_venue,''), p_starts_on, p_ends_on, p_registration_deadline, p_team_limit, p_roster_min, p_roster_max,
    public.validate_scoring_rules(p_scoring_rules), (select auth.uid())) returning id into v_id;
  perform public.write_audit('tournament_created','tournament',v_id,null,jsonb_build_object('name',trim(p_name)));
  return v_id;
end;
$$;

create or replace function public.admin_update_draft_tournament(
  p_tournament_id uuid, p_name text, p_slug text, p_description text, p_venue text,
  p_starts_on date, p_ends_on date, p_registration_deadline timestamptz,
  p_team_limit integer, p_roster_min integer, p_roster_max integer, p_scoring_rules jsonb
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_role('admin') then raise exception 'admin role required' using errcode = '42501'; end if;
  if p_roster_min < 1 or p_roster_max < p_roster_min or p_roster_max > 30 or p_team_limit not between 2 and 64 then raise exception 'Invalid tournament limits'; end if;
  update public.tournaments set name=trim(p_name), slug=p_slug, description=coalesce(p_description,''), venue=coalesce(p_venue,''), starts_on=p_starts_on,
    ends_on=p_ends_on, registration_deadline=p_registration_deadline, team_limit=p_team_limit, roster_min=p_roster_min, roster_max=p_roster_max,
    scoring_rules=case when p_scoring_rules is null then scoring_rules else public.validate_scoring_rules(p_scoring_rules) end, updated_at=now()
  where id=p_tournament_id and state='draft';
  if not found then raise exception 'Only draft tournaments can be edited'; end if;
  perform public.write_audit('tournament_updated','tournament',p_tournament_id);
end;
$$;

create or replace function public.admin_transition_tournament(p_tournament_id uuid, p_new_state text, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_old text;
begin
  if not public.has_role('admin') then raise exception 'admin role required' using errcode = '42501'; end if;
  select state into v_old from public.tournaments where id=p_tournament_id for update;
  if v_old is null then raise exception 'Tournament not found'; end if;
  if p_new_state='cancelled' then
    if v_old in ('completed','cancelled') then raise exception 'Tournament cannot be cancelled from its current state'; end if;
  elsif not ((v_old='draft' and p_new_state='registration_open') or (v_old='registration_open' and p_new_state='registration_closed')) then
    raise exception 'Invalid tournament state transition';
  end if;
  if p_new_state='registration_open' and exists(select 1 from public.tournaments where id=p_tournament_id and registration_deadline is not null and registration_deadline<now()) then
    raise exception 'Registration deadline has passed';
  end if;
  if p_new_state='cancelled' and char_length(trim(coalesce(p_reason,''))) < 8 then raise exception 'Cancellation reason must be at least 8 characters'; end if;
  update public.tournaments set state=p_new_state, updated_at=now() where id=p_tournament_id;
  perform public.write_audit('tournament_state_changed','tournament',p_tournament_id,p_reason,jsonb_build_object('from',v_old,'to',p_new_state));
end;
$$;

create or replace function public.create_team(p_tournament_id uuid, p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_team uuid; v_t public.tournaments%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'Sign in required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_tournament_id::text || ':' || (select auth.uid())::text, 0));
  select * into v_t from public.tournaments where id=p_tournament_id for update;
  if not found or v_t.state <> 'registration_open' then raise exception 'Registration is not open'; end if;
  if v_t.registration_deadline is not null and v_t.registration_deadline < now() then raise exception 'Registration deadline has passed'; end if;
  if exists(select 1 from public.tournament_members where tournament_id=p_tournament_id and user_id=(select auth.uid()) and status in ('pending','active')) then raise exception 'You already have a request or team in this tournament'; end if;
  if (select count(*) from public.teams where tournament_id=p_tournament_id and status not in ('withdrawn','rejected')) >= v_t.team_limit then raise exception 'Tournament team limit reached'; end if;
  if char_length(trim(coalesce(p_name,''))) not between 2 and 60 then raise exception 'Team name must be 2–60 characters'; end if;
  insert into public.teams(tournament_id,name,captain_id) values(p_tournament_id,trim(p_name),(select auth.uid())) returning id into v_team;
  insert into public.tournament_members(tournament_id,team_id,user_id,status,decided_at,decided_by) values(p_tournament_id,v_team,(select auth.uid()),'active',now(),(select auth.uid()))
    on conflict(tournament_id,user_id) do update set team_id=excluded.team_id,status='active',requested_at=now(),decided_at=now(),decided_by=(select auth.uid());
  insert into public.team_members(tournament_id,team_id,user_id,role) values(p_tournament_id,v_team,(select auth.uid()),'captain')
    on conflict(team_id,user_id) do update set role='captain',status='active',joined_at=now(),left_at=null;
  insert into public.user_roles(user_id,role,assigned_by) values((select auth.uid()),'captain',(select auth.uid())) on conflict(user_id,role) do nothing;
  perform public.write_audit('team_created','team',v_team,null,jsonb_build_object('tournament_id',p_tournament_id,'name',trim(p_name)));
  return v_team;
end;
$$;

create or replace function public.create_team_invite(p_team_id uuid, p_expires_in_days integer default 7)
returns text language plpgsql security definer set search_path = '' as $$
declare v_code text; v_tournament uuid;
begin
  if not public.is_team_captain(p_team_id) then raise exception 'Captain permission required' using errcode='42501'; end if;
  if p_expires_in_days not between 1 and 30 then raise exception 'Invite expiry must be 1–30 days'; end if;
  select tournament_id into v_tournament from public.teams where id=p_team_id and roster_locked_at is null and status not in ('withdrawn','rejected');
  if v_tournament is null then raise exception 'Team roster is locked or team is inactive'; end if;
  if not exists(select 1 from public.tournaments where id=v_tournament and state='registration_open') then raise exception 'Registration is closed'; end if;
  v_code := replace(gen_random_uuid()::text,'-','');
  insert into public.team_invites(team_id,token_hash,created_by,expires_at) values(p_team_id,public.hash_team_invite(v_code),(select auth.uid()),now()+make_interval(days=>p_expires_in_days));
  perform public.write_audit('invite_created','team',p_team_id,null,jsonb_build_object('expires_in_days',p_expires_in_days));
  return v_code;
end;
$$;

create or replace function public.request_team_membership(p_invite_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_team public.teams%rowtype; v_membership uuid; v_t public.tournaments%rowtype; v_invite public.team_invites%rowtype; v_existing public.tournament_members%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if char_length(trim(coalesce(p_invite_code,''))) <> 32 then raise exception 'Invite is invalid, expired, or revoked'; end if;
  select * into v_invite from public.team_invites where token_hash=public.hash_team_invite(trim(p_invite_code)) for update;
  if not found or v_invite.revoked_at is not null or v_invite.expires_at<=now() then raise exception 'Invite is invalid, expired, or revoked'; end if;
  select * into v_team from public.teams where id=v_invite.team_id for update;
  if v_team.status in ('withdrawn','rejected') then raise exception 'Team is not accepting members'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_team.tournament_id::text || ':' || (select auth.uid())::text, 0));
  select * into v_t from public.tournaments where id=v_team.tournament_id for update;
  if v_t.state <> 'registration_open' or (v_t.registration_deadline is not null and v_t.registration_deadline<now()) then raise exception 'Registration is closed'; end if;
  if v_team.roster_locked_at is not null then raise exception 'Team roster is locked'; end if;
  if (select count(*) from public.tournament_members where team_id=v_team.id and status in ('pending','active')) >= v_t.roster_max then raise exception 'Team has reached its roster limit, including pending requests'; end if;
  select * into v_existing from public.tournament_members where tournament_id=v_team.tournament_id and user_id=(select auth.uid()) for update;
  if found then
    if v_existing.status in ('pending','active') then raise exception 'You already have a membership request or team in this tournament'; end if;
    update public.tournament_members set team_id=v_team.id,status='pending',requested_at=now(),decided_at=null,decided_by=null where id=v_existing.id returning id into v_membership;
  else
    insert into public.tournament_members(tournament_id,team_id,user_id,status) values(v_team.tournament_id,v_team.id,(select auth.uid()),'pending') returning id into v_membership;
  end if;
  insert into public.notifications(user_id,kind,title,body) values(v_team.captain_id,'membership_request','New team request','A player requested to join your team.');
  perform public.write_audit('membership_requested','team',v_team.id,null,jsonb_build_object('user_id',(select auth.uid())));
  return v_membership;
end;
$$;

create or replace function public.decide_team_membership(p_team_id uuid, p_user_id uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_tm public.tournament_members%rowtype; v_locked timestamptz; v_max integer;
begin
  if not public.is_team_captain(p_team_id) then raise exception 'Captain permission required' using errcode='42501'; end if;
  select * into v_tm from public.tournament_members where team_id=p_team_id and user_id=p_user_id and status='pending' for update;
  if not found then raise exception 'Pending membership request not found'; end if;
  select t.roster_locked_at, tr.roster_max into v_locked,v_max from public.teams t join public.tournaments tr on tr.id=t.tournament_id where t.id=p_team_id for update of t;
  if v_locked is not null then raise exception 'Team roster is locked'; end if;
  if p_approve and (select count(*) from public.team_members where team_id=p_team_id and status='active') >= v_max then raise exception 'Roster limit reached'; end if;
  update public.tournament_members set status=case when p_approve then 'active' else 'rejected' end, decided_at=now(), decided_by=(select auth.uid()) where id=v_tm.id;
  if p_approve then
    insert into public.team_members(tournament_id,team_id,user_id,role) values(v_tm.tournament_id,p_team_id,p_user_id,'player')
      on conflict(team_id,user_id) do update set role='player',status='active',joined_at=now(),left_at=null;
    insert into public.user_roles(user_id,role,assigned_by) values(p_user_id,'player',(select auth.uid())) on conflict(user_id,role) do nothing;
  end if;
  insert into public.notifications(user_id,kind,title,body) values(p_user_id,case when p_approve then 'membership_approved' else 'membership_rejected' end,
    case when p_approve then 'You joined the team' else 'Team request declined' end,'Your team membership request was reviewed.');
  perform public.write_audit(case when p_approve then 'membership_approved' else 'membership_rejected' end,'team',p_team_id,null,jsonb_build_object('user_id',p_user_id));
end;
$$;

create or replace function public.list_team_roster(p_team_id uuid)
returns table(user_id uuid, full_name text, member_role text, membership_status text, requested_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_team_captain(p_team_id) and not public.has_role('admin') and not exists(select 1 from public.team_members m where m.team_id=p_team_id and m.user_id=(select auth.uid()) and m.status='active') then
    raise exception 'Team membership required' using errcode='42501';
  end if;
  return query select tm.user_id, coalesce(p.full_name,''), coalesce(m.role,'player'), tm.status, tm.requested_at
    from public.tournament_members tm join public.profiles p on p.id=tm.user_id
    left join public.team_members m on m.tournament_id=tm.tournament_id and m.team_id=tm.team_id and m.user_id=tm.user_id
    where tm.team_id=p_team_id and tm.status in ('pending','active') order by (tm.status='pending') desc, tm.requested_at;
end;
$$;

create or replace function public.list_team_invites(p_team_id uuid)
returns table(id uuid, created_at timestamptz, expires_at timestamptz, revoked_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_team_captain(p_team_id) and not public.has_role('admin') then raise exception 'Captain permission required' using errcode='42501'; end if;
  return query select i.id,i.created_at,i.expires_at,i.revoked_at from public.team_invites i where i.team_id=p_team_id order by i.created_at desc;
end;
$$;

create or replace function public.revoke_team_invite(p_invite_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_team uuid;
begin
  select team_id into v_team from public.team_invites where id=p_invite_id;
  if v_team is null then raise exception 'Invite not found'; end if;
  if not public.is_team_captain(v_team) and not public.has_role('admin') then raise exception 'Captain permission required' using errcode='42501'; end if;
  update public.team_invites set revoked_at=now(), revoked_by=(select auth.uid()) where id=p_invite_id and revoked_at is null;
  if found then perform public.write_audit('invite_revoked','team',v_team); end if;
end;
$$;

create or replace function public.lock_team_roster(p_team_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_tournament uuid; v_min integer; v_max integer; v_count integer;
begin
  if not public.is_team_captain(p_team_id) then raise exception 'Captain permission required' using errcode='42501'; end if;
  select tr.id,tr.roster_min,tr.roster_max into v_tournament,v_min,v_max from public.teams t join public.tournaments tr on tr.id=t.tournament_id
    where t.id=p_team_id and t.roster_locked_at is null and t.status <> 'withdrawn' for update of t;
  if v_tournament is null then raise exception 'Team is already locked or inactive'; end if;
  if exists(select 1 from public.tournament_members where team_id=p_team_id and status='pending') then raise exception 'Resolve pending membership requests before locking'; end if;
  select count(*) into v_count from public.team_members where team_id=p_team_id and status='active';
  if v_count < v_min or v_count > v_max then raise exception 'Roster must contain between % and % active players',v_min,v_max; end if;
  update public.teams set roster_locked_at=now(),updated_at=now() where id=p_team_id;
  perform public.write_audit('roster_locked','team',p_team_id,null,jsonb_build_object('member_count',v_count));
end;
$$;

create or replace function public.withdraw_from_team(p_team_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_m public.team_members%rowtype;
begin
  select * into v_m from public.team_members where team_id=p_team_id and user_id=(select auth.uid()) and status='active' for update;
  if not found then raise exception 'Active team membership not found'; end if;
  if v_m.role='captain' then raise exception 'Transfer captaincy before withdrawing'; end if;
  update public.team_members set status='withdrawn',left_at=now() where id=v_m.id;
  update public.tournament_members set status='withdrawn',decided_at=now(),decided_by=(select auth.uid()) where tournament_id=v_m.tournament_id and team_id=p_team_id and user_id=(select auth.uid());
  perform public.write_audit('player_withdrew','team',p_team_id);
end;
$$;

create or replace function public.withdraw_team(p_team_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_tournament uuid;
begin
  if not public.is_team_captain(p_team_id) then raise exception 'Captain permission required' using errcode='42501'; end if;
  update public.teams set status='withdrawn',updated_at=now() where id=p_team_id and status <> 'withdrawn' returning tournament_id into v_tournament;
  if v_tournament is null then raise exception 'Team not active'; end if;
  update public.tournament_members set status='withdrawn',decided_at=now(),decided_by=(select auth.uid()) where team_id=p_team_id and status in ('pending','active');
  update public.team_members set status='withdrawn',left_at=now() where team_id=p_team_id and status='active';
  perform public.write_audit('team_withdrew','team',p_team_id);
end;
$$;

create or replace function public.transfer_team_captain(p_team_id uuid, p_new_captain uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_member public.team_members%rowtype; v_old uuid;
begin
  if not public.is_team_captain(p_team_id) then raise exception 'Captain permission required' using errcode='42501'; end if;
  select captain_id into v_old from public.teams where id=p_team_id for update;
  if exists(select 1 from public.teams where id=p_team_id and roster_locked_at is not null) then raise exception 'Roster must be unlocked to transfer captaincy'; end if;
  select * into v_member from public.team_members where team_id=p_team_id and user_id=p_new_captain and status='active' for update;
  if not found then raise exception 'New captain must be an active team member'; end if;
  update public.team_members set role='player' where team_id=p_team_id and user_id=v_old and status='active';
  update public.team_members set role='captain' where team_id=p_team_id and user_id=p_new_captain;
  update public.teams set captain_id=p_new_captain,updated_at=now() where id=p_team_id;
  insert into public.user_roles(user_id,role,assigned_by) values(p_new_captain,'captain',(select auth.uid())) on conflict(user_id,role) do nothing;
  perform public.write_audit('captain_transferred','team',p_team_id,null,jsonb_build_object('from',v_old,'to',p_new_captain));
end;
$$;

create or replace function public.admin_decide_team(p_team_id uuid, p_approve boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_locked timestamptz; v_status text; v_count integer; v_min integer; v_max integer;
begin
  if not public.has_role('admin') then raise exception 'admin role required' using errcode='42501'; end if;
  select t.roster_locked_at,t.status,tr.roster_min,tr.roster_max into v_locked,v_status,v_min,v_max from public.teams t join public.tournaments tr on tr.id=t.tournament_id where t.id=p_team_id for update of t;
  if v_status is null or v_status='withdrawn' then raise exception 'Team not eligible for review'; end if;
  if p_approve then
    if v_locked is null then raise exception 'Team roster must be locked before approval'; end if;
    select count(*) into v_count from public.team_members where team_id=p_team_id and status='active';
    if v_count < v_min or v_count > v_max then raise exception 'Team roster count is outside the tournament limits'; end if;
    update public.teams set status='approved',updated_at=now() where id=p_team_id;
  else
    if char_length(trim(coalesce(p_reason,''))) < 8 then raise exception 'Rejection reason must be at least 8 characters'; end if;
    update public.teams set status='rejected',updated_at=now() where id=p_team_id;
  end if;
  perform public.write_audit(case when p_approve then 'team_approved' else 'team_rejected' end,'team',p_team_id,p_reason);
  insert into public.notifications(user_id,kind,title,body) select captain_id,case when p_approve then 'team_approved' else 'team_rejected' end,
    case when p_approve then 'Team approved' else 'Team review update' end,coalesce(p_reason,'Your team was approved for the tournament.') from public.teams where id=p_team_id;
end;
$$;

create or replace function public.admin_override_roster(p_team_id uuid, p_user_id uuid, p_action text, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_team public.teams%rowtype; v_tournament public.tournaments%rowtype; v_member public.tournament_members%rowtype; v_count integer;
begin
  if not public.has_role('admin') then raise exception 'admin role required' using errcode='42501'; end if;
  if char_length(trim(coalesce(p_reason,''))) < 8 then raise exception 'Override reason must be at least 8 characters'; end if;
  select * into v_team from public.teams where id=p_team_id for update;
  if not found then raise exception 'Team not found'; end if;
  select * into v_tournament from public.tournaments where id=v_team.tournament_id;
  if p_action='unlock' then
    if v_team.roster_locked_at is null then raise exception 'Roster is not locked'; end if;
    update public.teams set roster_locked_at=null,status='pending',updated_at=now() where id=p_team_id;
  elsif p_action='approve_member' then
    if v_team.roster_locked_at is not null then raise exception 'Unlock the roster before changing members'; end if;
    select * into v_member from public.tournament_members where team_id=p_team_id and user_id=p_user_id and status='pending' for update;
    if not found then raise exception 'Pending request not found'; end if;
    select count(*) into v_count from public.team_members where team_id=p_team_id and status='active';
    if v_count >= v_tournament.roster_max then raise exception 'Roster limit reached'; end if;
    update public.tournament_members set status='active',decided_at=now(),decided_by=(select auth.uid()) where id=v_member.id;
    insert into public.team_members(tournament_id,team_id,user_id,role) values(v_member.tournament_id,p_team_id,p_user_id,'player')
      on conflict(team_id,user_id) do update set role='player',status='active',joined_at=now(),left_at=null;
  elsif p_action='withdraw_member' then
    if v_team.roster_locked_at is not null then raise exception 'Unlock the roster before changing members'; end if;
    if not exists(select 1 from public.team_members where team_id=p_team_id and user_id=p_user_id and status='active' and role <> 'captain') then raise exception 'Active non-captain member not found'; end if;
    update public.team_members set status='withdrawn',left_at=now() where team_id=p_team_id and user_id=p_user_id and status='active';
    update public.tournament_members set status='withdrawn',decided_at=now(),decided_by=(select auth.uid()) where team_id=p_team_id and user_id=p_user_id and status='active';
  else raise exception 'Unsupported roster override action';
  end if;
  perform public.write_audit('roster_override','team',p_team_id,p_reason,jsonb_build_object('action',p_action,'user_id',p_user_id));
end;
$$;

create or replace function public.mark_notification_read(p_notification_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.notifications set read_at=coalesce(read_at,now()) where id=p_notification_id and user_id=(select auth.uid());
  if not found then raise exception 'Notification not found'; end if;
end;
$$;

-- Only the explicitly listed RPCs are callable by authenticated clients.
revoke execute on all functions in schema public from public;
revoke all on function public.validate_scoring_rules(jsonb) from public, anon, authenticated;
grant execute on function public.admin_create_tournament(text,text,text,text,date,date,timestamptz,integer,integer,integer,jsonb) to authenticated;
grant execute on function public.admin_update_draft_tournament(uuid,text,text,text,text,date,date,timestamptz,integer,integer,integer,jsonb) to authenticated;
grant execute on function public.admin_transition_tournament(uuid,text,text) to authenticated;
grant execute on function public.create_team(uuid,text) to authenticated;
grant execute on function public.create_team_invite(uuid,integer) to authenticated;
grant execute on function public.request_team_membership(text) to authenticated;
grant execute on function public.decide_team_membership(uuid,uuid,boolean) to authenticated;
grant execute on function public.list_team_roster(uuid) to authenticated;
grant execute on function public.list_team_invites(uuid) to authenticated;
grant execute on function public.revoke_team_invite(uuid) to authenticated;
grant execute on function public.lock_team_roster(uuid) to authenticated;
grant execute on function public.withdraw_from_team(uuid) to authenticated;
grant execute on function public.withdraw_team(uuid) to authenticated;
grant execute on function public.transfer_team_captain(uuid,uuid) to authenticated;
grant execute on function public.admin_decide_team(uuid,boolean,text) to authenticated;
grant execute on function public.admin_override_roster(uuid,uuid,text,text) to authenticated;
grant execute on function public.mark_notification_read(uuid) to authenticated;

