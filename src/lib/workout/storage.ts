import type { AthleteProfile, IntegrationConnection, Workout } from "./types";

export const LEGACY_WORKOUTS_STORAGE_KEY = "wattsmith.workouts.v1";
export const WORKOUTS_STORAGE_KEY = "wattsmith.workouts.v2";
export const PROFILE_STORAGE_KEY = "wattsmith.profile.v1";
export const INTEGRATIONS_STORAGE_KEY = "wattsmith.integrations.v1";

export const defaultProfile: AthleteProfile = {
  id: "local-athlete",
  ftp: 164,
  experienceLevel: "serious",
  weeklyHours: 6,
  availableDays: ["Tue", "Thu", "Sat"],
  primaryGoal: "Build repeatable cycling workouts",
  preferredWorkoutDurationMinutes: 60,
  constraints: [],
  updatedAt: "2026-06-22T00:00:00.000Z",
};

export const defaultIntegrationConnections: IntegrationConnection[] = [
  { provider: "strava", status: "not_connected" },
  { provider: "garmin", status: "not_connected" },
  { provider: "trainingpeaks", status: "not_connected" },
];

const experienceLevels = ["new", "recreational", "serious", "competitive", "elite"];
const integrationProviders = ["strava", "garmin", "trainingpeaks"];
const integrationStatuses = ["not_connected", "connected", "expired"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isAthleteProfile(value: unknown): value is AthleteProfile {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.ftp === "number" &&
    Number.isFinite(value.ftp) &&
    value.ftp > 0 &&
    typeof value.experienceLevel === "string" &&
    experienceLevels.includes(value.experienceLevel) &&
    typeof value.weeklyHours === "number" &&
    Number.isFinite(value.weeklyHours) &&
    value.weeklyHours >= 0 &&
    isStringArray(value.availableDays) &&
    typeof value.primaryGoal === "string" &&
    (value.targetEventDate === undefined || typeof value.targetEventDate === "string") &&
    typeof value.preferredWorkoutDurationMinutes === "number" &&
    Number.isFinite(value.preferredWorkoutDurationMinutes) &&
    value.preferredWorkoutDurationMinutes >= 0 &&
    isStringArray(value.constraints) &&
    typeof value.updatedAt === "string"
  );
}

function isIntegrationConnection(value: unknown): value is IntegrationConnection {
  return (
    isRecord(value) &&
    typeof value.provider === "string" &&
    integrationProviders.includes(value.provider) &&
    typeof value.status === "string" &&
    integrationStatuses.includes(value.status) &&
    (value.connectedAt === undefined || typeof value.connectedAt === "string")
  );
}

function withWorkoutDefaults(workout: Workout): Workout {
  return {
    ...workout,
    category: workout.category ?? "vo2",
    cues: workout.cues ?? [],
    blocks: workout.blocks.map((block) => ({
      ...block,
      targetMode:
        block.targetMode ??
        (block.startPercentFTP !== undefined || block.endPercentFTP !== undefined
          ? "ramp"
          : block.minPercentFTP !== undefined || block.maxPercentFTP !== undefined
            ? "range"
            : "single"),
      children: block.children?.map((child) => ({
        ...child,
        targetMode:
          child.targetMode ??
          (child.startPercentFTP !== undefined || child.endPercentFTP !== undefined
            ? "ramp"
            : child.minPercentFTP !== undefined || child.maxPercentFTP !== undefined
              ? "range"
              : "single"),
      })),
    })),
  };
}

function safeWorkoutDefaults(value: unknown): Workout | undefined {
  try {
    if (!isRecord(value) || !Array.isArray(value.blocks)) {
      throw new Error("Workout is missing blocks.");
    }

    return withWorkoutDefaults(value as unknown as Workout);
  } catch (error) {
    console.warn("Skipping malformed workout from localStorage", error);
    return undefined;
  }
}

function normalizeWorkouts(value: unknown): Workout[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(safeWorkoutDefaults)
    .filter((workout): workout is Workout => workout !== undefined);
}

export function loadWorkouts(): Workout[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const currentRaw = window.localStorage.getItem(WORKOUTS_STORAGE_KEY);
    if (currentRaw) {
      const parsed = JSON.parse(currentRaw);
      return normalizeWorkouts(parsed);
    }

    const legacyRaw = window.localStorage.getItem(LEGACY_WORKOUTS_STORAGE_KEY);
    if (!legacyRaw) {
      return [];
    }

    const parsed = JSON.parse(legacyRaw);
    const migrated = normalizeWorkouts(parsed);
    window.localStorage.setItem(WORKOUTS_STORAGE_KEY, JSON.stringify(migrated));
    return migrated;
  } catch {
    return [];
  }
}

export function saveWorkout(workout: Workout): Workout[] {
  const existing = loadWorkouts();
  const updatedWorkout = { ...workout, updatedAt: new Date().toISOString() };
  const next = existing.some((item) => item.id === workout.id)
    ? existing.map((item) => (item.id === workout.id ? updatedWorkout : item))
    : [updatedWorkout, ...existing];

  window.localStorage.setItem(WORKOUTS_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function deleteWorkout(id: string): Workout[] {
  const next = loadWorkouts().filter((workout) => workout.id !== id);
  window.localStorage.setItem(WORKOUTS_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function loadProfile(): AthleteProfile {
  if (typeof window === "undefined") {
    return defaultProfile;
  }

  try {
    const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) {
      return defaultProfile;
    }

    const parsed = JSON.parse(raw);
    return isAthleteProfile(parsed) ? { ...defaultProfile, ...parsed } : defaultProfile;
  } catch {
    return defaultProfile;
  }
}

export function saveProfile(profile: AthleteProfile): AthleteProfile {
  const next = { ...profile, updatedAt: new Date().toISOString() };
  window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function loadIntegrationConnections(): IntegrationConnection[] {
  if (typeof window === "undefined") {
    return defaultIntegrationConnections;
  }

  try {
    const raw = window.localStorage.getItem(INTEGRATIONS_STORAGE_KEY);
    if (!raw) {
      return defaultIntegrationConnections;
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every(isIntegrationConnection)
      ? parsed
      : defaultIntegrationConnections;
  } catch {
    return defaultIntegrationConnections;
  }
}
