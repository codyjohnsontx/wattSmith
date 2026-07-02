import { createId } from "./math";
import { systemReusableBlocks } from "./reusableBlocks";
import type { TargetMode, Workout, WorkoutStep, WorkoutStepType } from "./types";

export type WorkoutStepContainerId = "root" | string;

export interface WorkoutStepLocation {
  containerId: WorkoutStepContainerId;
  index: number;
}

export interface WorkoutDropJoint {
  containerId: WorkoutStepContainerId;
  index: number;
}

export type DraggedWorkoutItem =
  | { kind: "library-block"; reusableBlockId: string }
  | { kind: "workout-step"; stepId: string };

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

export function createBlockFromTemplate(templateId: BlockTemplateId): WorkoutStep {
  const systemBlockId = `system-${templateId}`;
  const reusableBlock = systemReusableBlocks.find((block) => block.id === systemBlockId);

  if (reusableBlock) {
    return cloneStepWithNewIds(reusableBlock.block);
  }

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

export function cloneStepWithNewIds(step: WorkoutStep): WorkoutStep {
  return {
    ...structuredClone(step),
    id: createId(step.type),
    cues: step.cues?.map((cue) => ({ ...cue, id: createId("cue") })),
    children: step.children?.map(cloneStepWithNewIds),
  };
}

export function duplicateStep(step: WorkoutStep): WorkoutStep {
  return {
    ...cloneStepWithNewIds(step),
    label: `${step.label} copy`,
  };
}

export function moveItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= items.length || toIndex < 0) {
    return items;
  }

  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  next.splice(Math.min(toIndex, next.length), 0, item);
  return next;
}

function getStepChildren(blocks: WorkoutStep[], containerId: WorkoutStepContainerId): WorkoutStep[] | undefined {
  if (containerId === "root") return blocks;

  const container = findStepById(blocks, containerId);
  return container?.type === "repeat" ? (container.children ?? []) : undefined;
}

function clampInsertIndex(items: WorkoutStep[], index: number): number {
  return Math.min(Math.max(0, index), items.length);
}

function locationEquals(a: WorkoutStepLocation, b: WorkoutStepLocation): boolean {
  return a.containerId === b.containerId && a.index === b.index;
}

function updateRepeatChildren(
  steps: WorkoutStep[],
  containerId: string,
  updater: (children: WorkoutStep[]) => WorkoutStep[],
): WorkoutStep[] {
  return steps.map((step) => {
    if (step.id === containerId && step.type === "repeat") {
      return { ...step, children: updater(step.children ?? []) };
    }

    if (step.children) {
      return {
        ...step,
        children: updateRepeatChildren(step.children, containerId, updater),
      };
    }

    return step;
  });
}

function hasDescendantStepId(step: WorkoutStep, stepId: string): boolean {
  return (step.children ?? []).some(
    (child) => child.id === stepId || hasDescendantStepId(child, stepId),
  );
}

function findContainerStep(blocks: WorkoutStep[], containerId: WorkoutStepContainerId): WorkoutStep | undefined {
  return containerId === "root" ? undefined : findStepById(blocks, containerId);
}

function isCurrentLocationAllowedToMove(blocks: WorkoutStep[], step: WorkoutStep, to: WorkoutStepLocation): boolean {
  const from = findStepLocation(blocks, step.id);
  if (!from) return true;
  if (from.containerId === to.containerId) return true;
  if (from.containerId === "root") return true;

  const siblings = getStepChildren(blocks, from.containerId);
  return (siblings?.length ?? 0) > 1;
}

export function insertStepAtLocation(
  blocks: WorkoutStep[],
  location: WorkoutStepLocation,
  step: WorkoutStep,
): WorkoutStep[] {
  if (location.containerId === "root") {
    const next = [...blocks];
    next.splice(clampInsertIndex(next, location.index), 0, step);
    return next;
  }

  return updateRepeatChildren(blocks, location.containerId, (children) => {
    const next = [...children];
    next.splice(clampInsertIndex(next, location.index), 0, step);
    return next;
  });
}

export function removeStepAtLocation(
  blocks: WorkoutStep[],
  location: WorkoutStepLocation,
): { blocks: WorkoutStep[]; removed?: WorkoutStep } {
  if (location.containerId === "root") {
    if (location.index < 0 || location.index >= blocks.length) {
      return { blocks };
    }

    const next = [...blocks];
    const [removed] = next.splice(location.index, 1);
    return { blocks: next, removed };
  }

  let removed: WorkoutStep | undefined;
  const nextBlocks = updateRepeatChildren(blocks, location.containerId, (children) => {
    if (location.index < 0 || location.index >= children.length) return children;

    const next = [...children];
    [removed] = next.splice(location.index, 1);
    return next;
  });

  return { blocks: nextBlocks, removed };
}

export function moveStepToLocation(
  blocks: WorkoutStep[],
  from: WorkoutStepLocation,
  to: WorkoutStepLocation,
): WorkoutStep[] {
  const sourceContainer = getStepChildren(blocks, from.containerId);
  const movingStep = sourceContainer?.[from.index];

  if (!movingStep || !canDropStepAtLocation(blocks, movingStep, to)) return blocks;

  const normalizedTo =
    from.containerId === to.containerId && to.index > from.index
      ? { ...to, index: to.index - 1 }
      : to;

  if (locationEquals(from, normalizedTo)) return blocks;

  const removed = removeStepAtLocation(blocks, from);
  if (!removed.removed) return blocks;

  return insertStepAtLocation(removed.blocks, normalizedTo, removed.removed);
}

export function findStepLocation(
  blocks: WorkoutStep[],
  stepId: string,
): WorkoutStepLocation | undefined {
  for (const [index, step] of blocks.entries()) {
    if (step.id === stepId) return { containerId: "root", index };

    for (const [childIndex, child] of (step.children ?? []).entries()) {
      if (child.id === stepId) return { containerId: step.id, index: childIndex };

      const descendant = findStepLocation([child], stepId);
      if (descendant) return descendant;
    }
  }

  return undefined;
}

export function canDropStepAtLocation(
  blocks: WorkoutStep[],
  step: WorkoutStep,
  location: WorkoutStepLocation,
): boolean {
  const container = getStepChildren(blocks, location.containerId);
  if (!container) return false;
  if (location.index < 0 || location.index > container.length) return false;
  if (step.type === "repeat" && location.containerId !== "root") return false;
  if (!isCurrentLocationAllowedToMove(blocks, step, location)) return false;

  const destinationContainer = findContainerStep(blocks, location.containerId);
  if (destinationContainer && hasDescendantStepId(step, destinationContainer.id)) {
    return false;
  }

  return true;
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
    favorite: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
