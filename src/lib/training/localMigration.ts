import type { AthleteProfile, Workout } from "@/lib/workout/types";
import { validateProfilePayload } from "./profile";
import { validateWorkoutPayload } from "./workouts";

export const LOCAL_MIGRATION_MARKER_KEY = "wattsmith.localMigration.v1";

export type LocalMigrationPayload = {
  profile?: AthleteProfile;
  workouts: Workout[];
};

export type LocalMigrationValidationResult =
  | { success: true; profile?: AthleteProfile; workouts: Workout[] }
  | { success: false; errors: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function validateLocalMigrationPayload(value: unknown): LocalMigrationValidationResult {
  if (!isRecord(value)) {
    return { success: false, errors: ["Migration payload must be an object."] };
  }

  const errors: string[] = [];
  let profile: AthleteProfile | undefined;

  if (value.profile !== undefined) {
    const profileResult = validateProfilePayload(value.profile);
    if (profileResult.success) {
      profile = profileResult.profile;
    } else {
      errors.push(...profileResult.errors);
    }
  }

  if (!Array.isArray(value.workouts)) {
    errors.push("workouts must be an array.");
  }

  const workouts = Array.isArray(value.workouts) ? value.workouts : [];
  const validatedWorkouts: Workout[] = [];

  for (const [index, workout] of workouts.entries()) {
    const workoutResult = validateWorkoutPayload(workout);
    if (workoutResult.success) {
      validatedWorkouts.push(workoutResult.workout);
    } else {
      errors.push(...workoutResult.errors.map((error) => `workouts[${index}]: ${error}`));
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return { success: true, profile, workouts: validatedWorkouts };
}
