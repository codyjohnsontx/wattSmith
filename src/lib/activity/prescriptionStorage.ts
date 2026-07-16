import type { ActivityPrescriptionDraft } from "@/lib/activity/prescription";
import type { Workout, WorkoutCue, WorkoutRationale, WorkoutStep } from "@/lib/workout/types";
import { validateWorkout } from "@/lib/workout/validation";

const prescriptionDraftKey = "wattsmith.activity-prescription-draft.v1";
const workoutCategories = ["recovery", "endurance", "tempo", "sweet-spot", "threshold", "vo2", "anaerobic"];
const workoutStepTypes = ["warmup", "cooldown", "steady", "repeat", "recovery"];
const targetModes = ["single", "range", "ramp"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPositiveNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

function isValidDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isWorkoutCue(value: unknown): value is WorkoutCue {
  return isRecord(value)
    && typeof value.id === "string"
    && isFiniteNumber(value.atSeconds)
    && value.atSeconds >= 0
    && typeof value.text === "string"
    && isPositiveNumber(value.durationSeconds);
}

function isWorkoutRationale(value: unknown): value is WorkoutRationale {
  return isRecord(value)
    && typeof value.summary === "string"
    && Array.isArray(value.sourceIds)
    && value.sourceIds.every((item) => typeof item === "string")
    && Array.isArray(value.cautions)
    && value.cautions.every((item) => typeof item === "string")
    && (value.whyItWorks === undefined || typeof value.whyItWorks === "string")
    && (value.whoShouldModify === undefined || typeof value.whoShouldModify === "string");
}

function hasValidCues(value: Record<string, unknown>): boolean {
  return value.cues === undefined
    || (Array.isArray(value.cues) && value.cues.every(isWorkoutCue));
}

function isWorkoutStep(value: unknown): value is WorkoutStep {
  if (!isRecord(value)
    || typeof value.id !== "string"
    || !value.id.trim()
    || typeof value.label !== "string"
    || typeof value.type !== "string"
    || !workoutStepTypes.includes(value.type)
    || !hasValidCues(value)) {
    return false;
  }

  if (value.type === "repeat") {
    return Number.isInteger(value.repeatCount)
      && isPositiveNumber(value.repeatCount)
      && Array.isArray(value.children)
      && value.children.length > 0
      && value.children.every(isWorkoutStep);
  }

  if (!isPositiveNumber(value.durationSeconds)
    || typeof value.targetMode !== "string"
    || !targetModes.includes(value.targetMode)) {
    return false;
  }

  if (value.targetMode === "single") {
    return isFiniteNumber(value.targetPercentFTP) && value.targetPercentFTP >= 0;
  }
  if (value.targetMode === "ramp") {
    return isFiniteNumber(value.startPercentFTP)
      && value.startPercentFTP >= 0
      && isFiniteNumber(value.endPercentFTP)
      && value.endPercentFTP >= 0;
  }
  return isFiniteNumber(value.minPercentFTP)
    && value.minPercentFTP >= 0
    && isFiniteNumber(value.maxPercentFTP)
    && value.maxPercentFTP >= value.minPercentFTP;
}

function isWorkout(value: unknown): value is Workout {
  if (!(isRecord(value)
    && typeof value.id === "string"
    && Boolean(value.id.trim())
    && typeof value.name === "string"
    && typeof value.description === "string"
    && isPositiveNumber(value.ftp)
    && Array.isArray(value.blocks)
    && value.blocks.length > 0
    && value.blocks.every(isWorkoutStep)
    && (value.category === undefined
      || (typeof value.category === "string" && workoutCategories.includes(value.category)))
    && (value.favorite === undefined || typeof value.favorite === "boolean")
    && hasValidCues(value)
    && (value.rationale === undefined || isWorkoutRationale(value.rationale))
    && isValidDate(value.createdAt)
    && isValidDate(value.updatedAt))) {
    return false;
  }

  return !validateWorkout(value as unknown as Workout)
    .some((issue) => issue.severity === "error");
}

function isOrigin(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const validSourcePath = typeof value.sourcePath === "string"
    && /^\/(?:demo\/)?activities\/[^/?#]+$/.test(value.sourcePath);

  return typeof value.findingLabel === "string"
    && isPositiveNumber(value.observedWatts)
    && isPositiveNumber(value.observedPercentFtp)
    && isPositiveNumber(value.targetWatts)
    && isPositiveNumber(value.targetPercentFtp)
    && isPositiveNumber(value.workIntervalSeconds)
    && Number.isInteger(value.repeatCount)
    && isPositiveNumber(value.repeatCount)
    && (value.recoverySeconds === null
      || (isFiniteNumber(value.recoverySeconds) && value.recoverySeconds >= 0))
    && validSourcePath
    && (value.sourceType === "strava" || value.sourceType === "synthetic-demo");
}

function isPrescriptionDraft(value: unknown): value is ActivityPrescriptionDraft {
  return isRecord(value)
    && value.version === 1
    && isWorkout(value.workout)
    && isOrigin(value.origin);
}

export function saveActivityPrescriptionDraft(draft: ActivityPrescriptionDraft) {
  window.sessionStorage.setItem(prescriptionDraftKey, JSON.stringify(draft));
}

export function consumeActivityPrescriptionDraft(): ActivityPrescriptionDraft | null {
  const raw = window.sessionStorage.getItem(prescriptionDraftKey);
  if (!raw) return null;
  window.sessionStorage.removeItem(prescriptionDraftKey);

  try {
    const value: unknown = JSON.parse(raw);
    return isPrescriptionDraft(value) ? value : null;
  } catch {
    return null;
  }
}
