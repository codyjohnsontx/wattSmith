import { describe, expect, it } from "vitest";
import type { Workout } from "@/lib/workout/types";
import { displayPower, segmentComparisons } from "./metrics";
import { createRideState, reduce } from "./reducer";
import { advanceRecorder, appendSample, createRecorder, finalizeRecorder, toActivityStreams } from "./recorder";
import type { RecorderSnapshot } from "./recorder";
import { buildTimeline } from "./timeline";
import type { RideEvent, RideState } from "./types";

const snap = (): RecorderSnapshot => ({
  targetWatts: 200,
  segmentIndex: 0,
  ergEnabled: true,
  paused: false,
});

describe("recorder", () => {
  it("averages bursty samples within a second and leaves silent seconds null", () => {
    let recorder = advanceRecorder(createRecorder(), 0, snap());
    for (const power of [200, 210, 220, 230]) recorder = appendSample(recorder, { power, cadence: 90, source: "trainer" });
    recorder = advanceRecorder(recorder, 1_000, snap());
    recorder = advanceRecorder(recorder, 2_000, snap());
    recorder = appendSample(recorder, { heartRate: 141, source: "heartRateMonitor" });
    recorder = appendSample(recorder, { heartRate: 142, source: "heartRateMonitor" });
    recorder = advanceRecorder(recorder, 3_000, snap());

    expect(recorder.rows.map(({ t, power, cadence, heartRate }) => ({ t, power, cadence, heartRate }))).toEqual([
      { t: 0, power: 215, cadence: 90, heartRate: null },
      { t: 1, power: null, cadence: null, heartRate: null },
      { t: 2, power: null, cadence: null, heartRate: 142 },
    ]);
  });

  it("fills seconds skipped by a long tick with empty rows", () => {
    let recorder = advanceRecorder(createRecorder(), 0, snap());
    recorder = appendSample(recorder, { power: 180, source: "trainer" });
    recorder = advanceRecorder(recorder, 3_500, snap());
    expect(recorder.rows.map((row) => [row.t, row.power])).toEqual([
      [0, 180],
      [1, null],
      [2, null],
    ]);
    expect(recorder.bucket?.second).toBe(3);
  });

  it("ignores samples before the first second opens", () => {
    expect(appendSample(createRecorder(), { power: 100, source: "trainer" })).toEqual(createRecorder());
  });

  it("closes a partial final second only if it holds time or data", () => {
    let recorder = advanceRecorder(createRecorder(), 0, snap());
    recorder = advanceRecorder(recorder, 2_000, snap());
    expect(finalizeRecorder(recorder, 2_000).rows).toHaveLength(2);
    expect(finalizeRecorder(recorder, 2_400).rows).toHaveLength(3);
    expect(finalizeRecorder(appendSample(recorder, { power: 1, source: "trainer" }), 2_000).rows).toHaveLength(3);
  });

  it("maps rows to the activity analysis stream shape", () => {
    const streams = toActivityStreams([
      { t: 0, targetWatts: 100, power: 98, cadence: 90, heartRate: 120, segmentIndex: 0, ergEnabled: true, paused: false },
      { t: 1, targetWatts: 100, power: null, cadence: null, heartRate: null, segmentIndex: 0, ergEnabled: true, paused: true },
    ]);
    expect(streams).toEqual({
      time: [0, 1],
      moving: [true, false],
      watts: [98, null],
      heartrate: [120, null],
      cadence: [90, null],
    });
  });
});

