import type { ActivityStreamSet } from "@/lib/activity/types";
import type { RecorderBucket, RecorderRow, RecorderState, TrainerSample } from "./types";

// One row per ride-clock second. Samples arriving within a second are averaged;
// a second with no samples records null rather than a guess.

export type RecorderSnapshot = RecorderBucket["snapshot"];

export function createRecorder(): RecorderState {
  return { rows: [], bucket: null };
}

function openBucket(second: number, snapshot: RecorderSnapshot): RecorderBucket {
  return {
    second,
    snapshot,
    powerSum: 0,
    powerCount: 0,
    cadenceSum: 0,
    cadenceCount: 0,
    heartRateSum: 0,
    heartRateCount: 0,
  };
}

function mean(sum: number, count: number): number | null {
  return count === 0 ? null : Math.round(sum / count);
}

function closeBucket(bucket: RecorderBucket): RecorderRow {
  return {
    t: bucket.second,
    ...bucket.snapshot,
    power: mean(bucket.powerSum, bucket.powerCount),
    cadence: mean(bucket.cadenceSum, bucket.cadenceCount),
    heartRate: mean(bucket.heartRateSum, bucket.heartRateCount),
  };
}

// Moves the recorder to `rideMs`, closing every second that has fully elapsed.
export function advanceRecorder(
  recorder: RecorderState,
  rideMs: number,
  snapshot: RecorderSnapshot,
): RecorderState {
  const second = Math.floor(rideMs / 1000);
  if (!recorder.bucket) {
    return { rows: recorder.rows, bucket: openBucket(second, snapshot) };
  }
  if (second <= recorder.bucket.second) return recorder;

  const rows = [...recorder.rows, closeBucket(recorder.bucket)];
  // Seconds skipped by a long tick get empty rows so the stream stays 1 Hz.
  for (let s = recorder.bucket.second + 1; s < second; s += 1) {
    rows.push(closeBucket(openBucket(s, recorder.bucket.snapshot)));
  }
  return { rows, bucket: openBucket(second, snapshot) };
}

export function appendSample(recorder: RecorderState, sample: TrainerSample): RecorderState {
  const bucket = recorder.bucket;
  if (!bucket) return recorder;
  const next = { ...bucket };
  if (sample.power !== undefined) {
    next.powerSum += sample.power;
    next.powerCount += 1;
  }
  if (sample.cadence !== undefined) {
    next.cadenceSum += sample.cadence;
    next.cadenceCount += 1;
  }
  if (sample.heartRate !== undefined) {
    next.heartRateSum += sample.heartRate;
    next.heartRateCount += 1;
  }
  return { ...recorder, bucket: next };
}

// Closes the partial final second, if any time or data landed in it.
export function finalizeRecorder(recorder: RecorderState, rideMs: number): RecorderState {
  const bucket = recorder.bucket;
  if (!bucket) return recorder;
  const hasData = bucket.powerCount + bucket.cadenceCount + bucket.heartRateCount > 0;
  if (rideMs <= bucket.second * 1000 && !hasData) return { ...recorder, bucket: null };
  return { rows: [...recorder.rows, closeBucket(bucket)], bucket: null };
}

// Recorded rows are the input of the existing activity analysis engine.
export function toActivityStreams(rows: RecorderRow[]): ActivityStreamSet {
  return {
    time: rows.map((row) => row.t),
    moving: rows.map((row) => !row.paused),
    watts: rows.map((row) => row.power),
    heartrate: rows.map((row) => row.heartRate),
    cadence: rows.map((row) => row.cadence),
  };
}
