# Hardware Testing

Wattsmith is being built to control a smart trainer (the target is a Wahoo KICKR CORE) from the browser over Web Bluetooth and to ride structured workouts on it. This file is the living checklist for that work: which checks exist, which pull request brings each one, and what a real trainer has actually done.

**Current status: nothing is hardware-verified yet.** The results matrix below is empty until the owner runs the script on a KICKR CORE. Do not read any step as passing until its row says so.

| Piece | Status |
| --- | --- |
| Workout engine, simulated trainer, FIT encoder | Merged. Tested in CI with no hardware. |
| Web Bluetooth trainer layer and the `/ride/devices` diagnostics page | In review in [pull request 20](https://github.com/codyjohnsontx/wattSmith/pull/20), waiting on this script (steps 1-10). Not on `main` yet. |
| Ride page (`/ride`) | Planned. Brings steps 11-14. |
| "Download .fit" on the ride finish screen | Planned. The encoder is merged; the button is not. Brings step 15. |
| "Send to Strava" | Planned, and off unless the deployment configures a Strava app ([Strava (optional, off by default)](../README.md#strava-optional-off-by-default)). Brings step 16. |

Confidence comes from two layers, the same shape as [export testing](export-testing.md):

1. **Automated tests (always run in CI).** Prove the engine, codecs and file output behave as specified without a trainer in the room.
2. **The hardware test script (owner, on a real KICKR CORE).** The only check that a real trainer accepts the commands and follows the targets.

## Layer 1: Automated Tests

```shell
npm run test
```

On `main` today:

- `src/lib/ride/engine/*.test.ts`: every ride state transition, ERG write throttling over ramps, and second-by-second recording with bursty or missing samples.
- `src/lib/ride/scriptedRide.test.ts`: a scripted ride over the export fixtures whose targets match the `.erg` export's interpolation second by second, so riding a workout and exporting it agree.
- `src/lib/ride/trainer/SimulatedTrainer.test.ts`: the simulated trainer, including dropped connections, slow control responses, rejected targets and missing cadence or heart rate.
- `src/lib/ride/engineBoundary.test.ts`: the lint rule that keeps the engine and file formats free of browser and React imports.
- `src/lib/ride/formats/fit/encoder.test.ts`: the FIT encoder, decoded by an independent parser and byte-compared against the golden file in [`docs/ride-fixtures/`](ride-fixtures/README.md).

Added by [pull request 20](https://github.com/codyjohnsontx/wattSmith/pull/20) (in review):

- `src/lib/ride/trainer/web/codec.test.ts`: the Bluetooth byte codecs against vectors hand-encoded from the Bluetooth SIG specifications (`src/lib/ride/trainer/web/fixtures/spec-vectors.json`), plus any real `kickr-core-*.json` capture committed next to them.
- `src/lib/ride/trainer/web/WebBluetoothTrainer.test.ts`: the connect sequence, control point procedures, range clamping, control taken by another app, reconnect after power loss, and silent-trainer handling, all against a simulated FTMS device.
- `src/lib/ride/trainer/web/diagnosticChecks.test.ts`: the pass/fail rules the diagnostics page shows for steps 1-10.

Automated tests share one reading of the specifications with the code under test. A byte capture from a real trainer (see [Byte capture](#byte-capture)) is what breaks that circle.

## Layer 2: Hardware Test Script

### Before you start

- KICKR CORE powered on, firmware updated in the Wahoo app.
- In the Wahoo app, turn off **ERG Mode Power Smoothing** so the reported power is real. Then **fully close the Wahoo app**, Zwift, and any head unit that could control the trainer: only one app can control it at a time.
- Chrome (or Edge) on the Mac, with Bluetooth allowed in System Settings > Privacy & Security > Bluetooth > Google Chrome. Without that permission the chooser is empty.
- The page must be served over HTTPS or from `http://localhost` (`npm run dev`). Firefox, Safari and every browser on iPhone and iPad cannot use Web Bluetooth.
- Optional: heart rate strap on. Laptop on mains power.

### Steps 1-10: diagnostics page (`/ride/devices`)

Brought by [pull request 20](https://github.com/codyjohnsontx/wattSmith/pull/20) (in review), which merges only after these steps pass. Check out its branch (`fm/ws-pr4-bluetooth`, or `main` once it is merged), run `npm run dev`, and open `http://localhost:3000/ride/devices` (sign in first). Each step has a matching row in the page's **Hardware test script** panel that turns **Pass**, **Fail** or **Waiting** on its own. Steps marked **Observe** need your eyes and a note in the results. To try the page without a trainer, open `/ride/devices?device=fake`: a simulated FTMS trainer with "Unplug" and "Another app takes control" buttons.

| # | Do this | Pass looks like |
| --- | --- | --- |
| 1 | Press **Connect trainer** and pick the KICKR in the chooser. Note the name shown, and whether it appears once or twice. | Row 1 passes and the status pill says **connected**. |
| 2 | Look at **Services and characteristics**. | Row 2 passes: Fitness Machine (0x1826) and Cycling Power (0x1818) found. Note whether the Wahoo characteristic `a026e005` is present. |
| 3 | Check the **Devices** panel (firmware, power range, control). | Row 3 passes: power, cadence and power target supported, and a power range (expected about 0-2000 W). Write down the range. |
| 4 | Pedal. | Row 4 passes: power and cadence from Indoor Bike Data at least once a second, and the Cycling Power average within 5 W or 3% of the Indoor Bike Data average (whichever is larger), both averaged over 3 s. |
| 5 | Keep a steady cadence. Press **Set 150 W**, wait for it to settle, then **Set 250 W**. Then try **Set 100 W** and **Set 30 W**. | Row 5 passes when a 150 W press and a later 250 W press both settle on the same connection. Each target must answer within 1 s and power must settle inside 5% of the target (the page judges within 6 s; expect about 3 s). Copy the response time, settle time and overshoot from the ERG control table. Record the lowest target the trainer can hold at your cadence. |
| 6 | At 150 W, stop pedaling for 15 s, then pedal again. | **Observe**: does resistance come back at 150 W without pressing anything? If the trainer answered "operation failed" while stopped, the log shows "Pedaling again: re-sending 150 W." |
| 7 | Stop pedaling and wait 60 s. | **Observe**: does the link stay connected? Row 7 counts Fitness Machine Status events. If the log shows the page restarting notifications or rebuilding the link while you are stopped, write it down: the KICKR goes quiet when idle. |
| 8 | Set 150 W, then unplug the trainer's power for 10 s and plug it back in. | The page shows an amber **Reconnecting** banner. Row 8 passes only when the link comes back without the chooser and the trainer accepts a target afterwards (the page re-sends the last one). Then reload the page: the chooser is expected to be needed again. Note whether `chrome://flags/#enable-web-bluetooth-new-permissions-backend` is on. |
| 9 | Press **Connect heart rate** and pick the strap. Disconnect it and connect it again. | Row 9 passes: first reading within 5 s. |
| 10 | Open the Wahoo app on your phone while the page is connected. | **Observe**: does the Wahoo app connect and read power? Does the page lose control (red "Another app took control" banner, counted in row 10)? Write down the firmware version the Wahoo app shows: Wahoo's release notes could not be fetched, so this is where the KICKR CORE's FTMS firmware gets recorded. |

The pull request is the source of truth for the page's exact wording and thresholds. If it changes them before merging, update this table to match.

### Steps 11-14: ride page (`/ride`)

Planned. The ride page is not built yet; these steps describe what it has to pass.

| # | Do this | Pass looks like |
| --- | --- | --- |
| 11 | Ride a 20-minute workout on `/ride` with the real trainer. | The target changes at each segment boundary and the trainer follows within 2-3 s. Note any interval where it did not. |
| 12 | Pause mid-interval, then resume. | Elapsed time freezes and resistance drops to the pause target; on resume the countdown continues from where it stopped. |
| 13 | Skip one interval, then go back one. | The chart cursor jumps accordingly and the trainer follows the new target. |
| 14 | Switch to another window for six minutes mid-ride. | The ride clock keeps time within 2 s and a warning banner shows on return. Note any drift. |

### Steps 15-17: ride files and Strava

Planned. The FIT encoder is merged (`src/lib/ride/formats/fit/encoder.ts`), but no page offers a download yet.

| # | Do this | Pass looks like |
| --- | --- | --- |
| 15 | Download the ride's `.fit` from the finish screen and upload it at [strava.com/upload/select](https://www.strava.com/upload/select). Also import it at intervals.icu. | Strava shows a **Virtual Ride** with power, cadence and heart rate charts, duration equal to the ride, and no distance complaints. intervals.icu shows the same average power. |
| 16 | Press **Send to Strava** on the ride's page, then press it again. Only on a deployment with a Strava app configured. | The same activity appears on Strava, and the second press reports it is already uploaded. |
| 17 | Optional: check whether the ride shows up in the Wahoo app through Strava sync. | Expected not to appear (the Wahoo app does not pull activities from Strava). Recording the result documents the Wahoo path honestly. |

Until step 15 has a download button, the golden file `docs/ride-fixtures/wattsmith_fixture_repeats_2026-09-27.fit` (a simulated ride) can be uploaded by hand to try Strava's and intervals.icu's handling of Wattsmith's FIT output. That checks the file format only, not a real ride.

### Byte capture

Brought by [pull request 20](https://github.com/codyjohnsontx/wattSmith/pull/20) (in review). During steps 4 and 5, press **Record 30 s of raw notifications** on the diagnostics page, served from the same branch as above. Pedal and set a target or two while it records. The page downloads `kickr-core-<firmware>.json`. Commit it under `src/lib/ride/trainer/web/fixtures/` unchanged: the codec tests then decode every real notification in CI from then on.

## Results Matrix

Legend: ✅ Pass · ❌ Fail · ⚠️ Partial (works with caveats, note them) · ⬜ Not tested

| Field | Value |
| --- | --- |
| Date tested | _not yet run_ |
| Wattsmith commit | |
| KICKR CORE firmware | |
| Chrome version | |
| macOS version | |
| Heart rate strap | |
| Tester | |

| # | Step | Brought by | Result | Notes |
| --- | --- | --- | --- | --- |
| 1 | Connect trainer | Pull request 20 (in review) | ⬜ | |
| 2 | Services found (FTMS, Cycling Power, Wahoo characteristic) | Pull request 20 (in review) | ⬜ | |
| 3 | Feature flags and supported power range | Pull request 20 (in review) | ⬜ | Range: |
| 4 | Live power and cadence, Indoor Bike Data vs Cycling Power | Pull request 20 (in review) | ⬜ | |
| 5 | ERG targets 150 W then 250 W; 100 W and 30 W floor | Pull request 20 (in review) | ⬜ | Settle times: / Lowest target: |
| 6 | Target held after 15 s stopped | Pull request 20 (in review) | ⬜ | |
| 7 | 60 s idle: link and status events | Pull request 20 (in review) | ⬜ | |
| 8 | Reconnect after power loss; chooser after reload | Pull request 20 (in review) | ⬜ | |
| 9 | Heart rate connect and reconnect | Pull request 20 (in review) | ⬜ | |
| 10 | Wahoo app alongside; control lost; firmware version | Pull request 20 (in review) | ⬜ | Firmware: |
| 11 | 20-minute workout follows every boundary | Ride page (planned) | ⬜ | |
| 12 | Pause and resume | Ride page (planned) | ⬜ | |
| 13 | Skip and back | Ride page (planned) | ⬜ | |
| 14 | Hidden tab for six minutes | Ride page (planned) | ⬜ | |
| 15 | Manual FIT upload to Strava and intervals.icu | FIT download (planned) | ⬜ | |
| 16 | Send to Strava, duplicate rejected | Strava upload (planned, needs a Strava app) | ⬜ | |
| 17 | Wahoo app via Strava sync (optional) | Strava upload (planned) | ⬜ | |
| - | Byte capture committed | Pull request 20 (in review) | ⬜ | File: |

## Wahoo proprietary fallback (unsupported)

FTMS is the supported control path. [Pull request 20](https://github.com/codyjohnsontx/wattSmith/pull/20) also carries a fallback through Wahoo's proprietary trainer characteristic for KICKR firmware without FTMS. It is off unless the app is built with `NEXT_PUBLIC_WATTSMITH_WAHOO_FALLBACK=1`, is used only when a trainer has no FTMS control point, and has never been verified on hardware. It is promoted to a supported path only if this script finds an FTMS gap on the KICKR CORE.

## Follow-ups

- _None recorded yet._
