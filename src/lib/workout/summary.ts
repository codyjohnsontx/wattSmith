import { averagePercent } from "./math";
import { flattenWorkout } from "./flatten";
import type { FlattenedSegment, Workout, WorkoutSummary, ZoneSummary } from "./types";

const zones = [
  { id: "recovery", label: "Recovery", range: "<55%", min: 0, max: 54.999 },
  { id: "endurance", label: "Endurance", range: "55-75%", min: 55, max: 75 },
  { id: "tempo", label: "Tempo", range: "76-87%", min: 76, max: 87 },
  { id: "sweet-spot", label: "Sweet Spot", range: "88-94%", min: 88, max: 94 },
  { id: "threshold", label: "Threshold", range: "95-105%", min: 95, max: 105 },
  { id: "vo2", label: "VO2", range: "106-120%", min: 106, max: 120 },
  { id: "anaerobic", label: "Anaerobic", range: ">120%", min: 120.001, max: Infinity },
];

function segmentAverageWatts(segment: FlattenedSegment): number {
  return (segment.startWatts + segment.endWatts) / 2;
}

function zoneForPercent(percent: number) {
  return zones.find((zone) => percent >= zone.min && percent <= zone.max) ?? zones[0];
}

export function calculateWorkoutSummary(workout: Workout): WorkoutSummary {
  const segments = flattenWorkout(workout);
  const totalDurationSeconds = segments.reduce(
    (total, segment) => total + segment.durationSeconds,
    0,
  );
  const weightedWatts = segments.reduce(
    (total, segment) => total + segmentAverageWatts(segment) * segment.durationSeconds,
    0,
  );
  const zoneSeconds = new Map<string, number>();

  for (const zone of zones) {
    zoneSeconds.set(zone.id, 0);
  }

  for (const segment of segments) {
    const percent = averagePercent(segment.startPercentFTP, segment.endPercentFTP);
    const zone = zoneForPercent(percent);
    zoneSeconds.set(zone.id, (zoneSeconds.get(zone.id) ?? 0) + segment.durationSeconds);
  }

  const zoneSummary: ZoneSummary[] = zones.map((zone) => ({
    id: zone.id,
    label: zone.label,
    range: zone.range,
    seconds: zoneSeconds.get(zone.id) ?? 0,
  }));

  return {
    totalDurationSeconds,
    warmupSeconds: segments
      .filter((segment) => segment.type === "warmup")
      .reduce((total, segment) => total + segment.durationSeconds, 0),
    workSeconds: segments
      .filter(
        (segment) =>
          segment.type === "steady" &&
          averagePercent(segment.startPercentFTP, segment.endPercentFTP) >= 95,
      )
      .reduce((total, segment) => total + segment.durationSeconds, 0),
    recoverySeconds: segments
      .filter((segment) => segment.type === "recovery")
      .reduce((total, segment) => total + segment.durationSeconds, 0),
    cooldownSeconds: segments
      .filter((segment) => segment.type === "cooldown")
      .reduce((total, segment) => total + segment.durationSeconds, 0),
    averageWatts: totalDurationSeconds > 0 ? Math.round(weightedWatts / totalDurationSeconds) : 0,
    highestWatts: Math.max(0, ...segments.flatMap((segment) => [segment.startWatts, segment.endWatts])),
    aboveThresholdSeconds: segments
      .filter((segment) => averagePercent(segment.startPercentFTP, segment.endPercentFTP) > 100)
      .reduce((total, segment) => total + segment.durationSeconds, 0),
    zones: zoneSummary,
  };
}
