import { getStepTargetMode } from "./flatten";
import type { Workout, WorkoutCue, WorkoutStep, WorkoutValidationIssue } from "./types";

function validateCues(
  cues: WorkoutCue[] | undefined,
  ownerId: string,
  ownerLabel: string,
  stepId?: string,
): WorkoutValidationIssue[] {
  const issues: WorkoutValidationIssue[] = [];

  for (const cue of cues ?? []) {
    const cueLabel = cue.id || "cue";

    if (!Number.isFinite(cue.atSeconds) || cue.atSeconds < 0) {
      issues.push({
        id: `${ownerId}-${cueLabel}-cue-start`,
        severity: "error",
        message: `${ownerLabel} has a cue with an invalid start time.`,
        stepId,
      });
    }

    if (!Number.isFinite(cue.durationSeconds) || cue.durationSeconds <= 0) {
      issues.push({
        id: `${ownerId}-${cueLabel}-cue-duration`,
        severity: "error",
        message: `${ownerLabel} has a cue with an invalid duration.`,
        stepId,
      });
    }

    if (typeof cue.text !== "string" || !cue.text.trim()) {
      issues.push({
        id: `${ownerId}-${cueLabel}-cue-text`,
        severity: "error",
        message: `${ownerLabel} has a cue without text.`,
        stepId,
      });
    }
  }

  return issues;
}

function validateStep(step: WorkoutStep, path: string): WorkoutValidationIssue[] {
  const issues: WorkoutValidationIssue[] = [];
  const label = step.label || path;

  issues.push(...validateCues(step.cues, step.id, label, step.id));

  if (!step.label.trim()) {
    issues.push({
      id: `${step.id}-label`,
      severity: "warning",
      message: `A block is missing a label.`,
      stepId: step.id,
    });
  }

  if (step.type === "repeat") {
    if (!step.repeatCount || step.repeatCount < 1) {
      issues.push({
        id: `${step.id}-repeat`,
        severity: "error",
        message: `${label} needs at least one repeat.`,
        stepId: step.id,
      });
    }

    if (!step.children?.length) {
      issues.push({
        id: `${step.id}-children`,
        severity: "error",
        message: `${label} needs at least one child interval.`,
        stepId: step.id,
      });
    }

    for (const child of step.children ?? []) {
      issues.push(...validateStep(child, `${label} child`));
    }

    return issues;
  }

  if (!step.durationSeconds || step.durationSeconds <= 0) {
    issues.push({
      id: `${step.id}-duration`,
      severity: "error",
      message: `${label} needs a duration greater than zero.`,
      stepId: step.id,
    });
  }

  const mode = getStepTargetMode(step);

  if (mode === "single" && (step.targetPercentFTP === undefined || step.targetPercentFTP < 0)) {
    issues.push({
      id: `${step.id}-target`,
      severity: "error",
      message: `${label} needs a valid FTP percentage target.`,
      stepId: step.id,
    });
  }

  if (
    mode === "ramp" &&
    (step.startPercentFTP === undefined ||
      step.endPercentFTP === undefined ||
      step.startPercentFTP < 0 ||
      step.endPercentFTP < 0)
  ) {
    issues.push({
      id: `${step.id}-ramp`,
      severity: "error",
      message: `${label} needs valid ramp start and end percentages.`,
      stepId: step.id,
    });
  }

  if (
    mode === "range" &&
    (step.minPercentFTP === undefined ||
      step.maxPercentFTP === undefined ||
      step.minPercentFTP < 0 ||
      step.maxPercentFTP < step.minPercentFTP)
  ) {
    issues.push({
      id: `${step.id}-range`,
      severity: "error",
      message: `${label} needs a valid target range.`,
      stepId: step.id,
    });
  }

  return issues;
}

export function validateWorkout(workout: Workout): WorkoutValidationIssue[] {
  const issues: WorkoutValidationIssue[] = [];

  issues.push(...validateCues(workout.cues, "workout", "Workout"));

  if (!workout.name.trim()) {
    issues.push({
      id: "workout-name",
      severity: "error",
      message: "Workout needs a name.",
    });
  }

  if (!workout.ftp || workout.ftp <= 0) {
    issues.push({
      id: "workout-ftp",
      severity: "error",
      message: "FTP must be greater than zero.",
    });
  }

  if (!workout.blocks.length) {
    issues.push({
      id: "workout-blocks",
      severity: "error",
      message: "Workout needs at least one block.",
    });
  }

  for (const block of workout.blocks) {
    issues.push(...validateStep(block, block.label));
  }

  return issues;
}
