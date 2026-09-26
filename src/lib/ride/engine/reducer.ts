import { ergCommandPolicy } from "./erg";
import { addSegmentSample, pushPower, remapSegmentStats } from "./metrics";
import {
  advanceRecorder,
  appendSample,
  createRecorder,
  finalizeRecorder,
  remapSegmentIndexes,
} from "./recorder";
import type { RecorderSnapshot } from "./recorder";
import { targetAt } from "./targets";
import { extendTimeline, findSegmentIndex, timelineDurationMs } from "./timeline";
import type {
  EngineOptions,
  PauseReason,
  RideCommand,
  RideEvent,
  RideLap,
  RideSegment,
  RideState,
  TrainerSample,
  TrainerStatus,
} from "./types";

// The whole ride state machine:
//   idle -> ready          trainer connected (the workout is loaded at creation)
//   ready -> idle          trainer lost before the start
//   ready -> riding        start
//   riding -> paused       pause | trainer lost | cadence 0 for autoPauseAfterMs
//   paused -> riding       resume | trainer back after a trainer pause | pedaling after an auto-pause
//   riding|paused -> finished   timeline end | stop | skip past the last segment
//   any -> aborted         discard
// Events that do not apply to the current status leave the state unchanged
// apart from clearing `trainerCommands`.

export const defaultEngineOptions: EngineOptions = {
  maxTickGapMs: 2_000,
  pauseTargetWatts: 50,
  autoPause: true,
  autoPauseAfterMs: 5_000,
  autoResume: true,
  ergMinIntervalMs: 250,
  ergMinDeltaWatts: 1,
  ergResendMs: 10_000,
  ergLeadTimeMs: 0,
  backThresholdMs: 3_000,
  extendMs: 60_000,
  minBiasPercent: 50,
  maxBiasPercent: 150,
};

export interface CreateRideStateInput {
  timeline: RideSegment[];
  ftp: number;
  options?: Partial<EngineOptions>;
}

export function createRideState({ timeline, ftp, options }: CreateRideStateInput): RideState {
  return {
    status: "idle",
    options: { ...defaultEngineOptions, ...options },
    timeline,
    ftp,
    ftpBiasPercent: 100,
    ergEnabled: true,
    trainerStatus: "disconnected",
    pauseReason: null,
    elapsedMs: 0,
    rideMs: 0,
    lastTickMs: null,
    zeroCadenceSinceMs: null,
    recentPower: [],
    segmentStats: {},
    recorder: createRecorder(),
    erg: { lastSentWatts: null, lastSentAtMs: null },
    warnings: [],
    laps: [],
    trainerCommands: [],
  };
}

export function reduce(state: RideState, event: RideEvent): RideState {
  if (state.status === "aborted") {
    return state.trainerCommands.length === 0 ? state : { ...state, trainerCommands: [] };
  }

  let next: RideState = advanceClock({ ...state, trainerCommands: [] }, event.nowMs);

  switch (event.type) {
    case "tick":
      break;
    case "sample":
      next = handleSample(next, event, event.nowMs);
      break;
    case "command":
      next = handleCommand(next, event.command, event.nowMs);
      break;
    case "ftpBias":
      next = handleBias(next, event.percent);
      break;
    case "ergMode":
      next = handleErgMode(next, event.enabled);
      break;
    case "trainerStatus":
      next = handleTrainerStatus(next, event.status);
      break;
  }

  next = checkAutoPause(next, event.nowMs);
  return applyErgPolicy(next, event.nowMs);
}

export function currentTarget(state: RideState) {
  return targetAt(state.timeline, state.elapsedMs, state.ftpBiasPercent);
}

function isActive(state: RideState): boolean {
  return state.status === "riding" || state.status === "paused";
}

function snapshot(state: RideState): RecorderSnapshot {
  const target = currentTarget(state);
  return {
    targetWatts: target?.watts ?? null,
    segmentIndex: target?.segment.index ?? null,
    ergEnabled: state.ergEnabled && (target?.segment.ergEnabled ?? false),
    paused: state.status === "paused",
  };
}

