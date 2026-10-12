-- Stage 3: persisted single-elimination brackets, match scheduling and officials.
create table public.tournament_stages (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete restrict,
  round_number integer not null check (round_number > 0),
  name text not null,
  match_count integer not null check (match_count > 0),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tournament_id, round_number),
  unique (id, tournament_id)
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete restrict,
  stage_id uuid not null,
  round_number integer not null check (round_number > 0),
  match_number integer not null check (match_number > 0),
  seed_a integer,
  seed_b integer,
  team_a_id uuid references public.teams(id) on delete restrict,
  team_b_id uuid references public.teams(id) on delete restrict,
  source_match_a_id uuid references public.matches(id) on delete restrict,
  source_match_b_id uuid references public.matches(id) on delete restrict,
  status text not null default 'waiting' check (status in ('draft','scheduled','waiting','bye','completed','cancelled','abandoned')),
  winner_team_id uuid references public.teams(id) on delete restrict,
  scheduled_for timestamptz,
  venue text not null default '',
  result_note text,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (stage_id, match_number),
  unique (id, tournament_id),
  foreign key (stage_id, tournament_id) references public.tournament_stages(id, tournament_id),
  check (team_a_id is null or team_b_id is null or team_a_id <> team_b_id),
  check (winner_team_id is null or winner_team_id = team_a_id or winner_team_id = team_b_id),
  check (source_match_a_id is null or source_match_a_id <> id),
  check (source_match_b_id is null or source_match_b_id <> id)
);
create index matches_tournament_round_idx on public.matches(tournament_id,round_number,match_number);
create index matches_status_schedule_idx on public.matches(status,scheduled_for);

