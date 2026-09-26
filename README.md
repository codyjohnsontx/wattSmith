# Wattsmith

Wattsmith is a cycling analysis-to-prescription workspace. It helps a rider understand the demands of completed races and hard rides, translate those findings into custom FTP-based workouts, and export `.mrc` or `.erg` files for execution in TrainerRoad or another workout platform.

## Current Product

- Auth.js sign-in with GitHub and authenticated, athlete-scoped routes.
- Prisma/Postgres persistence for athlete profiles, dated FTP history, workouts, Strava connections, and short-lived Strava caches.
- A manual workout builder with FTP targets, ramps, repeats, reusable blocks, charting, validation, undo/redo, and unsaved-change protection.
- A cloud workout library with search, filters, favorites, reliable inline rename, duplication, deletion, and starter templates.
- One-time migration of legacy browser-local workouts into the signed-in athlete’s cloud library; local data is not automatically deleted.
- `.mrc` percentage export and `.erg` watt export with previews, file naming, validation warnings, text cues, round-trip parsing, and committed golden fixtures.
- `.zwo`, `.erg` and `.mrc` import from the Library tab (button or drag-drop) into an unsaved builder draft, with a warnings report for anything the importer skipped or approximated. Zwift free-ride blocks import as hatched blocks with no ERG target.
- Dated FTP history so activity calculations use the FTP effective on the ride date.
- A separate, revocable Strava data connection with encrypted tokens, rotating refresh-token persistence, lazy activity pagination, and caches capped at seven days.
- Deep race/hard-ride analysis: power coverage, weighted power, IF, estimated TSS, Wattsmith zones, peak efforts, variability, durability comparisons, and data-quality notes.
- Rider-selected peak-demand mapping that explains the observed effort, editable workout target, repeat structure, and recovery before creating an unsaved builder draft.
- A public synthetic-data demo at [`/demo`](http://localhost:3000/demo) that uses the same analysis engine and UI without credentials or athlete data.

Strava activity analysis requires a configured Strava application. Additional finding-to-workout mappings, FIT/TCX import, coaching relationships, plans, calendar views, and longitudinal analytics remain roadmap work.

## Development

```bash
npm ci
cp .env.example .env.local
npm run db:generate
npm run db:migrate
npm run dev
```

`db:migrate` uses Prisma's non-destructive deploy workflow for the configured database. Use `db:migrate:dev` only with a disposable local development database that can safely support Prisma shadow-database operations.

Open `http://localhost:3000`. The credential-free reviewer path is `http://localhost:3000/demo`.

Required services and credentials are documented in [`.env.example`](.env.example). GitHub remains the application sign-in provider; Strava is connected separately and can be revoked without changing the Wattsmith account.

## Validation

```bash
npx tsc --noEmit
npm run test
npm run lint
npm run build
```

The optional public-demo browser smoke flow runs with `npm run test:e2e` and writes desktop/mobile screenshots under `output/playwright/`.

See the [product roadmap](docs/roadmap.md), [testing debt](docs/testing-tech-debt.md), and [export verification notes](docs/export-testing.md). A production demo URL can replace the local `/demo` link once deployment is configured; deployment automation is intentionally out of scope.

## Contributing

Issues and pull requests are welcome. Please run the validation commands above before opening a pull request, and keep changes focused on a single concern.

## License

Wattsmith is released under the [MIT License](LICENSE).
