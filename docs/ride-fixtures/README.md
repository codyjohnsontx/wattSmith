# Ride fixtures

Golden FIT files the encoder test (`src/lib/ride/formats/fit/encoder.test.ts`)
byte-compares against, the same policy as `docs/export-fixtures`.

| File | What it holds |
| --- | --- |
| `wattsmith_fixture_repeats_2026-09-27.fit` | A scripted 20-minute ride of "Fixture Repeats" on the simulated trainer (`src/lib/ride/fitTestUtils.ts`): a 45-second pause, a skipped VO2 interval, one interval ridden free (no target), trainer and heart-rate strap device info |

Only the pause is timer-stopped (`event timer stop_all` / `start`). A skip
needs no timer events because it moves the workout position, not the ride
clock, and a clock gap needs none because the engine reducer clamps it to
`maxTickGapMs` (2 s), so neither leaves idle seconds in the recording.

After an intended encoder change, regenerate with `npm run generate:ride-fixtures`
and check the diff is the change you meant. The file is also handy for trying a
manual upload to Strava or intervals.icu.
