-- Allow a captain to select a known account by username/name/UUID, and let admins
-- preview random knockout pairings before closing registration.

create or replace function public.captain_search_tournament_users(p_team_id uuid,p_query text)
returns table(user_id uuid,username text,full_name text)
language plpgsql stable security definer set search_path = '' as $$
declare v_tournament uuid; v_state text; v_query text := trim(coalesce(p_query,''));
begin
  if not public.is_team_captain(p_team_id) then raise exception 'Captain permission required' using errcode='42501'; end if;
  if char_length(v_query)<3 then raise exception 'Enter at least three characters to search'; end if;
  if v_query ~ '[%_]' then raise exception 'Search text cannot contain wildcard characters'; end if;
  select tournament_id into v_tournament from public.teams where id=p_team_id;
  if v_tournament is null then raise exception 'Team not found'; end if;
  select state into v_state from public.tournaments where id=v_tournament;
  if v_state <> 'registration_open' then raise exception 'Tournament registration is closed'; end if;
  if exists(select 1 from public.teams where id=p_team_id and roster_locked_at is not null) then raise exception 'Team roster is locked'; end if;
  return query
    select p.id,p.username,p.full_name
    from public.profiles p
    where p.id <> (select auth.uid())
      and (p.id::text=lower(v_query) or lower(p.username) like lower(v_query)||'%' or p.full_name ilike v_query||'%')
      and not exists(select 1 from public.tournament_members tm where tm.tournament_id=v_tournament and tm.user_id=p.id and tm.status in ('pending','active'))
    order by case when p.id::text=lower(v_query) then 0 when lower(p.username)=lower(v_query) then 1 else 2 end,p.username
    limit 20;
end;
$$;

create or replace function public.captain_add_team_member_by_user_id(p_team_id uuid,p_user_id uuid)
returns table(user_id uuid,username text,full_name text)
language plpgsql security definer set search_path = '' as $$
declare v_username text;
begin
  select p.username into v_username from public.profiles p where p.id=p_user_id;
  if v_username is null then raise exception 'User account not found'; end if;
  return query select * from public.captain_add_team_member_by_username(p_team_id,v_username);
end;
$$;

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
  if not found or v_t.state not in ('registration_open','registration_closed') then raise exception 'Open registration or close registration before generating a preview'; end if;
  if exists(select 1 from public.tournament_stages where tournament_id=p_tournament_id and published_at is not null) then raise exception 'Published fixtures cannot be regenerated'; end if;
  if exists(select 1 from public.matches where tournament_id=p_tournament_id and status not in ('draft','waiting','bye')) then raise exception 'Played or scheduled matches cannot be regenerated'; end if;
  if exists(select 1 from public.match_officials o join public.matches m on m.id=o.match_id where m.tournament_id=p_tournament_id) then raise exception 'Remove official assignments before regenerating this preview'; end if;
  if (select count(*) from public.teams where tournament_id=p_tournament_id and status='approved' and roster_locked_at is not null) < 2 then raise exception 'At least two approved teams with locked rosters are required'; end if;
  if exists(select 1 from public.teams where tournament_id=p_tournament_id and status='approved' and roster_locked_at is null) then raise exception 'Every approved team must have a locked roster'; end if;
  select array_agg(id order by random()) into v_teams from public.teams where tournament_id=p_tournament_id and status='approved' and roster_locked_at is not null;
  if cardinality(v_teams)>v_t.team_limit then raise exception 'Approved team count exceeds tournament limit'; end if;

  -- Replace only an unpublished preview. Clear source references and bye records
  -- before deleting the old preview rows; no published match history is removed.
  if exists(select 1 from public.tournament_stages where tournament_id=p_tournament_id) then
    delete from public.tournament_advancements where tournament_id=p_tournament_id;
    update public.matches set source_match_a_id=null,source_match_b_id=null where tournament_id=p_tournament_id;
    delete from public.matches where tournament_id=p_tournament_id;
    delete from public.tournament_stages where tournament_id=p_tournament_id;
  end if;

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
             else 'waiting' end,
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
  select max(round_number) into v_max_round from public.tournament_stages where tournament_id=p_tournament_id;
  for v_round in 2..v_max_round loop
    update public.matches m set
      team_a_id=sa.winner_team_id,
      team_b_id=sb.winner_team_id,
      status=case when sa.winner_team_id is not null and sb.winner_team_id is not null then 'draft'
                  when (sa.status in ('bye','completed')) and (sb.status in ('bye','completed')) then 'bye' else 'waiting' end,
      winner_team_id=case when sa.winner_team_id is not null and sb.winner_team_id is null and sb.status in ('bye','completed') then sa.winner_team_id
                          when sb.winner_team_id is not null and sa.winner_team_id is null and sa.status in ('bye','completed') then sb.winner_team_id else null end
    from public.matches sa,public.matches sb
    where m.tournament_id=p_tournament_id and m.round_number=v_round and sa.id=m.source_match_a_id and sb.id=m.source_match_b_id;
    insert into public.tournament_advancements(tournament_id,match_id,team_id,advancement_type)
      select tournament_id,id,winner_team_id,'bye' from public.matches where tournament_id=p_tournament_id and round_number=v_round and status='bye' and winner_team_id is not null
      on conflict(match_id) do nothing;
  end loop;
  perform public.write_audit('fixtures_generated','tournament',p_tournament_id,null,jsonb_build_object('approved_teams',cardinality(v_teams),'bracket_size',v_bracket_size,'pairing','random'));
  return v_ids[1];
