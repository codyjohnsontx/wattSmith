import { Prisma, type StructuredWorkout } from "@prisma/client";
import { normalizeWorkouts } from "@/lib/workout/storage";
import type { Workout, WorkoutCategory, WorkoutCue, WorkoutRationale, WorkoutStep } from "@/lib/workout/types";
import { validateWorkout } from "@/lib/workout/validation";

export type WorkoutValidationResult =
  | { success: true; workout: Workout }
  | { success: false; errors: string[] };

function isJsonObjectArray(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value) && value.every((item) => typeof item === "object" && item !== null);
}

export function validateWorkoutPayload(value: unknown): WorkoutValidationResult {
  const [workout] = normalizeWorkouts([value]);
  if (!workout) {
    return { success: false, errors: ["Workout payload is malformed."] };
  }

  const errors = validateWorkout(workout)
    .filter((issue) => issue.severity === "error")
    .map((issue) => issue.message);

  if (!workout.id.trim()) errors.push("Workout id is required.");
  if (typeof workout.description !== "string") errors.push("Workout description is required.");
  if (!workout.createdAt || Number.isNaN(Date.parse(workout.createdAt))) {
    errors.push("Workout createdAt must be an ISO date string.");
  }
  if (!workout.updatedAt || Number.isNaN(Date.parse(workout.updatedAt))) {
    errors.push("Workout updatedAt must be an ISO date string.");
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    workout: {
      ...workout,
      ftp: Math.round(workout.ftp),
      category: workout.category as WorkoutCategory | undefined,
      favorite: workout.favorite === true,
      cues: workout.cues ?? [],
    },
  };
}

export function structuredWorkoutToWorkout(record: StructuredWorkout): Workout {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    category: record.category as WorkoutCategory | undefined,
    favorite: record.favorite,
    ftp: record.ftp,
    blocks: isJsonObjectArray(record.blocksJson) ? (record.blocksJson as unknown as WorkoutStep[]) : [],
    cues: isJsonObjectArray(record.cuesJson) ? (record.cuesJson as unknown as WorkoutCue[]) : [],
    rationale:
      typeof record.rationaleJson === "object" && record.rationaleJson !== null
        ? (record.rationaleJson as unknown as WorkoutRationale)
        : undefined,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function workoutToStructuredInput(
  workout: Workout,
): Omit<Prisma.StructuredWorkoutUncheckedCreateInput, "userId"> {
  return {
    id: workout.id,
    name: workout.name,
    description: workout.description,
    category: workout.category,
    favorite: workout.favorite === true,
    ftp: Math.round(workout.ftp),
    blocksJson: workout.blocks as unknown as Prisma.InputJsonValue,
    cuesJson: (workout.cues ?? []) as unknown as Prisma.InputJsonValue,
    rationaleJson: workout.rationale
      ? (workout.rationale as unknown as Prisma.InputJsonValue)
      : Prisma.JsonNull,
    createdAt: new Date(workout.createdAt),
    updatedAt: new Date(workout.updatedAt),
  };
}

export function canAccessOwnedRecord(
  record: { userId: string } | null | undefined,
  userId: string,
): boolean {
  return record?.userId === userId;
}
