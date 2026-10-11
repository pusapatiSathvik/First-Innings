# Deployment skeleton

Cloudflare Pages settings for the eventual frontend deployment:

- Build command: `npm run build`
- Output directory: `dist`
- Environment: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`; optionally `VITE_SENTRY_DSN`
- Install: `npm ci`

Connect the GitHub repository to Cloudflare Pages and configure preview and production environment variables separately. Vite's SPA fallback should serve `index.html` for application routes; verify direct navigation to `/login` and `/dashboard` on the deployed preview. Apply database migrations with the Supabase CLI as a separate controlled step. Do not run production seeds as part of frontend deployment.

Stage 1 does not deploy automatically. Configure the production domain in both Cloudflare Pages and Supabase Auth's Site URL/redirect allow list. Roll back a frontend release by redeploying a previous Pages deployment. Database recovery depends on the Supabase plan's backup/export capabilities and should be reviewed for the selected plan before launch.
