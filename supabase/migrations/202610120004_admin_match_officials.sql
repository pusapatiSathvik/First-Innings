-- Stage 3 UX refinement: manually assign from admin accounts only.
-- Existing active assignments are preserved; changing the assignment in the
-- admin UI explicitly replaces or clears the prior assignee.
create or replace function public.admin_list_match_officials()
returns table(user_id uuid,full_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_role('admin') then raise exception 'admin role required' using errcode='42501'; end if;
  return query
    select r.user_id,coalesce(p.full_name,'')
    from public.user_roles r join public.profiles p on p.id=r.user_id
    where r.role='admin'
    order by p.full_name,r.user_id;
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
  if p_user_id is not null and not exists(select 1 from public.user_roles where user_id=p_user_id and role='admin') then raise exception 'Only admin accounts can be assigned as match officials'; end if;
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

revoke all on function public.admin_list_match_officials() from public,anon,authenticated;
revoke all on function public.admin_assign_match_official(uuid,uuid) from public,anon,authenticated;
grant execute on function public.admin_list_match_officials() to authenticated;
grant execute on function public.admin_assign_match_official(uuid,uuid) to authenticated;
