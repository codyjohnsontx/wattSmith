# Import fixtures

Workout files the importer tests read (`src/lib/ride/formats/*.test.ts`), also
handy for trying the Library tab's "Import file" button by hand.

All files here were written for Wattsmith and are covered by the repository
license. None is copied from Zwift, TrainerRoad, TrainerDay or any other
workout library; the "style" files only imitate the layout quirks those tools
produce (CRLF line endings, missing `[END ...]` markers, `%` suffixes, extra
header keys, mixed case, a byte order mark).

| File | What it exercises |
| --- | --- |
| `zwo/sweet_spot_2x20.zwo` | Warmup, SteadyState, Cooldown, text events, tags, author |
| `zwo/vo2_5x3.zwo` | IntervalsT with per-repetition text events, cadence attributes |
| `zwo/ramp_test.zwo` | Ramp blocks up and down |
| `zwo/group_ride_freeride.zwo` | FreeRide, Freeride, MaxEffort (no ERG target) |
| `zwo/over_unders.zwo` | IntervalsT with ramped on and off power |
| `zwo/hand_edited.zwo` | BOM, XML declaration, comments, bare `&`, case variants, fractional duration |
| `zwo/zone_intervals.zwo` | Zone numbers instead of power, `ftpOverride` |
| `zwo/tempo_range.zwo` | SteadyState power ranges, SolidState |
| `zwo/reverse_ramps.zwo` | Warmup going down, cooldown going up, workout-level text events |
| `zwo/rough_edges.zwo` | Zero-length block, zero repeat, empty IntervalsT, two `<workout>` sections |
| `course/threshold_3x10.mrc` | CRLF, `;` comments, space and tab columns, `%` suffix |
| `course/endurance_goldencheetah.erg` | No `[END ...]` markers, extra header keys, first row not at 0, text events without durations |

The eighteen `docs/export-fixtures` files are importer fixtures too: every one
must re-import to the same timeline it was exported from.
