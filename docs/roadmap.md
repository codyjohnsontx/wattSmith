# Wattsmith Product Roadmap

Wattsmith is becoming a dense cycling training command center inspired by Intervals-style workflows: fast workout creation, athlete context, planned training, completed ride analysis, and clear fitness/load signals in one focused app.

## Product North Star

Build the single-athlete cycling workspace a rider can open every day to decide what to ride, understand recent training, compare planned work against actual rides, and maintain a reusable workout library without leaving the calendar/dashboard context.

## Current State

- Local-first percentage-based workout builder.
- Saved workouts, reusable blocks, profile assumptions, favorites, and integrations are browser-local.
- Export flow supports `.mrc` and `.erg` previews, validation, file naming, and committed fixture tests.
- Training rationale/source notes exist for templates and workouts.
- Profile assumptions drive warnings but are not account-backed.

## Accepted MVP Scope

- Single-athlete product.
- Cycling-first training model.
- Cloud-backed authentication and persistence.
- Strava-first integration later, not in phase 1.
- Dense calendar/dashboard as the primary future workspace.
- Existing workout builder remains a core workflow, not a side utility.

## Phase Breakdown

### Phase 1: Auth, Database, Server-Backed Profile/Workouts

- Add Auth.js sign-in.
- Add Postgres persistence through Prisma.
- Create server-backed athlete profile.
- Persist saved workouts to the database while preserving the current `Workout` editor shape.
- Add one-time import from existing browser-local profile/workouts.
- Protect app and API routes that require a signed-in user.

### Phase 2: Calendar And Planned Sessions

- Add planned session model.
- Build dense calendar/dashboard view.
- Allow workouts to be scheduled, moved, completed, or removed from plan.
- Show upcoming work and weekly structure from server data.

### Phase 3: Strava Sync And Activity Ingestion

- Add Strava OAuth.
- Import completed rides.
- Store activity summaries and relevant streams.
- Reconcile completed activities with planned sessions.

### Phase 4: Fitness/Load Analytics

- Add load metrics such as CTL, ATL, form, weekly load, and intensity distribution.
- Explain calculation assumptions in-product.
- Keep analytics cycling-first and athlete-scoped.

### Phase 5: Activity Detail And Planned-Vs-Actual

- Add activity detail pages.
- Compare completed rides against planned workouts.
- Surface compliance, missed targets, and notable training outcomes.

### Phase 6: Power Curve And Activity Table

- Add power curve views.
- Add dense activity table with filtering and sorting.
- Connect activity table, power curve, and calendar/dashboard drilldowns.

## Phase 1 Implementation Checklist

- Replace local-only profile persistence with `GET /api/profile` and `PATCH /api/profile`.
- Replace saved workout persistence with authenticated workout APIs.
- Keep reusable workout blocks local in phase 1 unless they block workout import/save behavior.
- Add Prisma models for Auth.js users/accounts/sessions plus `AthleteProfile` and `StructuredWorkout`.
- Store workout blocks/cues/rationale as JSON in phase 1.
- Keep workout-level FTP on `StructuredWorkout`.
- Add GitHub OAuth as the first provider.
- Add authenticated app shell with Dashboard, Workouts, and Settings.
- Redirect `/` based on auth state.
- Add one-time local import prompt after sign-in.
- Do not delete local storage automatically.
- Preserve existing builder, library, chart, validation, and export behavior.
- Keep `npm run test`, `npm run lint`, and `npm run build` passing.

## Known Decisions And Defaults

- Auth: Auth.js through `next-auth`.
- First provider: GitHub OAuth.
- Database: Postgres.
- ORM: Prisma.
- Package manager: npm.
- Architecture: single Next app.
- Workout storage: JSON-backed `StructuredWorkout` records in phase 1.
- Profile arrays: Postgres string arrays for `availableDays` and `constraints`.
- Authorization: all profile/workout queries are scoped to the signed-in user.

## Deferred Scope

- Strava OAuth and sync.
- Calendar/planned-session database model.
- Activity ingestion.
- CTL/ATL/form calculations.
- Workout execution matching.
- Multi-athlete or coaching support.
- Fully normalized workout-step database schema.
- Production deployment automation.
- AI/RAG assistant work.

## Completed Builder Foundation

- Template preview, duplication, and start-from-blank flows.
- Collapse/expand and drag/drop workout editing.
- Session-only undo/redo and keyboard shortcuts.
- Inline validation aligned with export validation.
- Reusable block library with protected starter blocks and custom block manager.
- Saved workout library search, sort, difficulty filtering, favorites, and onboarding/empty states.
- `.mrc` / `.erg` previews, file naming controls, and export readiness checks.
- Automated export verification through round-trip parsing and golden-file fixture diffs.
- Full-width zone-colored workout chart with hover/pin readouts.
- Basic athlete profile fields, warnings, integration placeholders, and cited rationale/source registry.

## Acceptance Criteria

Phase 1 is complete when:

- This roadmap is the canonical Intervals-style product roadmap.
- The app supports Auth.js sign-in.
- The app has a Prisma-backed Postgres schema.
- Athlete profile persists to the database.
- Saved workouts persist to the database.
- Current workout builder/editor/export behavior still works.
- Existing local workouts can be imported once after sign-in.
- Protected app routes require authentication.
- Tests, lint, and build pass.
- The app is ready for phase 2 calendar planning without another persistence refactor.
