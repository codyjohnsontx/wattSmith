import { describe, expect, it } from "vitest";
import type { Workout } from "@/lib/workout/types";
import { createRideHarness, flushPromises } from "../testUtils";
import { ManualClock, SimulatedTrainer } from "./SimulatedTrainer";
import type { TargetPowerResult, TrainerEvents } from "./Trainer";
import { clampToPowerRange } from "./Trainer";

type Sample = TrainerEvents["sample"];

async function connected(options: ConstructorParameters<typeof SimulatedTrainer>[1] = {}) {
  const clock = new ManualClock();
  const trainer = new SimulatedTrainer(clock, options);
  const samples: Sample[] = [];
  trainer.on("sample", (sample) => samples.push(sample));
  await trainer.connect();
  return { clock, trainer, samples };
}

// At FTP 200: 10 min at 150 W then 10 min at 200 W.
const workout: Workout = {
  id: "sim",
  name: "Sim",
  description: "",
  ftp: 200,
  blocks: [
    { id: "a", type: "steady", label: "A", targetMode: "single", durationSeconds: 600, targetPercentFTP: 75 },
    { id: "b", type: "steady", label: "B", targetMode: "single", durationSeconds: 600, targetPercentFTP: 100 },
  ],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("SimulatedTrainer model", () => {
  it("is deterministic for a seed", async () => {
    const run = async (seed: number) => {
      const { clock, trainer, samples } = await connected({ seed });
      await trainer.setTargetPower(200);
      clock.advance(60_000);
      return samples;
    };
    const first = await run(7);
    expect(first).toHaveLength(60);
    expect(await run(7)).toEqual(first);
    expect(await run(8)).not.toEqual(first);
  });

  it("approaches an ERG target with a short lag and a small overshoot", async () => {
    const { clock, trainer, samples } = await connected({ powerNoise: 0 });
    await trainer.setTargetPower(100);
    clock.advance(30_000);
    await trainer.setTargetPower(250);
    clock.advance(20_000);
    const afterStep = samples.slice(30).map((s) => s.power!);
    expect(afterStep[0]).toBeLessThan(250);
    expect(Math.max(...afterStep)).toBeGreaterThan(250);
    expect(Math.abs(afterStep.at(-1)! - 250)).toBeLessThanOrEqual(2);
  });

  it("follows cadence when ERG is off", async () => {
    const { clock, trainer, samples } = await connected({ powerNoise: 0, freeRideWatts: 150 });
    await trainer.setTargetPower(300);
    await trainer.setErgEnabled(false);
    clock.advance(30_000);
    expect(Math.abs(samples.at(-1)!.power! - 150)).toBeLessThan(15);
  });

  it("lags heart rate behind power", async () => {
    const { clock, trainer, samples } = await connected({ riderFtp: 250, restHeartRate: 60, maxHeartRate: 185 });
    await trainer.setTargetPower(250);
    clock.advance(180_000);
    expect(samples[9].heartRate!).toBeLessThan(60 + (185 - 60) * 0.4);
    expect(samples.at(-1)!.heartRate!).toBeGreaterThan(175);
  });

  it("clamps targets to the reported power range", () => {
    expect(clampToPowerRange(1234, { minWatts: 0, maxWatts: 1000, incrementWatts: 1 })).toBe(1000);
    expect(clampToPowerRange(-5, { minWatts: 0, maxWatts: 1000, incrementWatts: 1 })).toBe(0);
    expect(clampToPowerRange(203, { minWatts: 0, maxWatts: 1000, incrementWatts: 5 })).toBe(205);
    expect(clampToPowerRange(203.4, null)).toBe(203);
  });
});

describe("SimulatedTrainer failure injection", () => {
  it("dropConnectionAt with recovery pauses the ride and resumes it at the same workout position", async () => {
    const harness = createRideHarness({ workout, ftp: 200 });
    harness.trainer.dropConnectionAt(120, 8_000);
    await harness.start();
    const statuses: string[] = [];
    harness.trainer.on("status", (status) => statuses.push(status));

    harness.advance(121_000);
    expect(harness.state.status).toBe("paused");
    expect(harness.state.pauseReason).toBe("trainer");
    const frozenAt = harness.state.elapsedMs;
    expect(frozenAt).toBe(120_000);

    harness.advance(5_000);
    expect(harness.state.elapsedMs).toBe(frozenAt);

    harness.advance(4_000);
    expect(statuses).toEqual(["reconnecting", "connected"]);
    expect(harness.state.status).toBe("riding");
    expect(harness.trainer.targetWatts).toBe(150);

    harness.advance(600_000);
    // Reconnected at 128 s of ride time; the workout resumes from 120 s.
    expect(harness.state.elapsedMs).toBe(120_000 + (730_000 - 128_000));
    expect(harness.trainer.targetWatts).toBe(200);
  });

  it("dropConnectionAt without recovery ends in disconnected and rejects writes", async () => {
    const harness = createRideHarness({ workout, ftp: 200 });
    harness.trainer.dropConnectionAt(30);
    const disconnects: string[] = [];
    harness.trainer.on("disconnect", ({ reason }) => disconnects.push(reason));
    await harness.start();

    harness.advance(60_000);
    expect(harness.trainer.status).toBe("disconnected");
    expect(disconnects).toEqual(["link lost"]);
    expect(harness.state.status).toBe("paused");
    expect(harness.state.elapsedMs).toBe(30_000);
    await expect(harness.trainer.setTargetPower(100)).resolves.toEqual({ status: "rejected", reason: "notConnected" });
  });

  it("delayControlResponse holds one write in flight and lets the newest queued write win", async () => {
    const { clock, trainer } = await connected();
    trainer.delayControlResponse(300);
    const results: TargetPowerResult[] = [];
    const record = (index: number) => (result: TargetPowerResult) => {
      results[index] = result;
    };
    void trainer.setTargetPower(100).then(record(0));
    void trainer.setTargetPower(110).then(record(1));
    void trainer.setTargetPower(120).then(record(2));

    await flushPromises();
    expect(results[1]).toEqual({ status: "superseded" });
    expect(trainer.targetWatts).toBeNull();

    clock.advance(300);
    await flushPromises();
    expect(results[0]).toEqual({ status: "applied", watts: 100, clamped: false });
    expect(trainer.targetWatts).toBe(100);

    clock.advance(300);
    await flushPromises();
    expect(results[2]).toEqual({ status: "applied", watts: 120, clamped: false });
    expect(trainer.targetWatts).toBe(120);
  });

  it("delayControlResponse beyond the timeout reports a timeout but the trainer still applies the target", async () => {
    const { clock, trainer } = await connected({ controlTimeoutMs: 1_000 });
    trainer.delayControlResponse(1_500);
    let result: TargetPowerResult | undefined;
    void trainer.setTargetPower(180).then((r) => (result = r));

    clock.advance(1_000);
    await flushPromises();
    expect(result).toEqual({ status: "timeout" });
    expect(trainer.targetWatts).toBeNull();

    clock.advance(500);
    expect(trainer.targetWatts).toBe(180);
  });

  it("rejectTargetsAbove makes the trainer clamp to its reported range and retry once", async () => {
    const { trainer } = await connected();
    trainer.rejectTargetsAbove(250);
    expect(trainer.capabilities.powerRange?.maxWatts).toBe(250);
    await expect(trainer.setTargetPower(300)).resolves.toEqual({ status: "applied", watts: 250, clamped: true });
    await expect(trainer.setTargetPower(240)).resolves.toEqual({ status: "applied", watts: 240, clamped: false });
    expect(trainer.targetWatts).toBe(240);
  });

  it("rejectTargetsAbove caps a biased ride at the trainer's limit", async () => {
    const harness = createRideHarness({ workout, ftp: 200 });
    harness.trainer.rejectTargetsAbove(250);
    await harness.start();
    harness.dispatch({ type: "ftpBias", nowMs: 0, percent: 150 });
    harness.advance(700_000);
    await flushPromises();
    expect(harness.trainer.targetWatts).toBe(250);
    expect(harness.writes.at(-1)?.watts).toBe(300);
    expect(harness.writes.at(-1)?.result).toEqual({ status: "applied", watts: 250, clamped: true });
  });

  it("auto-pauses when the rider stops pedaling and resumes on the first stroke", async () => {
    const harness = createRideHarness({ workout, ftp: 200 });
    await harness.start();
    harness.advance(60_000);
    harness.trainer.setCadence(0);
    harness.advance(10_000);
    expect(harness.state.status).toBe("paused");
    expect(harness.state.pauseReason).toBe("autoPause");
    const heldAt = harness.state.elapsedMs;
    harness.trainer.setCadence(90);
    harness.advance(3_000);
    expect(harness.state.status).toBe("riding");
    expect(heldAt).toBeGreaterThanOrEqual(65_000);
    expect(heldAt).toBeLessThanOrEqual(67_000);
  });

  it("omitCadence disables auto-pause even when the rider stops", async () => {
    const harness = createRideHarness({ workout, ftp: 200 });
    harness.trainer.omitCadence();
    await harness.start();
    harness.advance(10_000);
    harness.trainer.setCadence(0);
    harness.advance(30_000);
    expect(harness.state.status).toBe("riding");
    expect(harness.trainer.capabilities.cadence).toBe(false);
    expect(harness.state.recorder.rows.slice(1).every((row) => row.cadence === null && row.power !== null)).toBe(true);
  });

  it("omitHeartRate records null heart rate without pausing", async () => {
    const harness = createRideHarness({ workout, ftp: 200 });
    harness.trainer.omitHeartRate();
    await harness.start();
    harness.advance(30_000);
    expect(harness.state.status).toBe("riding");
    expect(harness.state.recorder.rows.every((row) => row.heartRate === null)).toBe(true);
    expect(harness.state.recorder.rows.slice(1).every((row) => row.cadence !== null)).toBe(true);
  });

  it("runs a full hour-long ride quickly", async () => {
    const long: Workout = {
      ...workout,
      blocks: [{ id: "x", type: "steady", label: "X", targetMode: "single", durationSeconds: 3600, targetPercentFTP: 70 }],
    };
    const harness = createRideHarness({ workout: long, ftp: 200 });
    const started = performance.now();
    await harness.start();
    harness.advance(3_601_000);
    expect(harness.state.status).toBe("finished");
    expect(harness.state.recorder.rows).toHaveLength(3600);
    expect(performance.now() - started).toBeLessThan(5_000);
  });
});
