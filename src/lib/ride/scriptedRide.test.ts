import { describe, expect, it } from "vitest";
import { exportWorkoutToErg } from "@/lib/workout/exportErg";
import { exportTestFixtures } from "@/lib/workout/exportFixtures";
import { currentTarget } from "./engine/reducer";
import { toActivityStreams } from "./engine/recorder";
import { createRideHarness } from "./testUtils";

// Ties the ride to the already-verified export path: a scripted 30-minute ride
// on the simulated trainer must hold, every second, the target a third-party
// app interpolates from the workout's exported .erg file.

interface ErgPoint {
  seconds: number;
  watts: number;
}

function parseErgCourseData(content: string): ErgPoint[] {
  const lines = content.split("\n");
  return lines
    .slice(lines.indexOf("[COURSE DATA]") + 1, lines.indexOf("[END COURSE DATA]"))
    .map((line) => {
      const [minutes, watts] = line.split("\t").map(Number);
      return { seconds: Math.round(minutes * 60), watts };
    });
}

// Points come in start/end pairs per segment; a boundary second belongs to the
// segment that starts there.
function ergTargetAt(points: ErgPoint[], seconds: number): number | null {
  for (let i = 0; i < points.length; i += 2) {
    const [start, end] = [points[i], points[i + 1]];
    if (seconds >= start.seconds && seconds < end.seconds) {
      return Math.round(start.watts + ((end.watts - start.watts) * (seconds - start.seconds)) / (end.seconds - start.seconds));
    }
  }
  return null;
}

const RIDE_SECONDS = 30 * 60;

describe("scripted 30-minute ride matches the .erg export", () => {
  for (const id of ["fixture-repeats", "fixture-ramps"]) {
    it(`${id}: engine and trainer targets equal the .erg interpolation every second`, async () => {
      const workout = exportTestFixtures.find((fixture) => fixture.id === id)!;
      const points = parseErgCourseData(exportWorkoutToErg(workout));
      const harness = createRideHarness({ workout, ftp: workout.ftp });
      await harness.start();

      const mismatches: string[] = [];
      for (let second = 0; second < RIDE_SECONDS; second += 1) {
        if (second > 0) harness.advance(1_000);
        const expected = ergTargetAt(points, second);
        const target = currentTarget(harness.state)?.watts;
        if (harness.state.elapsedMs !== second * 1000 || target !== expected || harness.trainer.targetWatts !== expected) {
          mismatches.push(`${second}s: erg ${expected}, engine ${target}, trainer ${harness.trainer.targetWatts}`);
        }
      }

      expect(mismatches).toEqual([]);
      expect(harness.state.status).toBe("riding");

      harness.command("stop");
      const rows = harness.state.recorder.rows;
      expect(rows).toHaveLength(RIDE_SECONDS);
      rows.forEach((row) => expect(row.targetWatts, `row ${row.t}`).toBe(ergTargetAt(points, row.t)));

      // The simulator samples at 1 Hz from 1 s in, so second 0 is empty.
      const streams = toActivityStreams(rows);
      expect(streams.watts?.slice(1).every((watts) => watts !== null)).toBe(true);
      expect(streams.heartrate?.slice(1).every((hr) => hr !== null)).toBe(true);

      // ERG on the simulator holds the plan: mean error under 5 % of target.
      const errors = rows.slice(1).map((row) => Math.abs(row.power! - row.targetWatts!) / row.targetWatts!);
      expect(errors.reduce((sum, e) => sum + e, 0) / errors.length).toBeLessThan(0.05);
    });
  }
});
