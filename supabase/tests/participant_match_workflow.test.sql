create extension if not exists pgtap with schema extensions;
begin;
select plan(9);

select ok(has_column('public','profiles','username'), 'every profile has a username');
select ok(has_function_privilege('authenticated','public.captain_add_team_member_by_username(uuid,text)','EXECUTE'), 'captain add-member RPC is callable for internal authorization');
select ok(has_function_privilege('authenticated','public.admin_join_match_as_official(uuid)','EXECUTE'), 'umpire join RPC is callable for internal authorization');
select ok(not has_table_privilege('authenticated','public.matches','UPDATE'), 'match state remains protected from direct updates');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000123',true);
select set_config('request.jwt.claim.role','authenticated',true);

select throws_ok($$select * from public.captain_add_team_member_by_username('00000000-0000-0000-0000-000000000987','unknown')$$,'42501','Captain permission required','non-captain cannot add roster members');
select throws_ok($$select public.admin_join_match_as_official('00000000-0000-0000-0000-000000000987')$$,'42501','admin role required','non-admin cannot join as umpire');
select throws_ok($$select * from public.admin_list_my_umpire_matches()$$,'42501','admin role required','non-admin cannot read umpire assignments');
select throws_ok($$select public.umpire_finalize_assigned_match('00000000-0000-0000-0000-000000000987','00000000-0000-0000-0000-000000000988',null)$$,'42501','An active umpire assignment is required','unassigned user cannot declare a winner');
select throws_ok($$select public.admin_finalize_match_optional('00000000-0000-0000-0000-000000000987','00000000-0000-0000-0000-000000000988',null)$$,'42501','admin role required','non-admin cannot use the optional-reason result operation');

select * from finish();
rollback;