describe("ride recording through the reducer", () => {
  const workout: Workout = {
    id: "rec",
    name: "Rec",
    description: "",
    ftp: 200,
    blocks: [
      { id: "a", type: "steady", label: "A", targetMode: "single", durationSeconds: 10, targetPercentFTP: 50 },
      { id: "b", type: "steady", label: "B", targetMode: "single", durationSeconds: 10, targetPercentFTP: 100 },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  function ride(events: RideEvent[]): RideState {
    let state = createRideState({ timeline: buildTimeline(workout, 200), ftp: 200 });
    for (const event of [
      { type: "trainerStatus", nowMs: 0, status: "connected" } as const,
      { type: "command", nowMs: 0, command: "start" } as const,
      ...events,
    ]) {
      state = reduce(state, event);
    }
    return state;
  }

  it("writes one row per ride second with target, segment and pause flags", () => {
    const events: RideEvent[] = [];
    for (let t = 0; t < 25_000; t += 250) {
      events.push({ type: "tick", nowMs: t + 250 });
      if (t % 1_000 === 500) events.push({ type: "sample", nowMs: t + 250, power: t < 10_000 ? 100 : 200, source: "trainer" });
      if (t + 250 === 3_000) events.push({ type: "command", nowMs: 3_000, command: "pause" });
      if (t + 250 === 8_000) events.push({ type: "command", nowMs: 8_000, command: "resume" });
    }
    const state = ride(events);

    expect(state.status).toBe("finished");
    const rows = state.recorder.rows;
    expect(rows.map((r) => r.t)).toEqual(Array.from({ length: 25 }, (_, i) => i));
    // The pause at 3.0 s and the resume at 8.0 s land on row starts.
    expect(rows.map((r) => r.paused)).toEqual(Array.from({ length: 25 }, (_, i) => i >= 3 && i < 8));
    expect(rows[15].targetWatts).toBe(200);
    expect(rows[15].segmentIndex).toBe(1);
    expect(rows.every((r) => r.power !== null)).toBe(true);
  });

  // Ticks every 250 ms up to `toMs`, with `extra` events after the tick at their time.
  function script(toMs: number, extra: RideEvent[]): RideEvent[] {
    const events: RideEvent[] = [];
    for (let t = 250; t <= toMs; t += 250) {
      events.push({ type: "tick", nowMs: t }, ...extra.filter((e) => e.nowMs === t));
    }
    return events;
  }
  const at = (nowMs: number, command: "pause" | "stop" | "skip" | "back"): RideEvent => ({
    type: "command",
    nowMs,
    command,
  });

  it("records a pause on a second boundary in that second: pause then stop", () => {
    const state = ride(script(8_000, [at(3_000, "pause"), at(8_000, "stop")]));
    const streams = toActivityStreams(state.recorder.rows);
    expect(streams.time).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(streams.moving).toEqual([true, true, true, false, false, false, false, false]);
  });

  it("records a pause inside a second from the next row", () => {
    const state = ride(script(5_000, [at(2_500, "pause")]));
    expect(state.recorder.rows.map((r) => r.paused)).toEqual([false, false, false, true, true]);
  });

  it("records a skip on a second boundary in that second", () => {
    const state = ride(script(5_000, [at(3_000, "skip")]));
    expect(state.recorder.rows.map((r) => [r.segmentIndex, r.targetWatts])).toEqual([
      [0, 100],
      [0, 100],
      [0, 100],
      [1, 200],
      [1, 200],
    ]);
  });

  it("records a back on a second boundary in that second", () => {
    const state = ride(script(15_000, [at(12_000, "back")]));
    // 'back' at 12 s is 2 s into segment B, so it returns to segment A at 0 s.
    expect(state.recorder.rows.slice(10, 15).map((r) => [r.segmentIndex, r.targetWatts])).toEqual([
      [1, 200],
      [1, 200],
      [0, 100],
      [0, 100],
      [0, 100],
    ]);
  });

  it("records an FTP bias change on a second boundary in that second", () => {
    const state = ride(script(4_000, [{ type: "ftpBias", nowMs: 2_000, percent: 110 }]));
    expect(state.recorder.rows.map((r) => r.targetWatts)).toEqual([100, 100, 110, 110]);
  });

  it("tracks 3 s and 10 s power and planned vs actual per segment", () => {
    const events: RideEvent[] = [];
    for (let t = 1_000; t <= 12_000; t += 1_000) {
      events.push({ type: "tick", nowMs: t }, { type: "sample", nowMs: t, power: t <= 10_000 ? 90 : 210, source: "trainer" });
    }
    const state = ride(events);
    expect(displayPower(state)).toEqual({ threeSecond: 170, tenSecond: 114, instant: 210 });
    expect(segmentComparisons(state)).toEqual([
      { segmentIndex: 0, plannedWatts: 100, actualWatts: 90, sampleCount: 9 },
      { segmentIndex: 1, plannedWatts: 200, actualWatts: 170, sampleCount: 3 },
    ]);
  });
});
