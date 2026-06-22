import { percentToWatts } from "./math";
import type {
  ExportRangeStrategy,
  FlattenedSegment,
  TargetMode,
  Workout,
  WorkoutStep,
} from "./types";

function rangeTarget(step: WorkoutStep, strategy: ExportRangeStrategy): number {
  const min = step.minPercentFTP ?? step.targetPercentFTP ?? 0;
  const max = step.maxPercentFTP ?? step.targetPercentFTP ?? min;

  if (strategy === "low") return min;
  if (strategy === "high") return max;
  return (min + max) / 2;
}

export function getStepTargetMode(step: WorkoutStep): TargetMode {
  if (step.targetMode) return step.targetMode;
  if (step.startPercentFTP !== undefined || step.endPercentFTP !== undefined) return "ramp";
  if (step.minPercentFTP !== undefined || step.maxPercentFTP !== undefined) return "range";
  return "single";
}

function getStepPercents(step: WorkoutStep, rangeStrategy: ExportRangeStrategy) {
  const targetMode = getStepTargetMode(step);

  if (targetMode === "range") {
    const target = rangeTarget(step, rangeStrategy);
    return {
      startPercentFTP: target,
      endPercentFTP: target,
      minPercentFTP: step.minPercentFTP ?? target,
      maxPercentFTP: step.maxPercentFTP ?? target,
      targetMode,
    };
  }

  if (targetMode === "ramp") {
    const fallbackPercent = step.targetPercentFTP ?? step.startPercentFTP ?? step.endPercentFTP ?? 0;
    return {
      startPercentFTP: step.startPercentFTP ?? fallbackPercent,
      endPercentFTP: step.endPercentFTP ?? fallbackPercent,
      targetMode,
    };
  }

  const fallbackPercent = step.targetPercentFTP ?? 0;
  return {
    startPercentFTP: fallbackPercent,
    endPercentFTP: fallbackPercent,
    targetMode,
  };
}

function flattenStep(
  step: WorkoutStep,
  ftp: number,
  startSeconds: number,
  path: string,
  rangeStrategy: ExportRangeStrategy,
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
          rangeStrategy,
        );
        segments.push(...result.segments);
        cursor = result.endSeconds;
      }
    }

    return { segments, endSeconds: cursor };
  }

  const durationSeconds = Math.max(1, Math.round(step.durationSeconds ?? 1));
  const endSeconds = startSeconds + durationSeconds;
  const { startPercentFTP, endPercentFTP, minPercentFTP, maxPercentFTP, targetMode } =
    getStepPercents(step, rangeStrategy);

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
        minPercentFTP,
        maxPercentFTP,
        targetMode,
        startWatts: percentToWatts(ftp, startPercentFTP),
        endWatts: percentToWatts(ftp, endPercentFTP),
        minWatts: minPercentFTP === undefined ? undefined : percentToWatts(ftp, minPercentFTP),
        maxWatts: maxPercentFTP === undefined ? undefined : percentToWatts(ftp, maxPercentFTP),
      },
    ],
  };
}

export function flattenWorkout(
  workout: Workout,
  rangeStrategy: ExportRangeStrategy = "midpoint",
): FlattenedSegment[] {
  const segments: FlattenedSegment[] = [];
  let cursor = 0;

  for (const block of workout.blocks) {
    const result = flattenStep(block, workout.ftp, cursor, block.id, rangeStrategy);
    segments.push(...result.segments);
    cursor = result.endSeconds;
  }

  return segments;
}
