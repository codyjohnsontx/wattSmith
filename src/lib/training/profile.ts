import type { AthleteProfile as DbAthleteProfile, Prisma } from "@prisma/client";
import { defaultProfile } from "@/lib/workout/storage";
import type { AthleteProfile } from "@/lib/workout/types";

export const experienceLevels = ["new", "recreational", "serious", "competitive", "elite"] as const;
export const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export type ProfileValidationResult =
  | { success: true; profile: AthleteProfile }
  | { success: false; errors: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseStringArray(value: unknown, field: string, errors: string[]): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    errors.push(`${field} must be an array of strings.`);
    return [];
  }

  return value;
}

export function validateProfilePayload(value: unknown): ProfileValidationResult {
  const errors: string[] = [];

  if (!isRecord(value)) {
    return { success: false, errors: ["Profile payload must be an object."] };
  }

  const ftp = Number(value.ftp);
  if (!Number.isFinite(ftp) || ftp < 1) {
    errors.push("ftp must be at least 1.");
  }

  const experienceLevel = value.experienceLevel;
  if (typeof experienceLevel !== "string" || !experienceLevels.includes(experienceLevel as never)) {
    errors.push("experienceLevel is not supported.");
  }

  const weeklyHours = Number(value.weeklyHours);
  if (!Number.isFinite(weeklyHours) || weeklyHours < 0) {
    errors.push("weeklyHours must be at least 0.");
  }

  const availableDays = parseStringArray(value.availableDays, "availableDays", errors);
  const invalidDays = availableDays.filter((day) => !weekdays.includes(day as never));
  if (invalidDays.length > 0) {
    errors.push("availableDays must only contain Mon through Sun.");
  }

  const primaryGoal =
    typeof value.primaryGoal === "string" ? value.primaryGoal : defaultProfile.primaryGoal;
  if (typeof value.primaryGoal !== "string") {
    errors.push("primaryGoal must be a string.");
  }

  let targetEventDate: string | undefined;
  if (value.targetEventDate !== undefined && value.targetEventDate !== null && value.targetEventDate !== "") {
    if (typeof value.targetEventDate !== "string" || Number.isNaN(Date.parse(value.targetEventDate))) {
      errors.push("targetEventDate must be an ISO date string.");
    } else {
      targetEventDate = new Date(value.targetEventDate).toISOString();
    }
  }

  const preferredWorkoutDurationMinutes = Number(value.preferredWorkoutDurationMinutes);
  if (!Number.isFinite(preferredWorkoutDurationMinutes) || preferredWorkoutDurationMinutes < 15) {
    errors.push("preferredWorkoutDurationMinutes must be at least 15.");
  }

  const constraints = parseStringArray(value.constraints, "constraints", errors);

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    profile: {
      id: typeof value.id === "string" ? value.id : defaultProfile.id,
      ftp: Math.round(ftp),
      experienceLevel: experienceLevel as AthleteProfile["experienceLevel"],
      weeklyHours,
      availableDays: availableDays.filter((day, index) => availableDays.indexOf(day) === index),
      primaryGoal,
      targetEventDate,
      preferredWorkoutDurationMinutes: Math.round(preferredWorkoutDurationMinutes),
      constraints,
      updatedAt:
        typeof value.updatedAt === "string" && !Number.isNaN(Date.parse(value.updatedAt))
          ? value.updatedAt
          : new Date().toISOString(),
    },
  };
}

export function dbProfileToAthleteProfile(profile: DbAthleteProfile): AthleteProfile {
  return {
    id: profile.id,
    ftp: profile.ftp,
    experienceLevel: profile.experienceLevel as AthleteProfile["experienceLevel"],
    weeklyHours: profile.weeklyHours,
    availableDays: profile.availableDays,
    primaryGoal: profile.primaryGoal,
    targetEventDate: profile.targetEventDate?.toISOString(),
    preferredWorkoutDurationMinutes: profile.preferredWorkoutDurationMinutes,
    constraints: profile.constraints,
    updatedAt: profile.updatedAt.toISOString(),
  };
}

export function profileToDbInput(
  profile: AthleteProfile,
): Omit<Prisma.AthleteProfileUncheckedCreateInput, "id" | "userId" | "createdAt" | "updatedAt"> {
  return {
    ftp: profile.ftp,
    experienceLevel: profile.experienceLevel,
    weeklyHours: profile.weeklyHours,
    availableDays: profile.availableDays,
    primaryGoal: profile.primaryGoal,
    targetEventDate: profile.targetEventDate ? new Date(profile.targetEventDate) : null,
    preferredWorkoutDurationMinutes: profile.preferredWorkoutDurationMinutes,
    constraints: profile.constraints,
  };
}

export function defaultProfileDbInput() {
  return profileToDbInput(defaultProfile);
}
