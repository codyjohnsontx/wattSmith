# Wattsmith

Wattsmith is an open-source indoor cycling training workspace. Build or import structured FTP-based workouts, export them for other training apps, and analyze completed rides. Riding those workouts on a smart trainer in the browser (Wahoo KICKR CORE over Web Bluetooth) is in progress: the workout engine and FIT file writer are merged, and the trainer connection and ride page are still being built and tested.

## Features

### Available now

- **Workout builder**: FTP-based targets, ramps, ranges, nested repeats, reusable blocks, text cues, charting, validation, undo/redo, and unsaved-change protection.
- **Workout library**: a cloud library with search, filters, favorites, inline rename, duplication, deletion, and starter templates. Legacy browser-local workouts can be migrated into it once; local data is not automatically deleted.
- **Import**: `.zwo`, `.erg` and `.mrc` files from the Library tab (button or drag-drop) open as an unsaved builder draft, with a warnings report for anything the importer skipped or approximated. Zwift free-ride blocks import as hatched blocks with no ERG target.
- **Export**: `.mrc` percentage and `.erg` watt files with previews, file naming, validation warnings, and text cues, checked by round-trip parsing and committed golden fixtures ([export testing](docs/export-testing.md)).
- **Ride analysis**: power coverage, weighted power, IF, estimated TSS, Wattsmith zones, peak efforts, variability, durability comparisons, and data-quality notes, calculated with the FTP effective on the ride date from dated FTP history. Today the rides come from the optional Strava connection or the synthetic demo; FIT/TCX file import is roadmap work.
- **Analysis to workout**: pick a peak demand from a ride and get an explained, editable workout draft (target, repeats, recovery) before anything is saved.
- **Public demo**: [`/demo`](http://localhost:3000/demo) runs the same analysis engine and UI on synthetic data with no sign-in.
- **Accounts**: Auth.js sign-in with GitHub, and Prisma/Postgres storage for profiles, FTP history and workouts. Stored profile, FTP-history, workout and activity routes are scoped to the signed-in athlete.
- **Strava analysis (optional, off by default)**: a separate, revocable Strava connection with encrypted tokens and caches capped at seven days. See [Strava (optional, off by default)](#strava-optional-off-by-default).

### Ride mode (in progress)

- **Merged, not yet in the UI**: a platform-neutral workout engine (`src/lib/ride/engine`) that steps through a workout with pause, skip, back, extend, FTP bias and ERG throttling; a simulated trainer; and a FIT encoder that writes rides as virtual cycling activities, the type Strava lists as Virtual Ride (no real Strava upload has been tried yet). All are tested in CI without hardware.
- **In review**: a trainer diagnostics page at `/ride/devices` that connects a smart trainer (tested target: Wahoo KICKR CORE) over Web Bluetooth using the Fitness Machine Service, shows live power, cadence and heart rate with the raw characteristics, sets ERG targets, reconnects after dropouts, and checks off the [hardware test script](docs/hardware-testing.md). Needs Chrome or Edge over HTTPS or localhost; `/ride/devices?device=fake` runs it on a simulated trainer. It is in [pull request 20](https://github.com/codyjohnsontx/wattSmith/pull/20) and waits on the owner's KICKR CORE run of that script. Nothing is hardware-verified yet.
- **Planned**: the `/ride` page for riding a workout, a "Download .fit" button on its finish screen, saved ride history, a signed-out demo ride on the simulated trainer, and a public deployment. See the [roadmap](docs/roadmap.md).

Web Bluetooth works only in Chrome, Edge and other Chromium browsers on macOS, Windows, ChromeOS and Android (Linux behind a browser flag), over HTTPS or localhost. Firefox, Safari and iPhone browsers cannot connect to a trainer.

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

## Strava (optional, off by default)

Strava is off unless `STRAVA_CLIENT_ID` is set. Strava requires a paid Strava subscription for Standard Tier API applications (Extended Access Tier applications are exempt but need Strava's review). Wattsmith would run as a Standard Tier application, so the planned public deployment will run with Strava off. With it off, the Activities page, the Strava connection link in settings, and every `/api/integrations/strava/*` and `/api/activities/*` route are switched off (the routes return `404` with code `strava_disabled`; for `/api/activities/*` that applies to signed-in callers, since anonymous callers get `401` from the auth proxy first). The one exception is disconnecting: `DELETE /api/integrations/strava` stays available, and settings shows a "Disconnect Strava" button to anyone who still has a stored connection, so they can always remove it. The rest of Wattsmith and the `/demo` page work unchanged.

The free path is manual: download the ride's `.fit` file and upload it at [strava.com/upload](https://www.strava.com/upload/select) yourself. In-browser ride recording with a `.fit` download is planned work and not in the app yet.

To turn Strava on for your own deployment, create a Strava API application and fill in the `STRAVA_*` values in `.env.local`.

## Validation

```bash
npx tsc --noEmit
npm run test
npm run lint
npm run build
```

The optional public-demo browser smoke flow runs with `npm run test:e2e` and writes desktop/mobile screenshots under `output/playwright/`.

See the [product roadmap](docs/roadmap.md), [testing debt](docs/testing-tech-debt.md), [export verification notes](docs/export-testing.md), and the [hardware test checklist](docs/hardware-testing.md). A production demo URL will replace the local `/demo` link once the planned public deployment lands.

## Contributing

Issues and pull requests are welcome. Please run the validation commands above before opening a pull request, and keep changes focused on a single concern.

## License

Wattsmith is released under the [MIT License](LICENSE).
