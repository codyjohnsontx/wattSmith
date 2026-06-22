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

export function loadWorkouts(): Workout[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const currentRaw = window.localStorage.getItem(WORKOUTS_STORAGE_KEY);
    if (currentRaw) {
      const parsed = JSON.parse(currentRaw);
      return Array.isArray(parsed) ? parsed.map(withWorkoutDefaults) : [];
    }

    const legacyRaw = window.localStorage.getItem(LEGACY_WORKOUTS_STORAGE_KEY);
    if (!legacyRaw) {
      return [];
    }

    const parsed = JSON.parse(legacyRaw);
    const migrated = Array.isArray(parsed) ? parsed.map(withWorkoutDefaults) : [];
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

    return { ...defaultProfile, ...JSON.parse(raw) };
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
    return Array.isArray(parsed) ? parsed : defaultIntegrationConnections;
  } catch {
    return defaultIntegrationConnections;
  }
}
