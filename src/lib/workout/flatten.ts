import { percentToWatts } from "./math";
import type { FlattenedSegment, Workout, WorkoutStep } from "./types";

function getStepPercents(step: WorkoutStep) {
  const fallbackPercent = step.targetPercentFTP ?? 0;
  return {
    startPercentFTP: step.startPercentFTP ?? fallbackPercent,
    endPercentFTP: step.endPercentFTP ?? fallbackPercent,
  };
}

function flattenStep(
  step: WorkoutStep,
  ftp: number,
  startSeconds: number,
  path: string,
): { segments: FlattenedSegment[]; endSeconds: number } {
  if (step.type === "repeat") {
    const repeatCount = Math.max(1, Math.round(step.repeatCount ?? 1));
    const children = step.children ?? [];
    const segments: FlattenedSegment[] = [];
    let cursor = startSeconds;

    for (let repeatIndex = 0; repeatIndex < repeatCount; repeatIndex += 1) {
      for (const child of children) {
        const result = flattenStep(
          child,
          ftp,
          cursor,
          `${path}-${repeatIndex + 1}-${child.id}`,
        );
        segments.push(...result.segments);
        cursor = result.endSeconds;
      }
    }

    return { segments, endSeconds: cursor };
  }

  const durationSeconds = Math.max(1, Math.round(step.durationSeconds ?? 1));
  const endSeconds = startSeconds + durationSeconds;
  const { startPercentFTP, endPercentFTP } = getStepPercents(step);

  return {
    endSeconds,
    segments: [
      {
        id: path,
        parentStepId: step.id,
        label: step.label,
        type: step.type,
        startSeconds,
        endSeconds,
        durationSeconds,
        startPercentFTP,
        endPercentFTP,
        startWatts: percentToWatts(ftp, startPercentFTP),
        endWatts: percentToWatts(ftp, endPercentFTP),
      },
    ],
  };
}

export function flattenWorkout(workout: Workout): FlattenedSegment[] {
  const segments: FlattenedSegment[] = [];
  let cursor = 0;

  for (const block of workout.blocks) {
    const result = flattenStep(block, workout.ftp, cursor, block.id);
    segments.push(...result.segments);
    cursor = result.endSeconds;
  }

  return segments;
}
