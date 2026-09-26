import { flattenWorkout } from "@/lib/workout/flatten";
import type { ExportRangeStrategy, Workout } from "@/lib/workout/types";
import type { RideSegment } from "./types";

// The ride timeline is the flattener's output rescaled to the rider's current
// FTP. The workout's %FTP values are the source of truth; `workout.ftp` is only
// the FTP it was authored at.
export function buildTimeline(
  workout: Workout,
  ftp: number,
  rangeStrategy: ExportRangeStrategy = "midpoint",
): RideSegment[] {
  return flattenWorkout({ ...workout, ftp }, rangeStrategy).map((segment, index) => ({
    ...segment,
    index,
    ergEnabled: true,
  }));
}

export function timelineDurationMs(timeline: RideSegment[]): number {
  return timeline.length === 0 ? 0 : timeline[timeline.length - 1].endSeconds * 1000;
}

function interpolate(segment: RideSegment, start: number, end: number, seconds: number): number {
  if (segment.durationSeconds <= 0 || start === end) return start;
  // Multiply before dividing so whole-second positions give exact halves,
  // the same arithmetic a reader of the exported .erg points would use.
  return start + ((end - start) * (seconds - segment.startSeconds)) / segment.durationSeconds;
}

// Unbiased target at `seconds` into `segment`, linear on ramps.
export function segmentWattsAt(segment: RideSegment, seconds: number): number {
  return interpolate(segment, segment.startWatts, segment.endWatts, seconds);
}

// Adds `durationMs` at the current target by splitting the segment under
// `elapsedMs`: [head][extension][tail], later segments shift right.
export function extendTimeline(
  timeline: RideSegment[],
  elapsedMs: number,
  durationMs: number,
): RideSegment[] {
  const at = elapsedMs / 1000;
  const extra = durationMs / 1000;
  const index = findSegmentIndex(timeline, elapsedMs);
  if (index === -1 || extra <= 0) return timeline;

  const current = timeline[index];
  const watts = segmentWattsAt(current, at);
  const percent = interpolate(current, current.startPercentFTP, current.endPercentFTP, at);
  const pieces: Omit<RideSegment, "index">[] = [];

  if (at > current.startSeconds) {
    pieces.push({
      ...current,
      endSeconds: at,
      durationSeconds: at - current.startSeconds,
      endPercentFTP: percent,
      endWatts: watts,
    });
  }
  pieces.push({
    ...current,
    id: `${current.id}-extend-${Math.round(at)}`,
    label: `${current.label} (extended)`,
    targetMode: current.targetMode === "ramp" ? "single" : current.targetMode,
    startSeconds: at,
    endSeconds: at + extra,
    durationSeconds: extra,
    startPercentFTP: percent,
    endPercentFTP: percent,
    startWatts: watts,
    endWatts: watts,
    synthetic: true,
  });
  pieces.push({
    ...current,
    id: `${current.id}-rest-${Math.round(at)}`,
    startSeconds: at + extra,
    endSeconds: current.endSeconds + extra,
    durationSeconds: current.endSeconds - at,
    startPercentFTP: percent,
    startWatts: watts,
  });

  const shifted = timeline.slice(index + 1).map((segment) => ({
    ...segment,
    startSeconds: segment.startSeconds + extra,
    endSeconds: segment.endSeconds + extra,
  }));

  return [...timeline.slice(0, index), ...pieces, ...shifted].map((segment, i) => ({
    ...segment,
    index: i,
  }));
}

// Binary search for the segment with startSeconds <= t < endSeconds.
export function findSegmentIndex(timeline: RideSegment[], elapsedMs: number): number {
  const seconds = elapsedMs / 1000;
  let low = 0;
  let high = timeline.length - 1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    const segment = timeline[mid];
    if (seconds < segment.startSeconds) {
      high = mid - 1;
    } else if (seconds >= segment.endSeconds) {
      low = mid + 1;
    } else {
      return mid;
    }
  }

  return -1;
}