// Time comes only from event timestamps. Deltas accumulate while active and
// are clamped so a throttled tab or a sleeping laptop cannot jump the workout.
function advanceClock(state: RideState, nowMs: number): RideState {
  if (!isActive(state) || state.lastTickMs === null) return state;

  const rawDelta = Math.max(0, nowMs - state.lastTickMs);
  const delta = Math.min(rawDelta, state.options.maxTickGapMs);
  const warnings =
    rawDelta > state.options.maxTickGapMs
      ? [...state.warnings, { type: "clockGap" as const, atRideMs: state.rideMs, gapMs: rawDelta }]
      : state.warnings;

  const next: RideState = {
    ...state,
    warnings,
    lastTickMs: Math.max(state.lastTickMs, nowMs),
    rideMs: state.rideMs + delta,
    elapsedMs: state.status === "riding" ? state.elapsedMs + delta : state.elapsedMs,
  };

  const durationMs = timelineDurationMs(next.timeline);
  if (next.status === "riding" && next.elapsedMs >= durationMs) {
    return finish({ ...next, elapsedMs: durationMs });
  }

  return { ...next, recorder: advanceRecorder(next.recorder, next.rideMs, snapshot(next)) };
}

function finish(state: RideState): RideState {
  const recorder = finalizeRecorder(
    advanceRecorder(state.recorder, state.rideMs, snapshot(state)),
    state.rideMs,
  );
  return releaseTrainer({ ...state, status: "finished", pauseReason: null, recorder });
}

// Drops the trainer to the low pause target instead of 0 W.
function releaseTrainer(state: RideState): RideState {
  if (!state.ergEnabled || state.trainerStatus !== "connected") return state;
  const watts = state.options.pauseTargetWatts;
  return {
    ...state,
    trainerCommands: [...state.trainerCommands, { type: "setTargetPower", watts }],
    erg: { lastSentWatts: watts, lastSentAtMs: state.lastTickMs },
  };
}

function pause(state: RideState, reason: PauseReason): RideState {
  const paused: RideState = { ...state, status: "paused", pauseReason: reason, zeroCadenceSinceMs: null };
  return reason === "trainer" ? paused : releaseTrainer(paused);
}

function resume(state: RideState): RideState {
  if (state.trainerStatus !== "connected") return state;
  return {
    ...state,
    status: "riding",
    pauseReason: null,
    zeroCadenceSinceMs: null,
    erg: { lastSentWatts: null, lastSentAtMs: null },
    recorder: advanceRecorder(state.recorder, state.rideMs, snapshot({ ...state, status: "riding" })),
  };
}

function handleSample(state: RideState, sample: TrainerSample, nowMs: number): RideState {
  if (!isActive(state)) return state;

  let next: RideState = { ...state, recorder: appendSample(state.recorder, sample) };

  if (sample.power !== undefined) {
    next.recentPower = pushPower(next.recentPower, { atRideMs: next.rideMs, watts: sample.power });
    const target = currentTarget(next);
    if (next.status === "riding" && target) {
      next.segmentStats = addSegmentSample(next.segmentStats, target.segment.index, sample.power, target.watts);
    }
  }

  if (sample.cadence !== undefined) {
    if (sample.cadence > 0) {
      next.zeroCadenceSinceMs = null;
      if (next.status === "paused" && next.pauseReason === "autoPause" && next.options.autoResume) {
        next = resume(next);
      }
    } else if (next.zeroCadenceSinceMs === null) {
      next.zeroCadenceSinceMs = nowMs;
    }
  }

  return next;
}

// Only reported cadence can trigger an auto-pause; with no cadence source the
// timer never starts.
function checkAutoPause(state: RideState, nowMs: number): RideState {
  if (
    state.status !== "riding" ||
    !state.options.autoPause ||
    state.zeroCadenceSinceMs === null ||
    nowMs - state.zeroCadenceSinceMs < state.options.autoPauseAfterMs
  ) {
    return state;
  }
  return pause(state, "autoPause");
}

function jumpTo(state: RideState, toElapsedMs: number, reason: RideLap["reason"]): RideState {
  const lap: RideLap = { reason, atRideMs: state.rideMs, fromElapsedMs: state.elapsedMs, toElapsedMs };
  const next: RideState = {
    ...state,
    elapsedMs: toElapsedMs,
    laps: [...state.laps, lap],
    erg: { ...state.erg, lastSentAtMs: null },
  };
  if (toElapsedMs >= timelineDurationMs(next.timeline)) {
    return finish({ ...next, elapsedMs: timelineDurationMs(next.timeline) });
  }
  return next;
}

