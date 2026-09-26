import type { FlattenedSegment } from "@/lib/workout/types";

// The ride engine is platform neutral: no React, DOM, timers or wall clock.
// Time enters only through `nowMs` on events, so a ride is a replayable list
// of serializable events and the same code can run in a browser or a phone app.

export interface RideSegment extends FlattenedSegment {
  index: number;
  // False for free-ride segments: the engine takes the trainer out of ERG
  // while inside one and restores ERG on leaving it.
  ergEnabled: boolean;
  // True for segments the rider added mid-ride with "extend".
  synthetic?: boolean;
}

export type RideStatus = "idle" | "ready" | "riding" | "paused" | "finished" | "aborted";

export type TrainerStatus = "disconnected" | "connecting" | "connected" | "reconnecting";

export type PauseReason = "manual" | "trainer" | "autoPause";

export type RideCommand =
  | "start"
  | "pause"
  | "resume"
  | "skip"
  | "back"
  | "stop"
  | "extend"
  | "discard";

export type SampleSource = "trainer" | "powerMeter" | "heartRateMonitor" | "simulator";

export interface TrainerSample {
  power?: number;
  cadence?: number;
  heartRate?: number;
  source: SampleSource;
}

export type RideEvent =
  | { type: "tick"; nowMs: number }
  | ({ type: "sample"; nowMs: number } & TrainerSample)
  | { type: "command"; nowMs: number; command: RideCommand }
  | { type: "ftpBias"; nowMs: number; percent: number }
  | { type: "ergMode"; nowMs: number; enabled: boolean }
  | { type: "trainerStatus"; nowMs: number; status: TrainerStatus };

// What the engine asks the trainer layer to do after an event. The driver reads
// `state.trainerCommands` after every reduce and executes them in order.
export type TrainerCommand =
  | { type: "setTargetPower"; watts: number }
  | { type: "setErgMode"; enabled: boolean };

export interface EngineOptions {
  // Tick deltas above this are clamped and reported as a clock gap.
  maxTickGapMs: number;
  // Target sent while paused; 0 W makes several trainers hold no load.
  pauseTargetWatts: number;
  autoPause: boolean;
  autoPauseAfterMs: number;
  // Resume an auto-paused ride on the first pedal stroke.
  autoResume: boolean;
  ergMinIntervalMs: number;
  ergMinDeltaWatts: number;
  ergResendMs: number;
  // Send the next segment's target this early to hide trainer lag.
  ergLeadTimeMs: number;
  // "back" within this long of a segment start goes to the previous segment.
  backThresholdMs: number;
  extendMs: number;
  minBiasPercent: number;
  maxBiasPercent: number;
}

export interface RideWarning {
  type: "clockGap";
  atRideMs: number;
  gapMs: number;
}

export interface RideLap {
  reason: "skip" | "back";
  atRideMs: number;
  fromElapsedMs: number;
  toElapsedMs: number;
}

export interface PowerPoint {
  atRideMs: number;
  watts: number;
}

export interface SegmentStats {
  sampleCount: number;
  powerSum: number;
  targetSum: number;
}

export interface RecorderRow {
  // Ride clock second (includes pauses); maps to ActivityStreamSet.time.
  t: number;
  targetWatts: number | null;
  power: number | null;
  cadence: number | null;
  heartRate: number | null;
  segmentIndex: number | null;
  ergEnabled: boolean;
  paused: boolean;
}

export interface RecorderBucket {
  second: number;
  snapshot: Omit<RecorderRow, "t" | "power" | "cadence" | "heartRate">;
  powerSum: number;
  powerCount: number;
  cadenceSum: number;
  cadenceCount: number;
  heartRateSum: number;
  heartRateCount: number;
}

export interface RecorderState {
  rows: RecorderRow[];
  bucket: RecorderBucket | null;
}

export interface ErgState {
  lastSentWatts: number | null;
  lastSentAtMs: number | null;
  // The ERG mode last commanded to the trainer.
  modeOn: boolean;
}

export interface RideState {
  status: RideStatus;
  options: EngineOptions;
  // The executed timeline: starts as the workout and grows with "extend".
  timeline: RideSegment[];
  ftp: number;
  ftpBiasPercent: number;
  ergEnabled: boolean;
  trainerStatus: TrainerStatus;
  pauseReason: PauseReason | null;
  // Workout position; advances only while riding.
  elapsedMs: number;
  // Ride clock since start; advances while riding or paused.
  rideMs: number;
  lastTickMs: number | null;
  zeroCadenceSinceMs: number | null;
  recentPower: PowerPoint[];
  segmentStats: Record<number, SegmentStats>;
  recorder: RecorderState;
  erg: ErgState;
  warnings: RideWarning[];
  laps: RideLap[];
  // Commands produced by the most recent event only.
  trainerCommands: TrainerCommand[];
}
