import type { Workout, WorkoutCue, WorkoutStep } from "./types";

function stepDuration(step: WorkoutStep): number {
  if (step.type !== "repeat") {
    return Math.max(1, Math.round(step.durationSeconds ?? 1));
  }

  const children = step.children ?? [];
  const childDuration = children.reduce((total, child) => total + stepDuration(child), 0);
  return childDuration * Math.max(1, Math.round(step.repeatCount ?? 1));
}

function collectStepCues(step: WorkoutStep, startSeconds: number): WorkoutCue[] {
  const ownCues = (step.cues ?? []).map((cue) => ({
    ...cue,
    atSeconds: startSeconds + cue.atSeconds,
  }));

  if (step.type !== "repeat") {
    return ownCues;
  }

  const cues = [...ownCues];
  const children = step.children ?? [];
  const repeatCount = Math.max(1, Math.round(step.repeatCount ?? 1));
  const repeatDuration = children.reduce((total, child) => total + stepDuration(child), 0);

  for (let repeatIndex = 0; repeatIndex < repeatCount; repeatIndex += 1) {
    let childCursor = startSeconds + repeatIndex * repeatDuration;

    for (const child of children) {
      cues.push(...collectStepCues(child, childCursor));
      childCursor += stepDuration(child);
    }
  }

  return cues;
}

export function collectWorkoutCues(workout: Workout): WorkoutCue[] {
  const cues = [...(workout.cues ?? [])];
  let cursor = 0;

  for (const block of workout.blocks) {
    cues.push(...collectStepCues(block, cursor));
    cursor += stepDuration(block);
  }

  return cues.sort((a, b) => a.atSeconds - b.atSeconds);
}