function handleCommand(state: RideState, command: RideCommand, nowMs: number): RideState {
  if (command === "discard") {
    const released = isActive(state) ? releaseTrainer(state) : state;
    return { ...released, status: "aborted", pauseReason: null };
  }

  if (command === "start") {
    if (state.status !== "ready") return state;
    const started: RideState = {
      ...state,
      status: "riding",
      lastTickMs: nowMs,
      erg: { lastSentWatts: null, lastSentAtMs: null },
    };
    return { ...started, recorder: advanceRecorder(started.recorder, 0, snapshot(started)) };
  }

  if (!isActive(state)) return state;

  const index = findSegmentIndex(state.timeline, state.elapsedMs);
  const segment = state.timeline[index];

  switch (command) {
    case "pause":
      // Pausing an already trainer- or auto-paused ride makes it a manual pause,
      // so a reconnect or a pedal stroke no longer resumes it.
      return state.status === "riding" ? pause(state, "manual") : { ...state, pauseReason: "manual" };
    case "resume":
      return state.status === "paused" ? resume(state) : state;
    case "stop":
      return finish(state);
    case "skip":
      return jumpTo(state, segment.endSeconds * 1000, "skip");
    case "back": {
      const intoSegmentMs = state.elapsedMs - segment.startSeconds * 1000;
      const toSegment =
        intoSegmentMs < state.options.backThresholdMs && index > 0 ? state.timeline[index - 1] : segment;
      return jumpTo(state, toSegment.startSeconds * 1000, "back");
    }
    case "extend": {
      const timeline = extendTimeline(state.timeline, state.elapsedMs, state.options.extendMs);
      const inserted = timeline.length - state.timeline.length;
      if (inserted === 0) return state;
      const shift = (ms: number) => (ms > state.elapsedMs ? ms + state.options.extendMs : ms);
      const firstMoved = state.elapsedMs / 1000 > segment.startSeconds ? index + 1 : index;
      const remap = (i: number) => (i < firstMoved ? i : i + inserted);
      const lap: RideLap = {
        reason: "extend",
        atRideMs: state.rideMs,
        fromElapsedMs: state.elapsedMs,
        toElapsedMs: state.elapsedMs,
      };
      return {
        ...state,
        timeline,
        segmentStats: remapSegmentStats(state.segmentStats, remap),
        recorder: remapSegmentIndexes(state.recorder, remap),
        laps: [
          ...state.laps.map((l) => ({ ...l, fromElapsedMs: shift(l.fromElapsedMs), toElapsedMs: shift(l.toElapsedMs) })),
          lap,
        ],
      };
    }
  }
}

function handleBias(state: RideState, percent: number): RideState {
  if (state.status === "finished" || !Number.isFinite(percent)) return state;
  const { minBiasPercent, maxBiasPercent } = state.options;
  return { ...state, ftpBiasPercent: Math.min(maxBiasPercent, Math.max(minBiasPercent, Math.round(percent))) };
}

function handleErgMode(state: RideState, enabled: boolean): RideState {
  if (state.status === "finished" || state.ergEnabled === enabled) return state;
  const next: RideState = {
    ...state,
    ergEnabled: enabled,
    erg: { lastSentWatts: null, lastSentAtMs: null },
    trainerCommands: [...state.trainerCommands, { type: "setErgMode", enabled }],
  };
  return state.status === "paused" ? releaseTrainer(next) : next;
}

function handleTrainerStatus(state: RideState, status: TrainerStatus): RideState {
  const next: RideState = { ...state, trainerStatus: status };
  const connected = status === "connected";

  switch (state.status) {
    case "idle":
      return connected ? { ...next, status: "ready" } : next;
    case "ready":
      return connected ? next : { ...next, status: "idle" };
    case "riding":
      return connected ? next : pause(next, "trainer");
    case "paused":
      if (!connected) return next;
      // A reconnected trainer has forgotten its target: resume a ride the
      // trainer paused, or re-send the pause target to one the rider paused.
      return state.pauseReason === "trainer" ? resume(next) : releaseTrainer(next);
    default:
      return next;
  }
}

function applyErgPolicy(state: RideState, nowMs: number): RideState {
  const { setTargetWatts } = ergCommandPolicy(state, nowMs);
  if (setTargetWatts === undefined) return state;
  return {
    ...state,
    trainerCommands: [...state.trainerCommands, { type: "setTargetPower", watts: setTargetWatts }],
    erg: { lastSentWatts: setTargetWatts, lastSentAtMs: nowMs },
  };
}
