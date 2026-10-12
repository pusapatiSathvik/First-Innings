create extension if not exists pgtap with schema extensions;
begin;
select plan(5);

select ok(
  has_function_privilege('authenticated','public.captain_add_team_member_by_user_id(uuid,uuid)','EXECUTE'),
  'UUID-based membership operation is callable and validates its caller internally'
);
select ok(
  has_function_privilege('authenticated','public.update_my_username(text)','EXECUTE'),
  'authenticated users can change their own username through the validated operation'
);
select ok(
  not has_table_privilege('authenticated','public.profiles','UPDATE'),
  'profile identity fields cannot be updated directly through table access'
);
select ok(
  exists(select 1 from pg_indexes where schemaname='public' and indexname='profiles_username_lower_uidx' and indexdef ilike '%unique%lower(username)%'),
  'username uniqueness is case-insensitive and database-enforced'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000123',true);
select set_config('request.jwt.claim.role','authenticated',true);
select throws_ok(
  $$select public.captain_add_team_member_by_user_id('00000000-0000-0000-0000-000000000987','00000000-0000-0000-0000-000000000988')$$,
  '42501','Captain permission required','an unauthorized account cannot add a team member'
);

select * from finish();
rollback;
