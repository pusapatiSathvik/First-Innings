# Architecture

The client is a Vite + React single-page app using React Router, Tailwind CSS, Lucide icons, and the Supabase JavaScript client. Auth state is isolated in `src/features/auth`; Supabase setup is in `src/lib`; route gating is a component concern while database access control is enforced with PostgreSQL RLS. Database changes are versioned as SQL migrations.

Stage 1 establishes identity, profile creation, role storage, email/password authentication, and protected navigation. Stage 2 adds tournament lifecycle functions, team creation, invitation requests, captain roster decisions, locking, admin review, and audit history. UI data operations live in feature API modules; sensitive transitions are validated by PostgreSQL functions.