end;
$$;

create or replace function public.admin_publish_fixtures(p_tournament_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_role('admin') then raise exception 'admin role required' using errcode='42501'; end if;
  perform 1 from public.tournaments where id=p_tournament_id and state in ('registration_open','registration_closed') for update;
  if not found or not exists(select 1 from public.tournament_stages where tournament_id=p_tournament_id) then raise exception 'Generated fixtures are required before publication'; end if;
  if exists(select 1 from public.matches where tournament_id=p_tournament_id and status='draft' and (team_a_id is null or team_b_id is null)) then raise exception 'Bracket contains an incomplete match'; end if;
  update public.matches set status='scheduled',updated_at=now(),version=version+1 where tournament_id=p_tournament_id and status='draft';
  update public.tournament_stages set published_at=now() where tournament_id=p_tournament_id;
  update public.tournaments set state='ready',updated_at=now() where id=p_tournament_id;
  perform public.write_audit('fixtures_published','tournament',p_tournament_id);
end;
$$;

create or replace function public.admin_swap_bracket_participants(p_match_one_id uuid,p_team_one_id uuid,p_match_two_id uuid,p_team_two_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_tournament uuid; v_stage_one uuid; v_stage_two uuid; v_round_one integer; v_round_two integer; v_status_one text; v_status_two text;
begin
  if not public.has_role('admin') then raise exception 'admin role required' using errcode='42501'; end if;
  if p_match_one_id=p_match_two_id or p_team_one_id=p_team_two_id then raise exception 'Choose two different matches and two different teams'; end if;
  select tournament_id into v_tournament from public.matches where id=p_match_one_id;
  if v_tournament is null then raise exception 'First match not found'; end if;
  perform 1 from public.tournaments where id=v_tournament and state in ('registration_open','registration_closed') for update;
  if not found then raise exception 'Bracket can only be edited before publication'; end if;
  select stage_id,round_number,status into v_stage_one,v_round_one,v_status_one from public.matches where id=p_match_one_id and tournament_id=v_tournament for update;
  select stage_id,round_number,status into v_stage_two,v_round_two,v_status_two from public.matches where id=p_match_two_id and tournament_id=v_tournament for update;
  if v_stage_one is null or v_stage_one<>v_stage_two or v_round_one<>1 or v_round_two<>1 or v_status_one<>'draft' or v_status_two<>'draft' then
    raise exception 'Choose two unplayed opening-round matches before publication';
  end if;
  if not exists(select 1 from public.matches where id=p_match_one_id and p_team_one_id in (team_a_id,team_b_id))
    or not exists(select 1 from public.matches where id=p_match_two_id and p_team_two_id in (team_a_id,team_b_id)) then
    raise exception 'Selected teams must belong to their selected matches';
  end if;
  update public.matches set
    team_a_id=case when id=p_match_one_id and team_a_id=p_team_one_id then p_team_two_id when id=p_match_two_id and team_a_id=p_team_two_id then p_team_one_id else team_a_id end,
    team_b_id=case when id=p_match_one_id and team_b_id=p_team_one_id then p_team_two_id when id=p_match_two_id and team_b_id=p_team_two_id then p_team_one_id else team_b_id end,
    updated_at=now(),version=version+1
  where id in (p_match_one_id,p_match_two_id);
  perform public.write_audit('fixtures_pairing_edited','tournament',v_tournament,null,jsonb_build_object('team_one',p_team_one_id,'team_two',p_team_two_id));
end;
$$;

revoke all on function public.captain_search_tournament_users(uuid,text) from public,anon,authenticated;
revoke all on function public.captain_add_team_member_by_user_id(uuid,uuid) from public,anon,authenticated;
revoke all on function public.admin_generate_fixtures(uuid) from public,anon,authenticated;
revoke all on function public.admin_publish_fixtures(uuid) from public,anon,authenticated;
revoke all on function public.admin_swap_bracket_participants(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.captain_search_tournament_users(uuid,text) to authenticated;
grant execute on function public.captain_add_team_member_by_user_id(uuid,uuid) to authenticated;
grant execute on function public.admin_generate_fixtures(uuid) to authenticated;
grant execute on function public.admin_publish_fixtures(uuid) to authenticated;
grant execute on function public.admin_swap_bracket_participants(uuid,uuid,uuid,uuid) to authenticated;
