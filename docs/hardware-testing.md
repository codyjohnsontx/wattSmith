# Hardware Testing

Wattsmith controls a smart trainer from the browser over Web Bluetooth. Two layers give confidence that this works:

1. **Automated tests (always run in CI).** The byte codecs are tested against committed byte vectors, and the whole Bluetooth layer (connect, control point, reconnect) runs against a simulated FTMS trainer. No hardware is needed.
2. **The hardware test script below (owner, on a real KICKR CORE).** It is the only check that a real trainer accepts the commands and follows the targets.

## Layer 1: Automated Tests

```shell
npm run test
```

- `src/lib/ride/trainer/web/codec.test.ts`: every vector in `src/lib/ride/trainer/web/fixtures/spec-vectors.json`. The vectors were hand-encoded from the Bluetooth SIG layouts: Fitness Machine Service v1.0 (Feature 4.3, Indoor Bike Data 4.9, Supported Power Range 4.14, Control Point 4.16, Status 4.17) and the GATT Specification Supplement for Indoor Bike Data, Cycling Power Measurement and Heart Rate Measurement. Any `kickr-core-*.json` capture committed next to them (see "Byte capture" below) is decoded too.
- `src/lib/ride/trainer/web/WebBluetoothTrainer.test.ts`: connect sequence (Request Control, then Start or Resume), 150 W then 250 W, range clamping, one control point write in flight, timeouts, retry after "operation failed" with a stopped flywheel, control taken by another app, reconnect after power loss, giving up after 60 s, and a connected-but-silent trainer.
- `src/lib/ride/trainer/web/diagnosticChecks.test.ts`: the pass/fail rules the diagnostics page shows for each step below.

One spec disagreement is handled in code: FTMS v1.0 defines the Indoor Bike Data Resistance Level as sint16, the current GSS as uint8. The decoder picks the width from the payload length.

## Layer 2: Hardware Test Script

Open `/ride/devices` (sign in first). Each step below has a matching row in the page's **Hardware test script** panel that turns **Pass**, **Fail** or **Waiting** on its own. Steps marked **Observe** need your eyes and a note in the results table.

To try the page without a trainer, open `/ride/devices?device=fake`. It uses a simulated FTMS trainer with "Unplug" and "Another app takes control" buttons.

### Before you start

- KICKR CORE powered on, firmware updated in the Wahoo app.
- In the Wahoo app, turn off **ERG Mode Power Smoothing** so the reported power is real. Then **fully close the Wahoo app**, Zwift, and any head unit that could control the trainer: only one app can control it at a time.
- Chrome (or Edge) on the Mac, with Bluetooth allowed in System Settings > Privacy & Security > Bluetooth > Google Chrome. Without that permission the chooser is empty.
- The page must be served over HTTPS or from `http://localhost` (`npm run dev`). Firefox, Safari and every browser on iPhone and iPad cannot connect: the page says so instead of failing.
- Optional: heart rate strap on. Laptop on mains power.

### Steps

| # | Do this | Pass looks like |
| --- | --- | --- |
| 1 | Press **Connect trainer** and pick the KICKR in the chooser. Note the name shown, and whether it appears once or twice. | Row 1 passes and the status pill says **connected**. |
| 2 | Look at **Services and characteristics**. | Row 2 passes: Fitness Machine (0x1826) and Cycling Power (0x1818) found. Note whether the Wahoo characteristic `a026e005` is present. |
| 3 | Check the **Devices** panel (firmware, power range, control). | Row 3 passes: power, cadence and power target supported, and a power range (expected about 0-2000 W). Write down the range. |
| 4 | Pedal. | Row 4 passes: power and cadence from Indoor Bike Data at least once a second, and the Cycling Power average within 5 W or 3% of the Indoor Bike Data average (whichever is larger), both averaged over 3 s. A trainer without Cycling Power fails this row. |
| 5 | Keep a steady cadence. Press **Set 150 W**, wait for it to settle, then **Set 250 W**. Then try **Set 100 W** and **Set 30 W**. | Row 5 passes: each target answers within 1 s and power settles inside 5 % of the target (the page judges within 6 s; expect about 3 s). The ERG control table shows response time, settle time and overshoot for every press: copy them into the results. Record the lowest target the trainer can hold at your cadence. |
| 6 | At 150 W, stop pedaling for 15 s, then pedal again. | **Observe**: does resistance come back at 150 W without pressing anything? If the trainer answered "operation failed" while stopped, the log shows "Pedaling again: re-sending 150 W." |
| 7 | Stop pedaling and wait 60 s. | **Observe**: does the link stay connected? Row 7 counts Fitness Machine Status events. |
| 8 | Unplug the trainer's power for 10 s, then plug it back in. | The page shows an amber **Reconnecting** banner, then row 8 passes: reconnected without the chooser, target re-sent. If it gives up after 60 s, row 8 fails and a **Reconnect** button appears. Then reload the page: the chooser is expected to be needed again. Note whether `chrome://flags/#enable-web-bluetooth-new-permissions-backend` is on. |
| 9 | Press **Connect heart rate** and pick the strap. Disconnect it and connect it again. | Row 9 passes: first reading within 5 s. |
| 10 | Open the Wahoo app on your phone while the page is connected. | **Observe**: does the Wahoo app connect and read power? Does the page lose control (red "Another app took control" banner, row 10 counts it)? Write down the firmware version the Wahoo app shows. |

Steps 11 to 17 (riding a workout, FIT upload) arrive with the ride page and FIT recording.

### Byte capture

During steps 4 and 5, press **Record 30 s of raw notifications**. Pedal and set a target or two while it records. The page downloads `kickr-core-<firmware>.json`. Commit it under `src/lib/ride/trainer/web/fixtures/` unchanged: `codec.test.ts` then decodes every real notification in CI from then on.

### Results

Record one row per session.

| Date | Commit | Firmware | Chrome | macOS | Steps passed | Power range | 150 W settle | 250 W settle | Lowest target | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| | | | | | | | | | | |

## Wahoo proprietary fallback (unsupported)

FTMS is the supported control path. A fallback through Wahoo's proprietary trainer characteristic (`a026e005-0a7d-4ab3-97fa-f1500f9feb8b`, unlock `20 EE FC`, ERG `42 <watts uint16 LE>`) exists for KICKR firmware without FTMS. It is off unless the app is built with `NEXT_PUBLIC_WATTSMITH_WAHOO_FALLBACK=1`, is used only when a trainer has no FTMS control point, and has never been verified on hardware. The diagnostics page shows "Wahoo fallback (unsupported)" as the control path when it is in use.
