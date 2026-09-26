import { describe, expect, it } from "vitest";
import type { Workout } from "@/lib/workout/types";
import { segmentComparisons } from "./metrics";
import { createRideState, currentTarget, reduce } from "./reducer";
import { buildTimeline } from "./timeline";
import type { EngineOptions, RideCommand, RideEvent, RideState, RideStatus, TrainerStatus } from "./types";

// At FTP 200: 0-60 s 100 W, 60-120 s ramp 100 -> 200 W, 120-180 s 300 W.
const workout: Workout = {
  id: "engine-test",
  name: "Engine test",
  description: "",
  ftp: 250,
  blocks: [
    { id: "a", type: "warmup", label: "Easy", targetMode: "single", durationSeconds: 60, targetPercentFTP: 50 },
    { id: "b", type: "steady", label: "Ramp", targetMode: "ramp", durationSeconds: 60, startPercentFTP: 50, endPercentFTP: 100 },
    { id: "c", type: "steady", label: "Hard", targetMode: "single", durationSeconds: 60, targetPercentFTP: 150 },
  ],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function initial(options?: Partial<EngineOptions>): RideState {
  return createRideState({ timeline: buildTimeline(workout, 200), ftp: 200, options });
}

function run(state: RideState, events: RideEvent[]): RideState {
  return events.reduce(reduce, state);
}

const status = (nowMs: number, value: TrainerStatus): RideEvent => ({ type: "trainerStatus", nowMs, status: value });
const command = (nowMs: number, value: RideCommand): RideEvent => ({ type: "command", nowMs, command: value });
const tick = (nowMs: number): RideEvent => ({ type: "tick", nowMs });
const cadence = (nowMs: number, rpm: number): RideEvent => ({
  type: "sample",
  nowMs,
  cadence: rpm,
  power: rpm > 0 ? 150 : 0,
  source: "trainer",
});

// Ticks every 250 ms from `fromMs` (exclusive) through `toMs`.
function ticks(fromMs: number, toMs: number): RideEvent[] {
  const events: RideEvent[] = [];
  for (let t = fromMs + 250; t <= toMs; t += 250) events.push(tick(t));
  return events;
}

const ready = () => run(initial(), [status(0, "connected")]);
const riding = () => run(ready(), [command(0, "start")]);
const paused = () => run(riding(), [...ticks(0, 10_000), command(10_000, "pause")]);

describe("ride reducer transitions", () => {
  const cases: Array<{ name: string; from: () => RideState; events: RideEvent[]; to: RideStatus; check?: (s: RideState) => void }> = [
    { name: "idle stays idle while connecting", from: initial, events: [status(0, "connecting")], to: "idle" },
    { name: "idle -> ready on trainer connected", from: initial, events: [status(0, "connected")], to: "ready" },
    { name: "ready -> idle when the trainer drops", from: ready, events: [status(5, "disconnected")], to: "idle" },
    { name: "ready -> riding on start", from: ready, events: [command(0, "start")], to: "riding" },
    { name: "idle ignores start", from: initial, events: [command(0, "start")], to: "idle" },
    { name: "ready ignores pause", from: ready, events: [command(0, "pause")], to: "ready" },
    {
      name: "riding -> paused on pause",
      from: riding,
      events: [command(1_000, "pause")],
      to: "paused",
      check: (s) => expect(s.pauseReason).toBe("manual"),
    },
    { name: "riding ignores resume", from: riding, events: [command(1_000, "resume")], to: "riding" },
    { name: "paused -> riding on resume", from: paused, events: [command(12_000, "resume")], to: "riding" },
    {
      name: "paused stays paused on resume while the trainer is away",
      from: paused,
      events: [status(11_000, "reconnecting"), command(12_000, "resume")],
      to: "paused",
    },
    {
      name: "riding -> paused when the trainer reconnects",
      from: riding,
      events: [status(1_000, "reconnecting")],
      to: "paused",
      check: (s) => expect(s.pauseReason).toBe("trainer"),
    },
    {
      name: "trainer pause -> riding when the trainer is back",
      from: riding,
      events: [status(1_000, "reconnecting"), status(4_000, "connected")],
      to: "riding",
    },
    {
      name: "manual pause survives a reconnect and re-sends the pause target",
      from: paused,
      events: [status(11_000, "reconnecting"), status(12_000, "connected")],
      to: "paused",
      check: (s) => expect(s.trainerCommands).toEqual([{ type: "setTargetPower", watts: 50 }]),
    },
    {
      name: "pausing a trainer-paused ride makes it manual",
      from: riding,
      events: [status(1_000, "reconnecting"), command(2_000, "pause"), status(3_000, "connected")],
      to: "paused",
      check: (s) => expect(s.pauseReason).toBe("manual"),
    },
    {
      name: "stays riding before autoPauseAfterMs of zero cadence",
      from: riding,
      events: [cadence(1_000, 0), ...ticks(1_000, 5_750)],
      to: "riding",
    },
    {
      name: "auto-pause fires at autoPauseAfterMs",
      from: riding,
      events: [cadence(1_000, 0), ...ticks(1_000, 6_000)],
      to: "paused",
      check: (s) => expect(s.pauseReason).toBe("autoPause"),
    },
    {
      name: "auto-pause -> riding on the first pedal stroke",
      from: riding,
      events: [cadence(1_000, 0), ...ticks(1_000, 6_000), cadence(7_000, 60)],
      to: "riding",
    },
    {
      name: "auto-pause without autoResume waits for resume",
      from: () => run(initial({ autoResume: false }), [status(0, "connected"), command(0, "start")]),
      events: [cadence(1_000, 0), ...ticks(1_000, 6_000), cadence(7_000, 60)],
      to: "paused",
    },
    {
      name: "manual pause ignores pedaling",
      from: paused,
      events: [cadence(11_000, 90)],
      to: "paused",
    },
    {
      name: "no auto-pause when the trainer reports no cadence",
      from: riding,
      events: [{ type: "sample", nowMs: 1_000, power: 0, source: "trainer" }, ...ticks(1_000, 20_000)],
      to: "riding",
    },
    {
      name: "no auto-pause when disabled",
      from: () => run(initial({ autoPause: false }), [status(0, "connected"), command(0, "start")]),
      events: [cadence(1_000, 0), ...ticks(1_000, 20_000)],
      to: "riding",
    },
    {
      name: "riding -> finished at the end of the timeline",
      from: riding,
      events: ticks(0, 180_000),
      to: "finished",
      check: (s) => expect(s.elapsedMs).toBe(180_000),
    },
    { name: "riding -> finished on stop", from: riding, events: [command(3_000, "stop")], to: "finished" },
    { name: "paused -> finished on stop", from: paused, events: [command(11_000, "stop")], to: "finished" },
    {
      name: "skip in the last segment finishes",
      from: riding,
      events: [command(0, "skip"), command(0, "skip"), command(0, "skip")],
      to: "finished",
    },
    { name: "finished ignores resume", from: () => run(riding(), [command(1, "stop")]), events: [command(2, "resume")], to: "finished" },
    { name: "idle -> aborted on discard", from: initial, events: [command(0, "discard")], to: "aborted" },
    { name: "ready -> aborted on discard", from: ready, events: [command(0, "discard")], to: "aborted" },
    { name: "riding -> aborted on discard", from: riding, events: [command(1_000, "discard")], to: "aborted" },
    { name: "paused -> aborted on discard", from: paused, events: [command(11_000, "discard")], to: "aborted" },
    { name: "finished -> aborted on discard", from: () => run(riding(), [command(1, "stop")]), events: [command(2, "discard")], to: "aborted" },
    {
      name: "aborted ignores everything",
      from: () => run(riding(), [command(1, "discard")]),
      events: [status(2, "connected"), command(3, "start"), command(4, "resume"), tick(5_000)],
      to: "aborted",
    },
  ];

  for (const testCase of cases) {
    it(testCase.name, () => {
      const state = run(testCase.from(), testCase.events);
      expect(state.status).toBe(testCase.to);
      testCase.check?.(state);
    });
  }
});

describe("ride reducer timing", () => {
  it("accumulates elapsed time from tick deltas only while riding", () => {
    let state = run(riding(), ticks(0, 10_000));
    expect(state.elapsedMs).toBe(10_000);
    state = run(state, [command(10_000, "pause"), ...ticks(10_000, 40_000), command(40_000, "resume")]);
    expect(state.elapsedMs).toBe(10_000);
    expect(state.rideMs).toBe(40_000);
    state = run(state, ticks(40_000, 45_000));
    expect(state.elapsedMs).toBe(15_000);
  });

  it("counts a command's own timestamp, not only ticks", () => {
    const state = run(riding(), [tick(1_000), command(1_400, "pause")]);
    expect(state.elapsedMs).toBe(1_400);
  });

  it("clamps a clock gap to maxTickGapMs and records a warning", () => {
    const state = run(riding(), [tick(1_000), tick(61_000)]);
    expect(state.elapsedMs).toBe(3_000);
    expect(state.rideMs).toBe(3_000);
    expect(state.warnings).toEqual([{ type: "clockGap", atRideMs: 1_000, gapMs: 60_000 }]);
  });

  it("ignores ticks that go backwards", () => {
    const state = run(riding(), [tick(1_000), tick(2_000), tick(1_500), tick(2_500)]);
    expect(state.elapsedMs).toBe(2_500);
  });
});

describe("skip, back and extend", () => {
  it("skip jumps to the end of the current segment and records a lap", () => {
    const state = run(riding(), [...ticks(0, 20_000), command(20_000, "skip")]);
    expect(state.elapsedMs).toBe(60_000);
    expect(state.laps).toEqual([{ reason: "skip", atRideMs: 20_000, fromElapsedMs: 20_000, toElapsedMs: 60_000 }]);
    expect(currentTarget(state)?.segment.label).toBe("Ramp");
  });

  it("back returns to the current segment start", () => {
    const state = run(riding(), [command(0, "skip"), ...ticks(0, 10_000), command(10_000, "back")]);
    expect(state.elapsedMs).toBe(60_000);
  });

  it("back within 3 s of a segment start goes to the previous segment", () => {
    const state = run(riding(), [command(0, "skip"), ...ticks(0, 2_000), command(2_000, "back")]);
    expect(state.elapsedMs).toBe(0);
    expect(state.laps.map((lap) => lap.reason)).toEqual(["skip", "back"]);
  });

  it("back in the first segment stays in it", () => {
    const state = run(riding(), [...ticks(0, 1_000), command(1_000, "back")]);
    expect(state.elapsedMs).toBe(0);
  });

  it("extend adds a minute at the current target and shifts the rest", () => {
    const state = run(riding(), [command(0, "skip"), ...ticks(0, 30_000), command(30_000, "extend")]);
    // 30 s into the 100 -> 200 W ramp the target is 150 W.
    expect(state.timeline.map((s) => [s.startSeconds, s.endSeconds, s.startWatts, s.endWatts])).toEqual([
      [0, 60, 100, 100],
      [60, 90, 100, 150],
      [90, 150, 150, 150],
      [150, 180, 150, 200],
      [180, 240, 300, 300],
    ]);
    expect(state.timeline[2].synthetic).toBe(true);
    expect(state.timeline.map((s) => s.index)).toEqual([0, 1, 2, 3, 4]);
    expect(state.timeline.map((s) => [s.startPercentFTP, s.endPercentFTP])).toEqual([
      [50, 50],
      [50, 75],
      [75, 75],
      [75, 100],
      [150, 150],
    ]);
    expect(new Set(state.timeline.map((s) => s.id)).size).toBe(5);

    const later = run(state, ticks(30_000, 60_000));
    expect(later.elapsedMs).toBe(120_000);
    expect(currentTarget(later)?.watts).toBe(150);
    const end = run(later, ticks(60_000, 300_000));
    expect(end.status).toBe("finished");
    expect(end.elapsedMs).toBe(240_000);
  });

  it("keeps recorded segment indices on their segments after an extend renumbers them", () => {
    const power = (nowMs: number): RideEvent => ({ type: "sample", nowMs, power: 150, source: "trainer" });
    const state = run(riding(), [
      command(0, "skip"),
      command(0, "skip"),
      ...ticks(0, 2_000),
      power(2_000),
      command(2_000, "back"),
      ...ticks(2_000, 22_000),
      power(22_000),
      command(22_000, "extend"),
      ...ticks(22_000, 23_000),
    ]);
    expect(state.timeline.map((s) => s.label)).toEqual(["Easy", "Ramp", "Ramp (extended)", "Ramp", "Hard"]);
    expect(segmentComparisons(state).map((c) => [c.segmentIndex, c.plannedWatts])).toEqual([
      [1, 133],
      [4, 300],
    ]);
    expect(state.recorder.rows.slice(1, 4).map((row) => row.segmentIndex)).toEqual([4, 4, 1]);
    expect(state.laps.map((lap) => [lap.reason, lap.fromElapsedMs, lap.toElapsedMs])).toEqual([
      ["skip", 0, 60_000],
      ["skip", 60_000, 180_000],
      ["back", 182_000, 60_000],
    ]);
  });
});

describe("FTP bias", () => {
  it("scales every target and clamps to 50-150 %", () => {
    let state = run(riding(), [{ type: "ftpBias", nowMs: 0, percent: 110 }]);
    expect(currentTarget(state)?.watts).toBe(110);
    state = run(state, [{ type: "ftpBias", nowMs: 0, percent: 400 }]);
    expect(state.ftpBiasPercent).toBe(150);
    state = run(state, [{ type: "ftpBias", nowMs: 0, percent: 10 }]);
    expect(state.ftpBiasPercent).toBe(50);
    state = run(state, [{ type: "ftpBias", nowMs: 0, percent: 97.4 }]);
    expect(state.ftpBiasPercent).toBe(97);
    expect(currentTarget(state)?.watts).toBe(97);
  });

  it("sends the biased target to the trainer", () => {
    const state = run(riding(), [...ticks(0, 1_000), { type: "ftpBias", nowMs: 1_000, percent: 120 }]);
    expect(state.trainerCommands).toEqual([{ type: "setTargetPower", watts: 120 }]);
  });

  it("ignores non-numeric bias", () => {
    const state = run(riding(), [{ type: "ftpBias", nowMs: 0, percent: Number.NaN }]);
    expect(state.ftpBiasPercent).toBe(100);
  });
});

describe("trainer commands", () => {
  it("sends the first target on start and the pause target on pause", () => {
    let state = run(ready(), [command(0, "start")]);
    expect(state.trainerCommands).toEqual([{ type: "setTargetPower", watts: 100 }]);
    state = run(state, [command(500, "pause")]);
    expect(state.trainerCommands).toEqual([{ type: "setTargetPower", watts: 50 }]);
    state = run(state, [command(1_000, "resume")]);
    expect(state.trainerCommands).toEqual([{ type: "setTargetPower", watts: 100 }]);
  });

  it("toggles ERG mode and stops sending targets while it is off", () => {
    let state = run(riding(), [{ type: "ergMode", nowMs: 0, enabled: false }]);
    expect(state.trainerCommands).toEqual([{ type: "setErgMode", enabled: false }]);
    state = run(state, [command(0, "skip"), ...ticks(0, 30_000)]);
    expect(state.trainerCommands).toEqual([]);
    state = run(state, [{ type: "ergMode", nowMs: 30_000, enabled: true }]);
    expect(state.trainerCommands).toEqual([
      { type: "setErgMode", enabled: true },
      { type: "setTargetPower", watts: 150 },
    ]);
  });

  it("sends the pause target when ERG is turned back on during a pause", () => {
    const state = run(riding(), [
      command(0, "skip"),
      command(0, "skip"),
      { type: "ergMode", nowMs: 0, enabled: false },
      command(1_000, "pause"),
      { type: "ergMode", nowMs: 2_000, enabled: true },
    ]);
    expect(state.trainerCommands).toEqual([
      { type: "setErgMode", enabled: true },
      { type: "setTargetPower", watts: 50 },
    ]);
  });

  it("releases the trainer to the pause target on finish and discard", () => {
    expect(run(riding(), [command(1_000, "stop")]).trainerCommands).toEqual([{ type: "setTargetPower", watts: 50 }]);
    expect(run(riding(), [command(1_000, "discard")]).trainerCommands).toEqual([{ type: "setTargetPower", watts: 50 }]);
  });

  it("does not command a disconnected trainer", () => {
    const state = run(riding(), [status(1_000, "reconnecting")]);
    expect(state.trainerCommands).toEqual([]);
  });

  it("re-sends the target when the trainer comes back", () => {
    const state = run(riding(), [status(1_000, "reconnecting"), status(4_000, "connected")]);
    expect(state.trainerCommands).toEqual([{ type: "setTargetPower", watts: 100 }]);
  });
});
