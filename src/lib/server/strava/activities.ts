import type { ActivityStreamSet, ActivitySummary } from "@/lib/activity/types";
import type { StravaActivityResponse, StravaStreamResponse } from "@/lib/integrations/strava/types";

const cyclingSportTypes = new Set([
  "Ride",
  "VirtualRide",
  "GravelRide",
  "MountainBikeRide",
  "EBikeRide",
  "EMountainBikeRide",
  "Velomobile",
]);

function finite(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function optional(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function isCyclingActivity(activity: StravaActivityResponse) {
  return cyclingSportTypes.has(activity.sport_type ?? activity.type ?? "");
}

export function stravaActivityToSummary(activity: StravaActivityResponse): ActivitySummary {
  if (activity.id === undefined || !activity.start_date) throw new Error("Strava activity is missing required identity fields.");
  return {
    id: String(activity.id),
    name: typeof activity.name === "string" && activity.name.trim() ? activity.name : "Untitled ride",
    sportType: activity.sport_type ?? activity.type ?? "Ride",
    startedAt: activity.start_date,
    movingTimeSeconds: finite(activity.moving_time),
    elapsedTimeSeconds: finite(activity.elapsed_time),
    distanceMeters: finite(activity.distance),
    elevationGainMeters: finite(activity.total_elevation_gain),
    trainer: activity.trainer === true || activity.sport_type === "VirtualRide",
    averagePower: optional(activity.average_watts),
    weightedAveragePower: optional(activity.weighted_average_watts),
    maximumPower: optional(activity.max_watts),
    devicePower: activity.device_watts === true,
    averageHeartRate: optional(activity.average_heartrate),
    maximumHeartRate: optional(activity.max_heartrate),
    averageCadence: optional(activity.average_cadence),
    kilojoules: optional(activity.kilojoules),
  };
}

export function normalizeStravaStreams(payload: StravaStreamResponse[] | Record<string, StravaStreamResponse>): ActivityStreamSet {
  const streams = Array.isArray(payload) ? payload : Object.values(payload);
  const data = new Map(streams.map((stream) => [stream.type, stream.data]));
  const numeric = (name: string) => data.get(name)?.map((value) => typeof value === "number" && Number.isFinite(value) ? value : null);
  return {
    time: (numeric("time") ?? []).map((value) => value ?? 0),
    moving: data.get("moving")?.map((value) => value === true),
    watts: numeric("watts"),
    heartrate: numeric("heartrate"),
    cadence: numeric("cadence"),
    distance: numeric("distance"),
    altitude: numeric("altitude"),
  };
}
