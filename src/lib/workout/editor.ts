import { createId } from "./math";
import type { TargetMode, Workout, WorkoutStep, WorkoutStepType } from "./types";

export type BlockTemplateId =
  | "warmup-ramp"
  | "cooldown-ramp"
  | "steady"
  | "recovery"
  | "two-step-repeat"
  | "three-step-repeat"
  | "ramp-up"
  | "ramp-down";

export const blockTemplateLabels: Record<BlockTemplateId, string> = {
  "warmup-ramp": "Warmup ramp",
  "cooldown-ramp": "Cooldown ramp",
  steady: "Steady interval",
  recovery: "Recovery",
  "two-step-repeat": "Two-step repeat",
  "three-step-repeat": "Three-step repeat",
  "ramp-up": "Ramp up",
  "ramp-down": "Ramp down",
};

function singleStep(type: WorkoutStepType, label: string, durationSeconds: number, targetPercentFTP: number) {
  return {
    id: createId(type),
    type,
    label,
    targetMode: "single" as TargetMode,
    durationSeconds,
    targetPercentFTP,
  };
}

function rampStep(
  type: Extract<WorkoutStepType, "warmup" | "cooldown" | "steady">,
  label: string,
  durationSeconds: number,
  startPercentFTP: number,
  endPercentFTP: number,
): WorkoutStep {
  return {
    id: createId(type),
    type,
    label,
    targetMode: "ramp",
    durationSeconds,
    startPercentFTP,
    endPercentFTP,
  };
}

export function createBlockFromTemplate(templateId: BlockTemplateId): WorkoutStep {
  switch (templateId) {
    case "warmup-ramp":
      return rampStep("warmup", "Warmup ramp", 10 * 60, 45, 75);
    case "cooldown-ramp":
      return rampStep("cooldown", "Cooldown ramp", 8 * 60, 60, 35);
    case "steady":
      return singleStep("steady", "Steady interval", 5 * 60, 85);
    case "recovery":
      return singleStep("recovery", "Recovery", 3 * 60, 45);
    case "ramp-up":
      return rampStep("steady", "Ramp up", 6 * 60, 70, 95);
    case "ramp-down":
      return rampStep("steady", "Ramp down", 6 * 60, 95, 70);
    case "three-step-repeat":
      return {
        id: createId("repeat"),
        type: "repeat",
        label: "Three-step repeat",
        repeatCount: 3,
        children: [
          singleStep("steady", "Build", 60, 90),
          singleStep("steady", "Hard", 60, 110),
          singleStep("recovery", "Recover", 120, 50),
        ],
      };
    case "two-step-repeat":
    default:
      return {
        id: createId("repeat"),
        type: "repeat",
        label: "Two-step repeat",
        repeatCount: 4,
        children: [
          singleStep("steady", "Work", 60, 105),
          singleStep("recovery", "Recover", 60, 50),
        ],
      };
  }
}

function rekeyStep(step: WorkoutStep): WorkoutStep {
  return {
    ...step,
    id: createId(step.type),
    cues: step.cues?.map((cue) => ({ ...cue, id: createId("cue") })),
    children: step.children?.map(rekeyStep),
  };
}

export function duplicateStep(step: WorkoutStep): WorkoutStep {
  return {
    ...rekeyStep(step),
    label: `${step.label} copy`,
  };
}

export function moveItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) {
    return items;
  }

  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  next.splice(Math.min(toIndex, next.length), 0, item);
  return next;
}

export function updateStepById(
  steps: WorkoutStep[],
  stepId: string,
  updater: (step: WorkoutStep) => WorkoutStep,
): WorkoutStep[] {
  return steps.map((step) => {
    if (step.id === stepId) {
      return updater(step);
    }

    if (step.children) {
      return {
        ...step,
        children: updateStepById(step.children, stepId, updater),
      };
    }

    return step;
  });
}

export function removeStepById(steps: WorkoutStep[], stepId: string): WorkoutStep[] {
  return steps
    .filter((step) => step.id !== stepId)
    .map((step) => ({
      ...step,
      children: step.children ? removeStepById(step.children, stepId) : undefined,
    }));
}

export function findStepById(steps: WorkoutStep[], stepId?: string): WorkoutStep | undefined {
  if (!stepId) return undefined;

  for (const step of steps) {
    if (step.id === stepId) return step;
    const child = findStepById(step.children ?? [], stepId);
    if (child) return child;
  }

  return undefined;
}

export function duplicateWorkout(workout: Workout): Workout {
  const timestamp = new Date().toISOString();
  return {
    ...structuredClone(workout),
    id: createId("workout"),
    name: `${workout.name} copy`,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
