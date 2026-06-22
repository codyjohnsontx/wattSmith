import { averagePercent, roundOne } from "./math";
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

function segmentAveragePercent(segment: FlattenedSegment): number {
  return averagePercent(segment.startPercentFTP, segment.endPercentFTP);
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
  const weightedFourthPower = segments.reduce((total, segment) => {
    const avgWatts = segmentAverageWatts(segment);
    return total + Math.pow(avgWatts, 4) * segment.durationSeconds;
  }, 0);
  const zoneSeconds = new Map<string, number>();

  for (const zone of zones) {
    zoneSeconds.set(zone.id, 0);
  }

  for (const segment of segments) {
    const percent = segmentAveragePercent(segment);
    const zone = zoneForPercent(percent);
    zoneSeconds.set(zone.id, (zoneSeconds.get(zone.id) ?? 0) + segment.durationSeconds);
  }

  const zoneSummary: ZoneSummary[] = zones.map((zone) => ({
    id: zone.id,
    label: zone.label,
    range: zone.range,
    seconds: zoneSeconds.get(zone.id) ?? 0,
  }));

  const averageWatts = totalDurationSeconds > 0 ? Math.round(weightedWatts / totalDurationSeconds) : 0;
  const normalizedPowerEstimate =
    totalDurationSeconds > 0 ? Math.round(Math.pow(weightedFourthPower / totalDurationSeconds, 0.25)) : 0;
  const intensityFactor = workout.ftp > 0 ? roundOne((normalizedPowerEstimate / workout.ftp) * 10) / 10 : 0;
  const hours = totalDurationSeconds / 3600;
  const trainingStressScore = Math.round(hours * Math.pow(intensityFactor, 2) * 100);
  const dominantZone = [...zoneSummary].sort((a, b) => b.seconds - a.seconds)[0] ?? zoneSummary[0];
  const workSegments = segments.filter((segment) => segmentAveragePercent(segment) >= 95);

  return {
    totalDurationSeconds,
    warmupSeconds: segments
      .filter((segment) => segment.type === "warmup")
      .reduce((total, segment) => total + segment.durationSeconds, 0),
    workSeconds: segments
      .filter((segment) => segmentAveragePercent(segment) >= 95)
      .reduce((total, segment) => total + segment.durationSeconds, 0),
    recoverySeconds: segments
      .filter((segment) => segment.type === "recovery")
      .reduce((total, segment) => total + segment.durationSeconds, 0),
    cooldownSeconds: segments
      .filter((segment) => segment.type === "cooldown")
      .reduce((total, segment) => total + segment.durationSeconds, 0),
    averageWatts,
    highestWatts: Math.max(0, ...segments.flatMap((segment) => [segment.startWatts, segment.endWatts])),
    aboveThresholdSeconds: segments
      .filter((segment) => segmentAveragePercent(segment) > 100)
      .reduce((total, segment) => total + segment.durationSeconds, 0),
    aboveVo2Seconds: segments
      .filter((segment) => segmentAveragePercent(segment) >= 106)
      .reduce((total, segment) => total + segment.durationSeconds, 0),
    intervalCount: workSegments.length,
    longestWorkSeconds: Math.max(0, ...workSegments.map((segment) => segment.durationSeconds)),
    estimatedKilojoules: Math.round(weightedWatts / 1000),
    intensityFactor,
    trainingStressScore,
    normalizedPowerEstimate,
    dominantZone,
    zones: zoneSummary,
  };
}
