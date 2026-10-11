# Database foundation

Stage 1 migration: `supabase/migrations/202610110001_foundation_auth.sql`.

It creates `profiles` and `user_roles`, indexes role lookups, and creates a profile plus the default `player` role after Supabase Auth inserts a user. User metadata is used only as a display name; it never grants authority. Roles are constrained to admin, player, captain, and match official. Client sessions can read their own role rows but cannot insert, edit, or delete roles. Profile owners can read/update their own profile under RLS.

Stage 2 migration: `supabase/migrations/202610110002_tournaments_and_teams.sql`. It adds tournament states, teams, tournament membership, roster membership, hashed invitations, notifications, audit history, and the functions that validate workflow transitions. Client writes to protected tables are revoked; changes go through scoped functions that check the caller's role/captain assignment.

Apply via the Supabase CLI or migration workflow. Use a separate Supabase project for development; no production seed data is included. The pgTAP permission checks are in `supabase/tests/stage2_security.test.sql` and can be run with `supabase test db` against a local Supabase stack.
