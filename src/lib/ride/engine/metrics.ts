import type { PowerPoint, RideState, SegmentStats } from "./types";

const MAX_WINDOW_MS = 10_000;

export function pushPower(points: PowerPoint[], point: PowerPoint): PowerPoint[] {
  return [...points, point].filter((p) => point.atRideMs - p.atRideMs < MAX_WINDOW_MS);
}

// Mean of samples received in the last `windowMs` of ride time.
export function rollingPower(points: PowerPoint[], atRideMs: number, windowMs: number): number | null {
  const inWindow = points.filter((p) => atRideMs - p.atRideMs < windowMs && p.atRideMs <= atRideMs);
  if (inWindow.length === 0) return null;
  return Math.round(inWindow.reduce((sum, p) => sum + p.watts, 0) / inWindow.length);
}

export function addSegmentSample(
  stats: Record<number, SegmentStats>,
  segmentIndex: number,
  power: number,
  target: number,
): Record<number, SegmentStats> {
  const current = stats[segmentIndex] ?? { sampleCount: 0, powerSum: 0, targetSum: 0 };
  return {
    ...stats,
    [segmentIndex]: {
      sampleCount: current.sampleCount + 1,
      powerSum: current.powerSum + power,
      targetSum: current.targetSum + target,
    },
  };
}

export interface SegmentComparison {
  segmentIndex: number;
  plannedWatts: number;
  actualWatts: number;
  sampleCount: number;
}

// Planned vs actual per segment: plain means over the samples in the segment.
export function segmentComparisons(state: RideState): SegmentComparison[] {
  return Object.entries(state.segmentStats)
    .map(([index, stats]) => ({
      segmentIndex: Number(index),
      plannedWatts: Math.round(stats.targetSum / stats.sampleCount),
      actualWatts: Math.round(stats.powerSum / stats.sampleCount),
      sampleCount: stats.sampleCount,
    }))
    .sort((a, b) => a.segmentIndex - b.segmentIndex);
}

export function displayPower(state: RideState) {
  return {
    threeSecond: rollingPower(state.recentPower, state.rideMs, 3_000),
    tenSecond: rollingPower(state.recentPower, state.rideMs, 10_000),
    instant: state.recentPower.at(-1)?.watts ?? null,
  };
}
