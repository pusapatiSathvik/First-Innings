create extension if not exists pgtap with schema extensions;
begin;
select plan(12);

select ok(not has_table_privilege('authenticated','public.user_roles','INSERT'), 'authenticated clients cannot self-assign roles');
select ok(not has_table_privilege('authenticated','public.user_roles','UPDATE'), 'authenticated clients cannot edit role grants');
select ok(not has_table_privilege('authenticated','public.teams','UPDATE'), 'teams cannot be changed through direct table updates');
select ok(not has_table_privilege('authenticated','public.team_members','UPDATE'), 'roster membership cannot be edited through direct table updates');
select ok(not has_table_privilege('authenticated','public.tournaments','INSERT'), 'tournaments cannot be created through direct table inserts');
select ok(not has_table_privilege('authenticated','public.team_invites','SELECT'), 'invitation token hashes are not readable');
select ok(not has_table_privilege('authenticated','public.audit_logs','INSERT'), 'audit logs cannot be forged by clients');
select ok(not has_table_privilege('authenticated','public.notifications','INSERT'), 'clients cannot forge notifications');
select ok(has_function_privilege('authenticated','public.admin_create_tournament(text,text,text,text,date,date,timestamp with time zone,integer,integer,integer,jsonb)','EXECUTE'), 'admin RPC is exposed for its internal authorization check');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000123',true);
select set_config('request.jwt.claim.role','authenticated',true);

select throws_ok(
  $$select public.admin_create_tournament('Unauthorized','unauthorized','','',null,null,null,8,2,12,null)$$,
  '42501','admin role required','non-admin tournament creation is rejected'
);
select throws_ok(
  $$select public.create_team_invite('00000000-0000-0000-0000-000000000987',7)$$,
  '42501','Captain permission required','a user cannot assign themselves as team captain'
);
select throws_ok(
  $$select public.admin_override_roster('00000000-0000-0000-0000-000000000987',null,'unlock','not authorized')$$,
  '42501','admin role required','non-admin roster overrides are rejected'
);

select * from finish();
rollback;
