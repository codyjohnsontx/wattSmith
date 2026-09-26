import { findSegmentIndex, segmentWattsAt } from "./timeline";
import type { RideSegment } from "./types";

export interface RideTarget {
  watts: number;
  segment: RideSegment;
  secondsLeft: number;
  nextSegment: RideSegment | null;
}

export function applyBias(watts: number, ftpBiasPercent: number): number {
  return Math.round((watts * ftpBiasPercent) / 100);
}

// Target at a workout position. Returns null past the end of the timeline.
export function targetAt(
  timeline: RideSegment[],
  elapsedMs: number,
  ftpBiasPercent = 100,
): RideTarget | null {
  const index = findSegmentIndex(timeline, elapsedMs);
  if (index === -1) return null;

  const segment = timeline[index];
  return {
    watts: applyBias(segmentWattsAt(segment, elapsedMs / 1000), ftpBiasPercent),
    segment,
    secondsLeft: segment.endSeconds - elapsedMs / 1000,
    nextSegment: timeline[index + 1] ?? null,
  };
}
