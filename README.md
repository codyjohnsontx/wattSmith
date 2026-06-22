# Wattsmith

Wattsmith is a local-first cycling workout builder for creating reusable FTP-based structured workouts. Workouts are stored as percentages of FTP, previewed as watts, and exported as `.mrc` or `.erg` files for platforms such as TrainerRoad Workout Creator.

## Current Scope

- Full manual workout builder with warmup, cooldown, steady, recovery, ramp, and repeat blocks
- FTP percentage, range, and ramp targets
- Workout chart with zone bands, range bands, FTP line, and selected-block highlighting
- Workout summary with duration, zone time, estimated IF/TSS, NP-style estimate, kJ, and interval metrics
- Local workout library with starter templates, search, category filtering, duplicate, rename, delete, and load
- Local athlete profile for defaults and workout warnings
- Integration-ready Strava/Garmin/TrainingPeaks placeholder types and UI
- `.mrc` percentage export and `.erg` watt export
- Export preview, validation warnings, range export strategy, and text cues
- Cited training rationale and science notes

## Non-Goals For Now

- No auth
- No backend
- No direct platform sync
- No AI workout generation yet

## Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Checks

```bash
npm run test
npm run lint
npm run build
```
