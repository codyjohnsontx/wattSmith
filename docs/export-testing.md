# Export Testing: TrainerRoad Workout Creator

Manual verification that Wattsmith `.mrc` / `.erg` exports import correctly into the TrainerRoad Workout Creator. Fill in the results matrix each time a full pass is run.

## Test Environment

| Field | Value |
| --- | --- |
| Date tested | _not yet run_ |
| TrainerRoad Workout Creator version | |
| OS | |
| Wattsmith commit | |
| Tester | |

## Fixture Files

Reproducible test files live in `docs/export-fixtures/`. Regenerate them after any export-code change:

```
npm run generate:export-fixtures
```

Each fixture isolates one export feature (source data in `src/lib/workout/exportFixtures.ts`):

| File(s) | Exercises |
| --- | --- |
| `fixture_steady_blocks.*` | Plain steady/recovery targets |
| `fixture_ramps.*` | Ramped warmup and cooldown |
| `fixture_ranges_low/midpoint/high.*` | Range targets under each range-export strategy |
| `fixture_repeats.*` | Repeat blocks with work/float children |
| `fixture_cues.*` | Text cues as `[COURSE TEXT]` events |
| `fixture_long_ride.*` | >4 hour workout (expected in-app timeline warning) |
| `fixture_cafe_cremeux_1_60.*` | Special characters in workout name/description |

## Manual Test Procedure

1. Regenerate fixtures (`npm run generate:export-fixtures`) so files match the current export code.
2. Open the TrainerRoad Workout Creator on Mac or Windows.
3. Drag a fixture file into the left sidebar.
4. Verify against the Wattsmith preview for the same fixture:
   - The chart shape matches (segment order, ramps rendered as slopes, repeats expanded).
   - Total duration matches.
   - Power targets match (MRC: %FTP values; ERG: absolute watts at FTP 200).
   - Text cues appear at the right timestamps (cue fixture only).
5. Click Save/Publish.
6. Open the TrainerRoad app, refresh the workout library, and confirm the workout appears under Workouts > Custom and its chart still looks correct.
7. Record the result in the matrix below.
8. For the custom-filename row: in Wattsmith, set a custom file name on the Export tab, download both formats, and confirm the downloaded filename and the embedded `FILE NAME =` header both use the custom name.

## Results Matrix

Legend: ✅ Pass · ❌ Fail · ⚠️ Partial (works with caveats, note them) · ⬜ Not tested

| Feature | MRC | ERG | Notes |
| --- | --- | --- | --- |
| Steady blocks | ⬜ | ⬜ | |
| Ramps (warmup/cooldown) | ⬜ | ⬜ | |
| Ranges @ low | ⬜ | ⬜ | |
| Ranges @ midpoint | ⬜ | ⬜ | |
| Ranges @ high | ⬜ | ⬜ | |
| Nested repeats | ⬜ | ⬜ | |
| Cues / COURSE TEXT | ⬜ | ⬜ | |
| >4h workout | ⬜ | ⬜ | |
| Special-character names | ⬜ | ⬜ | |
| Custom filename | ⬜ | ⬜ | |

## Known Limitations

- _None recorded yet._

## Follow-ups

- _None recorded yet._
