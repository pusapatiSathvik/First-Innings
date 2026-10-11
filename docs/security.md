# Security and admin bootstrap

Frontend route protection is only for user experience; RLS is the data access boundary. The foundation migration enables RLS on both exposed tables. Users cannot assign themselves roles because `user_roles` has no client write grant. Registration always creates only a `player` role, regardless of supplied signup metadata.

## First admin

Bootstrap the first administrator through a controlled Supabase project-owner session. Verify the intended account by its immutable Auth UUID in the Supabase Auth user list, then use the SQL editor or a privileged migration to run:

```sql
insert into public.user_roles (user_id, role, assigned_by)
values ('<verified-auth-user-uuid>', 'admin', '<project-owner-auth-user-uuid>');
```

Record the change in your organization’s administrative change log. Do not expose the service-role key to the browser. Stage 2 adds an admin route for tournament creation and team review; the database remains authoritative for all admin actions.

The Auth trigger function has a fixed empty search path and uses schema-qualified table names. Stage 2 workflow functions also use fixed search paths and verify admin or team-captain authority inside the database. Invitation tokens are returned once by the create-invite RPC; only their hashes are stored, and the invite table has no client read grant. Roster overrides require a reason and write an audit row. Database permissions should still be reviewed against the deployed Supabase defaults before production use.