create table public.match_officials (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  assigned_by uuid not null references auth.users(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete restrict,
  unique (match_id,user_id,assigned_at)
);
create unique index match_officials_one_active_idx on public.match_officials(match_id) where revoked_at is null;
create index match_officials_user_active_idx on public.match_officials(user_id,match_id) where revoked_at is null;

create table public.tournament_advancements (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete restrict,
  match_id uuid not null references public.matches(id) on delete restrict,
  team_id uuid not null references public.teams(id) on delete restrict,
  advancement_type text not null check (advancement_type in ('bye','match_win','administrative_result')),
  created_at timestamptz not null default now(),
  unique (match_id),
  foreign key (match_id,tournament_id) references public.matches(id,tournament_id)
);
create index tournament_advancements_team_idx on public.tournament_advancements(tournament_id,team_id);

alter table public.tournament_stages enable row level security;
alter table public.matches enable row level security;
alter table public.match_officials enable row level security;
alter table public.tournament_advancements enable row level security;

create policy "Published brackets are public" on public.tournament_stages
  for select to anon,authenticated using (exists(select 1 from public.tournaments t where t.id=tournament_id and t.state in ('ready','live','completed')) or public.has_role('admin'));
create policy "Published fixtures and admin match rows are visible" on public.matches
  for select to anon,authenticated using (exists(select 1 from public.tournaments t where t.id=tournament_id and t.state in ('ready','live','completed')) or public.has_role('admin') or exists(select 1 from public.match_officials o where o.match_id=id and o.user_id=(select auth.uid()) and o.revoked_at is null));
create policy "Match official assignments are private" on public.match_officials
  for select to authenticated using (public.has_role('admin') or user_id=(select auth.uid()));
create policy "Published advancement events are public" on public.tournament_advancements
  for select to anon,authenticated using (exists(select 1 from public.tournaments t where t.id=tournament_id and t.state in ('ready','live','completed')) or public.has_role('admin'));

revoke all on public.tournament_stages,public.matches,public.match_officials,public.tournament_advancements from anon,authenticated;
grant select on public.tournament_stages,public.matches,public.tournament_advancements to anon,authenticated;
grant select on public.match_officials to authenticated;

create or replace function public.admin_generate_fixtures(p_tournament_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_t public.tournaments%rowtype;
  v_teams uuid[];
  v_order integer[] := array[1,2];
  v_previous integer[];
  v_bracket_size integer := 2;
  v_round integer := 1;
  v_round_matches integer;
  v_stage uuid;
  v_ids uuid[];
  v_previous_start integer := 1;
  v_current_start integer;
  v_max_round integer;
  v_team_a uuid;
  v_team_b uuid;
  v_seed_a integer;
  v_seed_b integer;
  v_match uuid;
  v_source_a uuid;
  v_source_b uuid;
  v_name text;
  i integer;
  j integer;
begin
  if not public.has_role('admin') then raise exception 'admin role required' using errcode='42501'; end if;
  select * into v_t from public.tournaments where id=p_tournament_id for update;
  if not found or v_t.state <> 'registration_closed' then raise exception 'Close registration before generating fixtures'; end if;
  if exists(select 1 from public.tournament_stages where tournament_id=p_tournament_id) then raise exception 'Fixtures already exist for this tournament'; end if;
  if (select count(*) from public.teams where tournament_id=p_tournament_id and status='approved' and roster_locked_at is not null) < 2 then raise exception 'At least two approved teams with locked rosters are required'; end if;
  if exists(select 1 from public.teams where tournament_id=p_tournament_id and status='approved' and roster_locked_at is null) then raise exception 'Every approved team must have a locked roster'; end if;
  select array_agg(id order by created_at,id) into v_teams from public.teams where tournament_id=p_tournament_id and status='approved' and roster_locked_at is not null;
  if cardinality(v_teams)>v_t.team_limit then raise exception 'Approved team count exceeds tournament limit'; end if;
  while v_bracket_size < cardinality(v_teams) loop v_bracket_size := v_bracket_size * 2; end loop;
  while cardinality(v_order) < v_bracket_size loop
    v_previous := v_order;
    v_order := array[]::integer[];
    foreach i in array v_previous loop
      v_order := array_append(v_order,i);
      v_order := array_append(v_order,2*cardinality(v_previous)+1-i);
    end loop;
  end loop;
  v_round_matches := v_bracket_size/2;
  v_ids := array[]::uuid[];
  v_round := 1;
  while v_round_matches >= 1 loop
    v_name := case when v_round_matches=1 then 'Final' when v_round_matches=2 then 'Semifinal' when v_round_matches=4 then 'Quarterfinal' else 'Round of ' || (v_round_matches*2)::text end;
    insert into public.tournament_stages(tournament_id,round_number,name,match_count) values(p_tournament_id,v_round,v_name,v_round_matches) returning id into v_stage;
    v_current_start := cardinality(v_ids)+1;
    for j in 1..v_round_matches loop
      v_team_a := null; v_team_b := null; v_seed_a := null; v_seed_b := null; v_source_a := null; v_source_b := null;
      if v_round=1 then
        v_seed_a := v_order[2*j-1]; v_seed_b := v_order[2*j];
        if v_seed_a <= cardinality(v_teams) then v_team_a := v_teams[v_seed_a]; end if;
        if v_seed_b <= cardinality(v_teams) then v_team_b := v_teams[v_seed_b]; end if;
      else
        v_source_a := v_ids[v_previous_start+2*j-2]; v_source_b := v_ids[v_previous_start+2*j-1];
        select winner_team_id into v_team_a from public.matches where id=v_source_a;
        select winner_team_id into v_team_b from public.matches where id=v_source_b;
      end if;
      insert into public.matches(tournament_id,stage_id,round_number,match_number,seed_a,seed_b,team_a_id,team_b_id,source_match_a_id,source_match_b_id,status,winner_team_id)
      values(p_tournament_id,v_stage,v_round,j,v_seed_a,v_seed_b,v_team_a,v_team_b,v_source_a,v_source_b,
        case when v_round=1 and v_team_a is not null and v_team_b is not null then 'draft'
             when v_round=1 and (v_team_a is not null or v_team_b is not null) then 'bye'
             when v_round=1 then 'waiting' else 'waiting' end,
        case when v_round=1 and v_team_a is null then v_team_b when v_round=1 and v_team_b is null then v_team_a else null end)
      returning id into v_match;
      v_ids := array_append(v_ids,v_match);
      if v_round=1 and (v_team_a is null) <> (v_team_b is null) then
        insert into public.tournament_advancements(tournament_id,match_id,team_id,advancement_type) values(p_tournament_id,v_match,coalesce(v_team_a,v_team_b),'bye');
      end if;
    end loop;
    v_previous_start := v_current_start;
    exit when v_round_matches=1;
    v_round_matches := v_round_matches/2;
    v_round := v_round+1;
  end loop;
  -- Carry opening-round byes forward. Resolved source references remain attached
  -- to the downstream slot; no scorecard or innings are created for a bye.
  select max(round_number) into v_max_round from public.tournament_stages where tournament_id=p_tournament_id;
  for v_round in 2..v_max_round loop
    update public.matches m set
      team_a_id=sa.winner_team_id,
      team_b_id=sb.winner_team_id,
      status=case when sa.winner_team_id is not null and sb.winner_team_id is not null then 'draft'
                  when (sa.status in ('bye','completed')) and (sb.status in ('bye','completed')) then 'bye' else 'waiting' end,
      winner_team_id=case when sa.winner_team_id is not null and sb.winner_team_id is null and sb.status in ('bye','completed') then sa.winner_team_id
                          when sb.winner_team_id is not null and sa.winner_team_id is null and sa.status in ('bye','completed') then sb.winner_team_id else null end
    from public.matches sa, public.matches sb
    where m.tournament_id=p_tournament_id and m.round_number=v_round and sa.id=m.source_match_a_id and sb.id=m.source_match_b_id;
    insert into public.tournament_advancements(tournament_id,match_id,team_id,advancement_type)
      select tournament_id,id,winner_team_id,'bye' from public.matches where tournament_id=p_tournament_id and round_number=v_round and status='bye' and winner_team_id is not null
      on conflict(match_id) do nothing;
  end loop;
  perform public.write_audit('fixtures_generated','tournament',p_tournament_id,null,jsonb_build_object('approved_teams',cardinality(v_teams),'bracket_size',v_bracket_size));
  return v_ids[1];
end;
$$;

create or replace function public.admin_publish_fixtures(p_tournament_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_role('admin') then raise exception 'admin role required' using errcode='42501'; end if;
  perform 1 from public.tournaments where id=p_tournament_id and state='registration_closed' for update;
  if not found or not exists(select 1 from public.tournament_stages where tournament_id=p_tournament_id) then raise exception 'Generated fixtures are required before publication'; end if;
  if exists(select 1 from public.matches where tournament_id=p_tournament_id and status='draft' and (team_a_id is null or team_b_id is null)) then raise exception 'Bracket contains an incomplete match'; end if;
  update public.matches set status='scheduled',updated_at=now(),version=version+1 where tournament_id=p_tournament_id and status='draft';
  update public.tournament_stages set published_at=now() where tournament_id=p_tournament_id;
  update public.tournaments set state='ready',updated_at=now() where id=p_tournament_id;
  perform public.write_audit('fixtures_published','tournament',p_tournament_id);
end;
$$;

create or replace function public.admin_schedule_match(p_match_id uuid,p_scheduled_for timestamptz,p_venue text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_tournament uuid; v_status text;
begin
  if not public.has_role('admin') then raise exception 'admin role required' using errcode='42501'; end if;
  if p_scheduled_for is null or p_scheduled_for < now() then raise exception 'Schedule must be a future date and time'; end if;
  if char_length(trim(coalesce(p_venue,''))) not between 2 and 200 then raise exception 'Venue must be 2-200 characters'; end if;
  select tournament_id,status into v_tournament,v_status from public.matches where id=p_match_id for update;
  if not found or v_status <> 'scheduled' then raise exception 'Only published, playable fixtures can be scheduled'; end if;
  update public.matches set scheduled_for=p_scheduled_for,venue=trim(p_venue),updated_at=now(),version=version+1 where id=p_match_id;
  perform public.write_audit('match_scheduled','match',p_match_id,null,jsonb_build_object('scheduled_for',p_scheduled_for,'venue',trim(p_venue)));
end;
$$;

create or replace function public.admin_assign_match_official(p_match_id uuid,p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_status text; v_old uuid;
begin
  if not public.has_role('admin') then raise exception 'admin role required' using errcode='42501'; end if;
  select status into v_status from public.matches where id=p_match_id for update;
  if not found or v_status not in ('scheduled','draft') then raise exception 'Officials can be assigned only to an unpublished or scheduled match'; end if;
  select user_id into v_old from public.match_officials where match_id=p_match_id and revoked_at is null for update;
  if v_old=p_user_id then return; end if;
  if p_user_id is not null and not exists(select 1 from public.user_roles where user_id=p_user_id and role='match_official') then raise exception 'User must have the match_official role'; end if;
  update public.match_officials set revoked_at=now(),revoked_by=(select auth.uid()) where match_id=p_match_id and revoked_at is null;
  if p_user_id is null then
    if v_old is not null then perform public.write_audit('match_official_unassigned','match',p_match_id,null,jsonb_build_object('from',v_old)); end if;
    return;
  end if;
  insert into public.match_officials(match_id,user_id,assigned_by) values(p_match_id,p_user_id,(select auth.uid()));
  perform public.write_audit('match_official_assigned','match',p_match_id,null,jsonb_build_object('from',v_old,'to',p_user_id));
  insert into public.notifications(user_id,kind,title,body) values(p_user_id,'match_assignment','Match assignment','You have been assigned as an official for a tournament match.');
end;
$$;

create or replace function public.admin_list_match_officials()
returns table(user_id uuid,full_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_role('admin') then raise exception 'admin role required' using errcode='42501'; end if;
  return query select r.user_id,coalesce(p.full_name,'') from public.user_roles r join public.profiles p on p.id=r.user_id where r.role='match_official' order by p.full_name,r.user_id;
end;
$$;

create or replace function public.admin_reschedule_match(p_match_id uuid,p_scheduled_for timestamptz,p_venue text,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_role('admin') then raise exception 'admin role required' using errcode='42501'; end if;
  if char_length(trim(coalesce(p_reason,'')))<8 then raise exception 'Reschedule reason must be at least 8 characters'; end if;
  if not exists(select 1 from public.matches where id=p_match_id and status='scheduled') then raise exception 'Only scheduled matches can be rescheduled'; end if;
  perform public.admin_schedule_match(p_match_id,p_scheduled_for,p_venue);
  perform public.write_audit('match_rescheduled','match',p_match_id,p_reason);
end;
$$;

create or replace function public.admin_cancel_match(p_match_id uuid,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_tournament uuid;
begin
  if not public.has_role('admin') then raise exception 'admin role required' using errcode='42501'; end if;
  if char_length(trim(coalesce(p_reason,'')))<8 then raise exception 'Cancellation reason must be at least 8 characters'; end if;
  update public.matches set status='cancelled',updated_at=now(),version=version+1 where id=p_match_id and status in ('draft','scheduled','waiting','abandoned') returning tournament_id into v_tournament;
  if v_tournament is null then raise exception 'Match cannot be cancelled from its current state'; end if;
  perform public.write_audit('match_cancelled','match',p_match_id,p_reason);
end;
$$;

create or replace function public.admin_mark_match_abandoned(p_match_id uuid,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_role('admin') then raise exception 'admin role required' using errcode='42501'; end if;
  if char_length(trim(coalesce(p_reason,'')))<8 then raise exception 'Abandonment reason must be at least 8 characters'; end if;
  update public.matches set status='abandoned',updated_at=now(),version=version+1 where id=p_match_id and status='scheduled';
  if not found then raise exception 'Only scheduled matches can be abandoned'; end if;
  perform public.write_audit('match_abandoned','match',p_match_id,p_reason);
end;
$$;

create or replace function public.admin_finalize_match(p_match_id uuid,p_winner_team_id uuid,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_match public.matches%rowtype; v_next public.matches%rowtype; v_round integer;
begin
  if not public.has_role('admin') then raise exception 'admin role required' using errcode='42501'; end if;
  if char_length(trim(coalesce(p_reason,'')))<8 then raise exception 'Result note must be at least 8 characters'; end if;
  select * into v_match from public.matches where id=p_match_id for update;
  if not found or v_match.status not in ('scheduled','abandoned','cancelled') then raise exception 'Match is not ready for administrative result review'; end if;
  if p_winner_team_id is null or p_winner_team_id not in (v_match.team_a_id,v_match.team_b_id) then raise exception 'Winner must be one of the participating teams'; end if;
  update public.matches set status='completed',winner_team_id=p_winner_team_id,result_note=trim(p_reason),updated_at=now(),version=version+1 where id=p_match_id;
  insert into public.tournament_advancements(tournament_id,match_id,team_id,advancement_type) values(v_match.tournament_id,p_match_id,p_winner_team_id,'administrative_result') on conflict(match_id) do update set team_id=excluded.team_id,advancement_type=excluded.advancement_type,created_at=now();
  select * into v_next from public.matches where id in (select id from public.matches where source_match_a_id=p_match_id or source_match_b_id=p_match_id) for update;
  if found then
    update public.matches set
      team_a_id=case when source_match_a_id=p_match_id then p_winner_team_id else team_a_id end,
      team_b_id=case when source_match_b_id=p_match_id then p_winner_team_id else team_b_id end,
      status=case when (case when source_match_a_id=p_match_id then p_winner_team_id else team_a_id end) is not null
                   and (case when source_match_b_id=p_match_id then p_winner_team_id else team_b_id end) is not null then 'scheduled' else status end,
      updated_at=now(),version=version+1
    where id=v_next.id and status='waiting';
  end if;
  if not exists(select 1 from public.matches where tournament_id=v_match.tournament_id and round_number=v_match.round_number and status not in ('completed','bye','cancelled')) then
    update public.tournaments set state='completed',updated_at=now() where id=v_match.tournament_id and not exists(select 1 from public.matches where tournament_id=v_match.tournament_id and round_number>v_match.round_number);
  end if;
  perform public.write_audit('match_result_finalized','match',p_match_id,p_reason,jsonb_build_object('winner_team_id',p_winner_team_id));
end;
$$;

revoke all on function public.admin_generate_fixtures(uuid) from public,anon,authenticated;
revoke all on function public.admin_publish_fixtures(uuid) from public,anon,authenticated;
revoke all on function public.admin_schedule_match(uuid,timestamptz,text) from public,anon,authenticated;
revoke all on function public.admin_assign_match_official(uuid,uuid) from public,anon,authenticated;
revoke all on function public.admin_list_match_officials() from public,anon,authenticated;
revoke all on function public.admin_reschedule_match(uuid,timestamptz,text,text) from public,anon,authenticated;
revoke all on function public.admin_cancel_match(uuid,text) from public,anon,authenticated;
revoke all on function public.admin_mark_match_abandoned(uuid,text) from public,anon,authenticated;
revoke all on function public.admin_finalize_match(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.admin_generate_fixtures(uuid) to authenticated;
grant execute on function public.admin_publish_fixtures(uuid) to authenticated;
grant execute on function public.admin_schedule_match(uuid,timestamptz,text) to authenticated;
grant execute on function public.admin_assign_match_official(uuid,uuid) to authenticated;
grant execute on function public.admin_list_match_officials() to authenticated;
grant execute on function public.admin_reschedule_match(uuid,timestamptz,text,text) to authenticated;
grant execute on function public.admin_cancel_match(uuid,text) to authenticated;
grant execute on function public.admin_mark_match_abandoned(uuid,text) to authenticated;
grant execute on function public.admin_finalize_match(uuid,uuid,text) to authenticated;
