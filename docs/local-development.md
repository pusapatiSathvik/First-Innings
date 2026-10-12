# Local development

1. Install Node.js 22+ and npm.
2. Run `npm ci` from the repository root.
3. Copy `.env.example` to `.env` and set the Supabase project URL and public anon/publishable key.
4. For local database checks, start Docker Desktop, run `npx supabase start`, then `npx supabase test db`. The local stack applies migrations from `supabase/migrations/`.
5. In Supabase Auth settings, enable email/password. Choose whether sign-up requires email confirmation. For confirmation, configure a working email provider and add the local app URL to the Auth redirect allow list. Add `/reset-password` as an allowed redirect path.
6. Run `npm run dev`.

To apply migrations to your hosted project, link it with `npx supabase link --project-ref YOUR_PROJECT_REF`, then run `npx supabase migration list` to review pending changes and `npx supabase db push` to apply them. Stage 3 adds `202610120003_fixtures_and_officials.sql` and `202610120004_admin_match_officials.sql`; they do not seed production data. Run the local pgTAP suite with `npx supabase test db` after Docker Desktop is running. The local `supabase/config.toml` does not contain hosted project credentials.

The app uses Supabase Auth's persisted browser session and refreshes auth state on load. If email confirmation is enabled, registration displays a check-your-inbox message when Supabase does not return a session. Password reset sends the user to `/reset-password`.

The only browser environment variables are `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (a Supabase publishable key can also be supplied in this variable), and optional `VITE_SENTRY_DSN`. Never place a service-role key, database password, SMTP credential, or other secret in a `VITE_` variable.
