# Cricket in Box

Cricket in Box is a mobile-first tournament management and live-scoring app. The repository is being built in five approved stages. **Stages 1 and 2 are implemented so far:** project foundation, authentication, tournament registration, and team/roster management.

## Requirements

- Node.js 22 or newer and npm
- Docker Desktop for local Supabase database/security tests
- A Supabase project for live registration, login, password reset, and persistent sessions

## Local development

```sh
npm ci
Copy-Item .env.example .env
# Fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env
npx supabase start
npx supabase test db
# To apply migrations to a hosted project:
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
npm run dev
```

The app opens at the URL printed by Vite (normally `http://localhost:5173`). Without Supabase configuration, public pages render and authentication forms explain that configuration is needed; they do not simulate a signed-in user.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Vite development server |
| `npm run lint` | Run ESLint |
| `npm test` | Run Vitest and Testing Library checks |
| `npm run test:e2e` | Run Playwright browser checks |
| `npm run build` | Create production assets in `dist/` |
| `npm run preview` | Serve the production build locally |

See [local development](docs/local-development.md), [database](docs/database.md), [security](docs/security.md), and [deployment](docs/deployment.md).

Stage 3 (fixtures, scheduling, and officials) has not started.
