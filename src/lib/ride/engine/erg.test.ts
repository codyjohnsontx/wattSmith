import { describe, expect, it } from "vitest";
import type { Workout } from "@/lib/workout/types";
import { createRideState, reduce } from "./reducer";
import { buildTimeline } from "./timeline";
import type { EngineOptions, RideEvent, RideState } from "./types";

// At FTP 200: 60 s at 100 W, then a 600 s ramp 100 -> 160 W, then 60 s at 160 W.
const workout: Workout = {
  id: "erg-test",
  name: "ERG test",
  description: "",
  ftp: 200,
  blocks: [
    { id: "a", type: "warmup", label: "Easy", targetMode: "single", durationSeconds: 60, targetPercentFTP: 50 },
    { id: "b", type: "steady", label: "Ramp", targetMode: "ramp", durationSeconds: 600, startPercentFTP: 50, endPercentFTP: 80 },
    { id: "c", type: "steady", label: "Hold", targetMode: "single", durationSeconds: 60, targetPercentFTP: 80 },
  ],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

interface Write {
  atMs: number;
  watts: number;
}

// Rides the whole workout with ticks every `tickMs` and collects target writes.
function rideWrites(options: Partial<EngineOptions> = {}, tickMs = 250): { writes: Write[]; state: RideState } {
  let state = createRideState({ timeline: buildTimeline(workout, 200), ftp: 200, options });
  const writes: Write[] = [];
  const apply = (event: RideEvent) => {
    state = reduce(state, event);
    for (const command of state.trainerCommands) {
      if (command.type === "setTargetPower") writes.push({ atMs: event.nowMs, watts: command.watts });
    }
  };
  apply({ type: "trainerStatus", nowMs: 0, status: "connected" });
  apply({ type: "command", nowMs: 0, command: "start" });
  for (let t = tickMs; state.status === "riding"; t += tickMs) apply({ type: "tick", nowMs: t });
  return { writes, state };
}

describe("ERG command policy", () => {
  it("writes ramp steps of 1 W no faster than every 250 ms, and nothing extra on steady blocks", () => {
    const { writes } = rideWrites();
    const rampWrites = writes.filter((w) => w.atMs > 60_000 && w.atMs < 660_000);

    // 100 -> 160 W is 60 one-watt steps; a 10 s re-send never lands on a ramp
    // because each step comes every 10 s and resets that timer.
    expect(rampWrites.length).toBeGreaterThanOrEqual(59);
    expect(rampWrites.length).toBeLessThanOrEqual(61);
    for (let i = 1; i < writes.length; i += 1) {
      expect(writes[i].atMs - writes[i - 1].atMs).toBeGreaterThanOrEqual(250);
    }
    for (let i = 1; i < rampWrites.length; i += 1) {
      expect(Math.abs(rampWrites[i].watts - rampWrites[i - 1].watts)).toBeLessThanOrEqual(1);
    }
  });

  it("re-sends an unchanged target every 10 s", () => {
    const { writes } = rideWrites();
    const steady = writes.filter((w) => w.atMs < 60_000);
    expect(steady.map((w) => w.atMs)).toEqual([0, 10_000, 20_000, 30_000, 40_000, 50_000]);
    expect(new Set(steady.map((w) => w.watts))).toEqual(new Set([100]));
  });

  it("switches targets exactly at a boundary by default", () => {
    const { writes } = rideWrites({ ergResendMs: 1_000_000 });
    const hold = writes.find((w) => w.watts === 160);
    expect(hold?.atMs).toBeLessThanOrEqual(660_000);
    const firstRampWrite = writes.find((w) => w.watts === 101);
    // The ramp reaches 100.5 W (rounds to 101) 5 s after it starts.
    expect(firstRampWrite?.atMs).toBe(65_000);
  });

  it("applies lead time to segment boundaries only", () => {
    const steps: Workout = {
      ...workout,
      blocks: [
        { id: "a", type: "steady", label: "A", targetMode: "single", durationSeconds: 60, targetPercentFTP: 50 },
        { id: "b", type: "steady", label: "B", targetMode: "single", durationSeconds: 60, targetPercentFTP: 100 },
      ],
    };
    let state = createRideState({ timeline: buildTimeline(steps, 200), ftp: 200, options: { ergLeadTimeMs: 2_000 } });
    const writes: Write[] = [];
    state = reduce(state, { type: "trainerStatus", nowMs: 0, status: "connected" });
    state = reduce(state, { type: "command", nowMs: 0, command: "start" });
    for (let t = 250; t <= 60_000; t += 250) {
      state = reduce(state, { type: "tick", nowMs: t });
      for (const c of state.trainerCommands) if (c.type === "setTargetPower") writes.push({ atMs: t, watts: c.watts });
    }
    expect(writes.find((w) => w.watts === 200)?.atMs).toBe(58_000);
  });

  describe("free-ride segments", () => {
    const freeRide = () => {
      const timeline = buildTimeline(workout, 200).map((s) => (s.index === 1 ? { ...s, ergEnabled: false } : s));
      let state = createRideState({ timeline, ftp: 200 });
      state = reduce(state, { type: "trainerStatus", nowMs: 0, status: "connected" });
      return reduce(state, { type: "command", nowMs: 0, command: "start" });
    };
    const commandsOver = (from: RideState, fromMs: number, toMs: number) => {
      let state = from;
      const commands = [];
      for (let t = fromMs + 250; t <= toMs; t += 250) {
        state = reduce(state, { type: "tick", nowMs: t });
        commands.push(...state.trainerCommands);
      }
      return { state, commands };
    };

    it("turns trainer ERG off entering one and back on, with the target, leaving it", () => {
      let state = freeRide();
      expect(state.trainerCommands).toEqual([{ type: "setTargetPower", watts: 100 }]);

      state = reduce(state, { type: "command", nowMs: 0, command: "skip" });
      expect(state.trainerCommands).toEqual([{ type: "setErgMode", enabled: false }]);
      expect(state.trainerErgMode).toBe(false);
      expect(state.ergEnabled).toBe(true);

      const inside = commandsOver(state, 0, 30_000);
      expect(inside.commands).toEqual([]);

      state = reduce(inside.state, { type: "command", nowMs: 30_000, command: "skip" });
      expect(state.trainerCommands).toEqual([
        { type: "setErgMode", enabled: true },
        { type: "setTargetPower", watts: 160 },
      ]);
    });

    it("switches modes at a free-ride boundary reached by riding", () => {
      const { commands } = commandsOver(freeRide(), 0, 61_000);
      expect(commands.filter((c) => c.type === "setErgMode")).toEqual([{ type: "setErgMode", enabled: false }]);
    });

    it("re-enters ERG for the pause target and leaves it again on resume", () => {
      let state = reduce(freeRide(), { type: "command", nowMs: 0, command: "skip" });
      state = reduce(state, { type: "command", nowMs: 0, command: "pause" });
      expect(state.trainerCommands).toEqual([
        { type: "setErgMode", enabled: true },
        { type: "setTargetPower", watts: 50 },
      ]);
      state = reduce(state, { type: "command", nowMs: 1_000, command: "resume" });
      expect(state.trainerCommands).toEqual([{ type: "setErgMode", enabled: false }]);
    });

    it("records no target inside one", () => {
      const state = reduce(freeRide(), { type: "command", nowMs: 0, command: "skip" });
      const { state: after } = commandsOver(state, 0, 3_000);
      expect(after.recorder.rows.map((r) => [r.targetWatts, r.ergEnabled])).toEqual([
        [null, false],
        [null, false],
        [null, false],
      ]);
    });
  });
});
