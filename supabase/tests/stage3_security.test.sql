create extension if not exists pgtap with schema extensions;
begin;
select plan(14);

select ok(not has_table_privilege('authenticated','public.tournament_stages','INSERT'), 'clients cannot forge tournament stages');
select ok(not has_table_privilege('authenticated','public.tournament_stages','UPDATE'), 'clients cannot edit tournament stages');
select ok(not has_table_privilege('authenticated','public.matches','INSERT'), 'clients cannot create matches directly');
select ok(not has_table_privilege('authenticated','public.matches','UPDATE'), 'clients cannot alter match state directly');
select ok(not has_table_privilege('authenticated','public.match_officials','INSERT'), 'clients cannot assign match officials directly');
select ok((select relrowsecurity from pg_class where oid='public.match_officials'::regclass), 'match assignments are protected by row-level security');
select ok(not has_table_privilege('authenticated','public.tournament_advancements','INSERT'), 'clients cannot forge bracket advancements');
select ok(not has_table_privilege('authenticated','public.tournament_advancements','UPDATE'), 'clients cannot rewrite bracket advancements');
select ok(has_function_privilege('authenticated','public.admin_generate_fixtures(uuid)','EXECUTE'), 'fixture RPC is exposed for internal admin authorization');
select ok(has_function_privilege('authenticated','public.admin_assign_match_official(uuid,uuid)','EXECUTE'), 'assignment RPC is exposed for internal admin authorization');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000123',true);
select set_config('request.jwt.claim.role','authenticated',true);

select throws_ok($$select public.admin_generate_fixtures('00000000-0000-0000-0000-000000000987')$$,'42501','admin role required','non-admin cannot generate a bracket');
select throws_ok($$select public.admin_publish_fixtures('00000000-0000-0000-0000-000000000987')$$,'42501','admin role required','non-admin cannot publish fixtures');
select throws_ok($$select public.admin_assign_match_official('00000000-0000-0000-0000-000000000987','00000000-0000-0000-0000-000000000123')$$,'42501','admin role required','non-admin cannot assign themselves as umpire');
select throws_ok($$select public.admin_finalize_match('00000000-0000-0000-0000-000000000987','00000000-0000-0000-0000-000000000123','unauthorized result')$$,'42501','admin role required','non-admin cannot finalize a match');

select * from finish();
rollback;
