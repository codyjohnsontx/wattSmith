# Testing and Technical Debt

## Completed Baseline

- Phase 1 workout and profile route-handler hardening is complete with authenticated ownership, validation, conflict, and migration coverage.
- Component test infrastructure is active through jsdom, Testing Library, jest-dom, and user-event.
- GitHub Actions runs dependency install, Prisma generation, Vitest, ESLint, and the production build.
- The public demo has a desktop/mobile Playwright smoke flow covering activity selection, series toggling, summary, zones, peaks, durability, data quality, and screenshots.

## Immediate High-Risk Surfaces

- OAuth callback state/scope behavior, expired-state handling, token refresh rotation, concurrent refresh conflict resolution, disconnect, and webhook deauthorization need broader route-level mocked-HTTP coverage.
- Cache expiry/invalidation, lazy pagination end conditions, Strava `401`/`429`/partial responses, and connection revocation need route tests.
- Analytics calculations need continued fixtures for pauses, gaps, sparse streams, historical FTP boundaries, rolling-window validity, and source response changes. Current unit tests cover zones, weighted power, peaks, gaps, missing metrics, downsampling extrema, and a stable synthetic fixture.
- Profile and rename component coverage should expand to full workspace unsaved-action confirmation and blur/Enter de-duplication.

## Open Integration Debt

- Route tests still mock Auth.js and Prisma. A real isolated Postgres harness remains open and should be introduced alongside the next FTP/Strava persistence iteration; CI should add Postgres as a service at that point.
- Migration verification currently reviews and unit-tests behavior around schema services, but should execute the backfill against representative pre-migration Postgres data.
- Real Strava OAuth remains outside browser E2E by design. Route handlers should continue using mocked upstream HTTP responses; never put live access/refresh tokens in fixtures, logs, snapshots, or CI secrets without an explicit secure-test plan.

- Web Bluetooth trainer control is tested in CI only against spec-derived byte vectors and a simulated FTMS device. Real KICKR CORE byte captures and the hardware test script results ([hardware-testing.md](hardware-testing.md)) are still to be recorded.

## Medium Priority

- Extract more route orchestration into service functions if mocked route suites grow substantially.
- Local migration writes are capped at 100 workouts but remain sequential inside one transaction; chunk if real imports approach that cap.
- Reusable workout blocks remain browser-local until a server-backed prescription or planning workflow depends on them.
- Add accessibility automation to the public demo smoke suite and explicit reduced-motion visual checks.
