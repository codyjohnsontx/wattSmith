import type {
  AthleteProfile,
  IntegrationConnection,
  ReusableBlockCategory,
  ReusableWorkoutBlock,
  TargetMode,
  Workout,
  WorkoutStep,
} from "./types";

export const LEGACY_WORKOUTS_STORAGE_KEY = "wattsmith.workouts.v1";
export const WORKOUTS_STORAGE_KEY = "wattsmith.workouts.v2";
export const PROFILE_STORAGE_KEY = "wattsmith.profile.v1";
export const INTEGRATIONS_STORAGE_KEY = "wattsmith.integrations.v1";
export const REUSABLE_BLOCKS_STORAGE_KEY = "wattsmith.reusableBlocks.v1";

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
const reusableBlockCategories: ReusableBlockCategory[] = [
  "warmup",
  "cooldown",
  "recovery",
  "endurance",
  "tempo",
  "sweet-spot",
  "threshold",
  "vo2",
  "anaerobic",
  "general",
];
const workoutStepTypes = ["warmup", "cooldown", "steady", "repeat", "recovery"];
const targetModes: TargetMode[] = ["single", "range", "ramp"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function inferTargetMode(step: WorkoutStep): TargetMode {
  return (
    step.targetMode ??
    (step.startPercentFTP !== undefined || step.endPercentFTP !== undefined
      ? "ramp"
      : step.minPercentFTP !== undefined || step.maxPercentFTP !== undefined
        ? "range"
        : "single")
  );
}

function withStepDefaults(step: WorkoutStep): WorkoutStep {
  return {
    ...step,
    targetMode: step.type === "repeat" ? step.targetMode : inferTargetMode(step),
    children: step.children?.map(withStepDefaults),
  };
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
    blocks: workout.blocks.map(withStepDefaults),
  };
}

function isWorkoutStep(value: unknown): value is WorkoutStep {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.type !== "string" ||
    !workoutStepTypes.includes(value.type) ||
    typeof value.label !== "string"
  ) {
    return false;
  }

  const optionalNumberFields = [
    "durationSeconds",
    "targetPercentFTP",
    "startPercentFTP",
    "endPercentFTP",
    "minPercentFTP",
    "maxPercentFTP",
    "repeatCount",
  ];

  for (const field of optionalNumberFields) {
    const fieldValue = value[field];
    if (
      fieldValue !== undefined &&
      (typeof fieldValue !== "number" || !Number.isFinite(fieldValue))
    ) {
      return false;
    }
  }

  if (
    value.cues !== undefined &&
    (!Array.isArray(value.cues) ||
      !value.cues.every(
        (cue) =>
          isRecord(cue) &&
          typeof cue.id === "string" &&
          typeof cue.text === "string" &&
          typeof cue.atSeconds === "number" &&
          Number.isFinite(cue.atSeconds) &&
          typeof cue.durationSeconds === "number" &&
          Number.isFinite(cue.durationSeconds),
      ))
  ) {
    return false;
  }

  if (
    value.targetMode !== undefined &&
    (typeof value.targetMode !== "string" || !targetModes.includes(value.targetMode as TargetMode))
  ) {
    return false;
  }

  if (value.children !== undefined) {
    return Array.isArray(value.children) && value.children.every(isWorkoutStep);
  }

  return true;
}

export function isReusableWorkoutBlock(value: unknown): value is ReusableWorkoutBlock {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.category === "string" &&
    reusableBlockCategories.includes(value.category as ReusableBlockCategory) &&
    (value.notes === undefined || typeof value.notes === "string") &&
    (value.tags === undefined || isStringArray(value.tags)) &&
    value.source === "user" &&
    isWorkoutStep(value.block) &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

export function withReusableBlockDefaults(block: ReusableWorkoutBlock): ReusableWorkoutBlock {
  return {
    ...block,
    notes: block.notes ?? "",
    tags: block.tags ?? [],
    block: withStepDefaults(block.block),
  };
}

function safeReusableBlockDefaults(value: unknown): ReusableWorkoutBlock | undefined {
  try {
    if (!isReusableWorkoutBlock(value)) {
      throw new Error("Reusable block is malformed or not user-owned.");
    }

    return withReusableBlockDefaults(value);
  } catch (error) {
    console.warn("Skipping malformed reusable block from localStorage", error);
    return undefined;
  }
}

export function normalizeReusableBlocks(value: unknown): ReusableWorkoutBlock[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(safeReusableBlockDefaults)
    .filter((block): block is ReusableWorkoutBlock => block !== undefined);
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

export function loadReusableBlocks(): ReusableWorkoutBlock[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(REUSABLE_BLOCKS_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    return normalizeReusableBlocks(JSON.parse(raw));
  } catch {
    return [];
  }
}

function persistReusableBlocks(blocks: ReusableWorkoutBlock[]): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(REUSABLE_BLOCKS_STORAGE_KEY, JSON.stringify(blocks));
  } catch (error) {
    console.warn("Unable to save reusable blocks to localStorage", error);
  }
}

export function saveReusableBlock(block: ReusableWorkoutBlock): ReusableWorkoutBlock[] {
  const existing = loadReusableBlocks();
  if (block.source !== "user") {
    return existing;
  }

  const timestamp = new Date().toISOString();
  const nextBlock = withReusableBlockDefaults({
    ...block,
    createdAt: block.createdAt || timestamp,
    updatedAt: timestamp,
  });
  const next = existing.some((item) => item.id === nextBlock.id)
    ? existing.map((item) => (item.id === nextBlock.id ? nextBlock : item))
    : [nextBlock, ...existing];

  persistReusableBlocks(next);
  return next;
}

export function deleteReusableBlock(id: string): ReusableWorkoutBlock[] {
  const next = loadReusableBlocks().filter((block) => block.id !== id);
  persistReusableBlocks(next);
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
