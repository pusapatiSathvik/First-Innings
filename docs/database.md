# Database foundation

Stage 1 migration: `supabase/migrations/202610110001_foundation_auth.sql`.

It creates `profiles` and `user_roles`, indexes role lookups, and creates a profile plus the default `player` role after Supabase Auth inserts a user. User metadata is used only as a display name; it never grants authority. Roles are constrained to admin, player, captain, and match official. Client sessions can read their own role rows but cannot insert, edit, or delete roles. Profile owners can read/update their own profile under RLS.

Stage 2 migration: `supabase/migrations/202610110002_tournaments_and_teams.sql`. It adds tournament states, teams, tournament membership, roster membership, hashed invitations, notifications, audit history, and the functions that validate workflow transitions. Client writes to protected tables are revoked; changes go through scoped functions that check the caller's role/captain assignment.

Stage 3 migration: `supabase/migrations/202610120003_fixtures_and_officials.sql`. It adds persisted knockout rounds and matches, match-official assignments, and explicit bye-advancement events. `admin_generate_fixtures` seeds only approved teams with locked rosters, in stable creation-time/UUID order, and builds the complete bracket. Bye slots are marked as advancements and have no scorecard. `admin_publish_fixtures` makes the bracket public and transitions the tournament to `ready`. Scheduling, official assignment, cancellation, abandonment, and administrative result workflows use narrowly scoped functions. Public users can read only published brackets and matches; official assignments remain behind RLS.

Migration `202610120004_admin_match_officials.sql` narrows manual match umpire assignment to existing admin accounts. Assignment is optional; existing assignments are retained until an admin explicitly changes or clears them.

Apply via the Supabase CLI or migration workflow. Use a separate Supabase project for development; no production seed data is included. The pgTAP permission checks are in `supabase/tests/`; run them with `supabase test db` against a local Supabase stack.
