# Testing Tech Debt

## High Priority

- API route tests currently use mocked `auth` and Prisma clients, not a real database. This keeps the phase 1 PR lean, but later persistence coverage should use an isolated Prisma integration harness against Postgres or test containers.
- `WorkoutWorkspace` profile saving does not yet share the fuller stale-response and session-expiry handling used by `ProfileSettings`. Consolidate profile API client logic after phase 1 review churn settles.
- Route-handler persistence logic is embedded directly in Next route files. If handler tests continue to grow, extract focused service functions for profile, workout, and migration persistence.

## Medium Priority

- Local migration imports are capped at 100 workouts, but writes still run sequentially inside one transaction. Switch to chunked or bulk operations if import volume grows.
- Reusable workout blocks remain local-only by design in phase 1. Revisit before calendar or planning workflows depend on reusable blocks server-side.
- No GitHub Actions CI workflow exists yet. Recommended future CI command set: `npm ci`, `npm run db:generate`, `npm run test`, `npm run lint`, `npm run build`.

## Lower Priority

- No component-level tests exist for the migration prompt or profile save UI. Defer jsdom/testing-library setup until the UI test value justifies the added infrastructure.
- No E2E auth harness exists. Defer OAuth E2E until app flows stabilize, then consider a mocked session or test provider path.
