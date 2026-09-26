// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { Workout } from "@/lib/workout/types";
import { importFixtureDir, importOk, readFixture } from "./importTestUtils";
import { domXmlParser } from "./importFile";
import { createRideHarness } from "./testUtils";
import type { TrainerEvents } from "./trainer/Trainer";

function importZwo(text: string): Workout {
  return importOk(text, { parseXml: domXmlParser, fileName: "ride.zwo" }).workout;
}

function rideWithSimulator(workout: Workout) {
  const harness = createRideHarness({
    workout,
    ftp: 200,
    trainerOptions: { powerNoise: 0, freeRideWatts: 400 },
  });
  const ergModes = vi.spyOn(harness.trainer, "setErgEnabled");
  const samples: TrainerEvents["sample"][] = [];
  harness.trainer.on("sample", (sample) => samples.push(sample));
  const powerAt = (ms: number) => samples.find((sample) => sample.timestampMs === ms)?.power ?? NaN;
  return { harness, ergModes, powerAt };
}

describe("free ride on the simulated trainer", () => {
  it("lets the rider ride free after the group ride warmup instead of holding its last target", async () => {
    const workout = importZwo(readFixture(importFixtureDir, "zwo", "group_ride_freeride.zwo"));
    const { harness, ergModes, powerAt } = rideWithSimulator(workout);
    await harness.start();

    harness.advance(599_000);
    expect(harness.trainer.targetWatts).toBe(140);
    expect(ergModes).not.toHaveBeenCalled();

    harness.advance(3_020_000 - 599_000 - 1_000);
    expect(harness.state.status).toBe("riding");
    expect(ergModes.mock.calls).toEqual([[false]]);
    expect(harness.writes.filter((write) => write.atMs >= 600_000)).toEqual([]);
    for (const ms of [630_000, 1_500_000, 2_410_000, 3_000_000]) {
      expect(Math.abs(powerAt(ms) - 400)).toBeLessThan(40);
    }
  });

  it("releases a MaxEffort after an IntervalsT On block and restores ERG for the next block", async () => {
    const workout = importZwo(`<workout_file><name>Finisher</name><sportType>bike</sportType><workout>
      <IntervalsT Repeat="2" OnDuration="60" OffDuration="0" OnPower="1.15"/>
      <MaxEffort Duration="30"/>
      <SteadyState Duration="120" Power="0.6"/>
    </workout></workout_file>`);
    const { harness, ergModes, powerAt } = rideWithSimulator(workout);
    await harness.start();

    harness.advance(119_000);
    expect(harness.trainer.targetWatts).toBe(230);
    expect(Math.abs(powerAt(119_000) - 230)).toBeLessThan(5);

    harness.advance(29_000);
    expect(ergModes.mock.calls).toEqual([[false]]);
    expect(Math.abs(powerAt(148_000) - 400)).toBeLessThan(40);

    harness.advance(40_000);
    expect(ergModes.mock.calls).toEqual([[false], [true]]);
    expect(harness.trainer.targetWatts).toBe(120);
    expect(Math.abs(powerAt(188_000) - 120)).toBeLessThan(5);
  });
});
