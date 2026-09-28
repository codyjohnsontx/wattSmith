import { exportTestFixtures } from "@/lib/workout/exportFixtures";
import type { FitRideInput } from "./formats/fit/encoder";
import { createRideHarness } from "./testUtils";

// Test-only: a scripted 20-minute ride on the simulated trainer, recorded by
// the engine, as FIT encoder input. It covers a pause, a skipped segment and a
// free-ride segment (no target), so the file carries every case the encoder
// handles. Deterministic, so the golden .fit in docs/ride-fixtures is stable.

export const FIT_FIXTURE_WORKOUT_NAME = "Fixture Repeats";
// 2026-09-27 06:30 in UTC-5.
export const FIT_FIXTURE_START_MS = Date.UTC(2026, 8, 27, 11, 30, 0);

export async function recordFitFixtureRide(): Promise<FitRideInput> {
  const workout = exportTestFixtures.find((fixture) => fixture.name === FIT_FIXTURE_WORKOUT_NAME)!;
  const harness = createRideHarness({
    workout,
    ftp: workout.ftp,
    // The third VO2 interval is ridden free.
    mapTimeline: (timeline) => timeline.map((segment) => (segment.index === 5 ? { ...segment, ergEnabled: false } : segment)),
    trainerOptions: { freeRideWatts: 260 },
  });
  await harness.start();
  harness.advance(5 * 60_000);
  harness.command("pause");
  harness.advance(45_000);
  harness.command("resume");
  harness.advance(4 * 60_000);
  harness.command("skip");
  // Stop in the final second so the ride records exactly 20 minutes.
  harness.advance(20 * 60_000 - 9 * 60_000 - 45_000 - 1_000);
  harness.command("stop");

  return {
    startMs: FIT_FIXTURE_START_MS,
    utcOffsetMinutes: -300,
    rows: harness.state.recorder.rows,
    serialNumber: 0x5eed_1234,
    softwareVersion: 0.1,
    ftp: workout.ftp,
    trainerName: "KICKR CORE 5A1B",
    heartRateMonitorName: "TICKR 1234",
  };
}
