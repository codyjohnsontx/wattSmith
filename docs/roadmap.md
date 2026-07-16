# Wattsmith Product Roadmap

## North Star

Wattsmith is an analysis-to-prescription workspace:

`Completed rides from Strava → detailed Wattsmith analysis → custom workout design → export to TrainerRoad or another execution platform`

The current audience is the rider/power user who wants trustworthy race and hard-ride analysis. Coach/rider collaboration is a later expansion built on explicit athlete consent and athlete-owned FIT/TCX uploads.

## Product Boundaries

Wattsmith analyzes cycling power data, explains race and workout demands, turns selected findings into workout inputs, and exports workouts for execution elsewhere. It does not record rides, replace Strava history/social features, execute indoor workouts, compete with TrainerRoad as a player, expose one athlete’s Strava API data to another user, or add generative coaching before deterministic calculations are trusted.

## External Constraints

- Strava data is visible only to the connected athlete. Coach views will exclude raw and derived Strava displays unless future written policy approval explicitly permits them.
- Raw and derived Strava caches expire within seven days. Full history means lazy backward pagination, not eager permanent replication.
- Tokens are encrypted, rotated refresh tokens are persisted, OAuth scopes are product-visible, disconnect revokes access and clears cached records, and webhook deletion/deauthorization is idempotent.
- New Strava applications have limited athlete capacity and require Strava review to scale.
- Webhooks are preferred over polling; rate limits, revocation, incomplete streams, estimated power, and missing data are visible product states.

## Phase 1: Cloud Foundation — Complete

- Auth.js application sign-in and Prisma/Postgres persistence.
- Server-backed athlete profile and workout library.
- One-time local-data migration and authenticated ownership checks.
- Workout route-handler hardening.
- Existing builder, library, chart, validation, and export behavior preserved.

Success gate: signed-in athletes own persisted profiles/workouts, legacy data can be imported safely, protected routes reject other users, and all Phase 1 tests pass.

## Phase 1.5: Product Trust and Delivery Baseline — Complete

- Explicit, single-flight profile saving with preserved conflict drafts and reload-latest recovery.
- Commit-once workout rename with Escape cancellation and failed-save restoration.
- Unsaved/saving/saved/failed workout states plus destructive action, navigation, and unload guards.
- Shared typed API/session error handling.
- jsdom, Testing Library, user-event, component tests, and GitHub Actions CI.
- Documentation and public-demo screenshot workflow.

Success gate: normal editing cannot race profile or rename requests; unsaved work is not silently discarded; every pull request runs install, generation, tests, lint, and build.

## Phase 2: Analytics Foundation — Implemented

- Dated FTP history with migration backfill, current-value recomputation, protected CRUD, and activity-date lookup.
- Separate revocable Strava OAuth connection with signed state, required scopes, AES-256-GCM token encryption, refresh rotation, disconnect, and webhooks.
- Lazy full-history cycling table with seven-day page caches and no eager stream loading.
- Deep activity analysis with one-second moving resampling, pause exclusion, gap rules, power quality, weighted load, zones, peaks, durability, and extrema-preserving chart downsampling.
- Public synthetic race demo using the same analysis functions and components.

Success gate: every activity uses its historical FTP; only its connected athlete can request it; list and detail caches never exceed seven days; missing/estimated data is explained; `/demo` works without authentication.

## Phase 3: Analysis to Prescription — In Progress

- Implemented: select an available 5-second, 30-second, 1-minute, 5-minute, or 20-minute peak demand from an activity.
- Implemented: show the observed peak, deterministic 95% target, repeat count, and recovery before creating anything.
- Implemented: create a new unsaved, fully editable builder workout while keeping the source-analysis path session-only and outside saved workout records.
- Next: extend explicit mappings to other findings, including zone demands and durability comparisons.
- Export generated drafts through the existing `.mrc` and `.erg` verification workflow.

Success gate: the rider can explain which finding shaped the workout and edit every generated input before saving or exporting.

## Phase 4: Athlete-Owned Imports and Coaching Foundation

- Import athlete-owned FIT/TCX files and track provenance separately from Strava.
- Add rider/coach roles, invitations, consent, and revocation.
- Permit coach access only to athlete-owned uploads and Wattsmith-authored records.
- Let coaches create and assign workouts while Strava-derived raw data and displays remain excluded.

Success gate: every shared datum has explicit athlete-controlled provenance and revocable access; Strava-derived data cannot enter coach views.

## Phase 5: Plans and Planned-vs-Actual

- Plans, scheduled sessions, and immutable workout snapshots.
- Match athlete-owned completed activities to planned sessions and compare intent with completion.
- Add calendar views only after analysis and prescription workflows are established.

Success gate: later workout-library edits cannot rewrite assigned sessions, and comparisons clearly distinguish planned targets from athlete-owned actual data.

## Phase 6: Longitudinal Analytics

- Power-curve history, load and intensity-distribution trends, rider-strength profiles, and race/block comparisons.
- Explain every calculation, input assumption, and data-quality limitation in product.

Success gate: longitudinal metrics are reproducible from documented inputs and remain useful under sparse/missing-stream conditions.

## Deferred / Non-goals

Calendar-first planning, AI-generated coaching, workout execution, social activity history, coach access to Strava data, production deployment automation, and permanent eager activity replication are explicitly deferred or excluded.

References: [Strava API policy](https://www.strava.com/legal/api_policy), [OAuth](https://developers.strava.com/docs/authentication/), [activity/stream reference](https://developers.strava.com/docs/reference/), [webhooks](https://developers.strava.com/docs/webhooks/), and [rate limits](https://developers.strava.com/docs/rate-limits/).
