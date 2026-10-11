# Operations (Stage 1)

Use Supabase Auth, Postgres, and Realtime logs for backend diagnostics. The browser currently surfaces actionable Auth errors and does not log credentials. Sentry is optional and not wired in this stage; `VITE_SENTRY_DSN` is reserved for a later monitoring stage. Check the configured Auth email provider and redirect allow list when users report missing confirmation or reset emails.
