# Export Testing

Confidence that Wattsmith `.mrc` / `.erg` exports are correct comes from two layers:

1. **Automated verification (primary, always run in CI).** Proves the emitted files reconstruct the intended workout, with no external app required.
2. **Optional human visual check.** Import a fixture into any ERG/MRC-capable app you can actually log into and confirm the chart looks right. This is a sanity check, not the gate.

> The TrainerRoad Workout Creator is **not required**. Its macOS build is unreliable (login/import bugs), so it is treated as one optional target among several — not the source of truth.

## Layer 1: Automated Verification

Run:

```shell
npm run test
```

`src/lib/workout/exportVerification.test.ts` covers, for every fixture:

- **Round-trip fidelity** — parses the emitted `[COURSE DATA]` back into a timeline and asserts it matches `flattenWorkout()`: segment count, start/end timestamps (minutes), MRC `%FTP` values, and ERG absolute watts.
- **Total duration** — the final timestamp equals the workout's total duration.
- **Monotonic time** — no jumbled or overlapping segments.
- **Ramp slopes** — ramped segments export as sloped start≠end points, not steps.
- **Repeat expansion** — repeat blocks expand into their full interval count.
- **Cues** — `[COURSE TEXT]` events match the workout cues (timestamp, text, duration).
- **Golden files** — the committed `docs/export-fixtures/*` are byte-for-byte identical to current exporter output, so any export-code change without regenerating fixtures fails the build.

After any change to the export code, regenerate the fixtures so the golden test matches:

```shell
npm run generate:export-fixtures
```

## Layer 2: Optional Human Visual Check

Reproducible test files live in `docs/export-fixtures/` (source data in `src/lib/workout/exportFixtures.ts`).

| File(s) | Exercises |
| --- | --- |
| `fixture_steady_blocks.*` | Plain steady/recovery targets |
| `fixture_ramps.*` | Ramped warmup and cooldown |
| `fixture_ranges_low/midpoint/high.*` | Range targets under each range-export strategy. Each strategy is written to a `_low/_midpoint/_high`-suffixed file, and the embedded `FILE NAME =` header must match the on-disk filename — verify both. |
| `fixture_repeats.*` | Repeat blocks with work/float children |
| `fixture_cues.*` | Text cues as `[COURSE TEXT]` events |
| `fixture_long_ride.*` | >4 hour workout (expected in-app timeline warning) |
| `fixture_cafe_cremeux_1_60.*` | Special characters in workout name/description |

### Recommended apps (pick one you can log into)

| App | Access | Notes |
| --- | --- | --- |
| TrainerDay | Web | Import ERG/MRC, shows the workout graph. Low friction. |
| intervals.icu | Web (free) | Workout library import; good for a quick visual compare. |
| GoldenCheetah | Desktop (free, cross-platform) | Imports ERG/MRC; useful offline. |
| TrainerRoad Workout Creator | Desktop | Optional. macOS build is known-flaky — skip if it will not log in. |

### Procedure

1. Regenerate fixtures (`npm run generate:export-fixtures`) so files match the current export code.
2. Import a fixture file into the app.
3. Verify against the Wattsmith preview for the same fixture:
   - Chart shape matches (segment order, ramps as slopes, repeats expanded).
   - Total duration matches.
   - Power targets match (MRC: %FTP values; ERG: absolute watts at FTP 200).
   - Text cues appear at the right timestamps (cue fixture only).
4. For the custom-filename check: in Wattsmith, set a custom file name on the Export tab, download both formats, and confirm the downloaded filename and the embedded `FILE NAME =` header both use the custom name.
5. For the three range-strategy files: confirm each `fixture_ranges_<strategy>.{mrc,erg}` embeds a `FILE NAME =` header matching its on-disk filename (e.g. `fixture_ranges_low.mrc` contains `FILE NAME = fixture_ranges_low.mrc`).
6. Record the result in the matrix below.

## Results Matrix (optional human pass)

Legend: ✅ Pass · ❌ Fail · ⚠️ Partial (works with caveats, note them) · ⬜ Not tested

| Field | Value |
| --- | --- |
| Date tested | _not yet run_ |
| App / tool + version | |
| OS | |
| Wattsmith commit | |
| Tester | |

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

- Automated verification proves format/round-trip correctness, not that a specific third-party app accepts the file. Use Layer 2 for app-acceptance confidence.

## Follow-ups

- _None recorded yet._
