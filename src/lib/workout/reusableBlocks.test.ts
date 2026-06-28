import { describe, expect, it } from "vitest";
import { cloneStepWithNewIds } from "./editor";
import { exportWorkoutToErg } from "./exportErg";
import { exportWorkoutToMrc } from "./exportMrc";
import { buildExportReadinessChecklist } from "./exportReadiness";
import { flattenWorkout } from "./flatten";
import { systemReusableBlocks } from "./reusableBlocks";
import { normalizeReusableBlocks } from "./storage";
import { calculateWorkoutSummary } from "./summary";
import type { ReusableWorkoutBlock, Workout, WorkoutStep } from "./types";
import { validateWorkout } from "./validation";

function workoutForBlock(block: WorkoutStep): Workout {
  return {
    id: "reusable-block-validation",
    name: "Reusable block validation",
    description: "",
    category: "endurance",
    ftp: 200,
    blocks: [block],
    cues: [],
    createdAt: "2026-06-28T00:00:00.000Z",
    updatedAt: "2026-06-28T00:00:00.000Z",
  };
}

function collectStepIds(step: WorkoutStep): string[] {
  return [step.id, ...(step.children ?? []).flatMap(collectStepIds)];
}

function expectedSegmentCount(step: WorkoutStep): number {
  if (step.type !== "repeat") return 1;
  return Math.max(1, Math.round(step.repeatCount ?? 1)) * (step.children?.length ?? 0);
}

describe("reusable workout blocks", () => {
  it("ships valid protected system blocks", () => {
    expect(systemReusableBlocks).toHaveLength(60);

    for (const block of systemReusableBlocks) {
      const errors = validateWorkout(workoutForBlock(block.block)).filter(
        (issue) => issue.severity === "error",
      );

      expect(block.id.startsWith("system-"), block.name).toBe(true);
      expect(block.name, block.id).toBeTruthy();
      expect(block.category, block.name).toBeTruthy();
      expect(block.notes, block.name).toBeTruthy();
      expect(Array.isArray(block.tags), block.name).toBe(true);
      expect(block.source).toBe("system");
      expect(errors, block.name).toEqual([]);
    }
  });

  it("keeps system block ids unique across reusable and step ids", () => {
    const ids = systemReusableBlocks.flatMap((block) => [block.id, ...collectStepIds(block.block)]);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("flattens every system block with expected repeat segment counts", () => {
    for (const block of systemReusableBlocks) {
      const segments = flattenWorkout(workoutForBlock(block.block));

      expect(segments.length, block.name).toBeGreaterThan(0);
      expect(segments, block.name).toHaveLength(expectedSegmentCount(block.block));
    }
  });

  it("keeps system blocks export-ready", () => {
    for (const block of systemReusableBlocks) {
      const workout = workoutForBlock(block.block);
      const checklist = buildExportReadinessChecklist({
        workout,
        rangeStrategy: "midpoint",
        validationIssues: validateWorkout(workout),
        summary: calculateWorkoutSummary(workout),
        mrc: exportWorkoutToMrc(workout),
        erg: exportWorkoutToErg(workout),
      });

      expect(checklist.some((item) => item.status === "error"), block.name).toBe(false);
    }
  });

  it("clones and rekeys steps recursively while preserving workout details", () => {
    const source = systemReusableBlocks.find((block) => block.block.type === "repeat")?.block;
    expect(source).toBeDefined();

    const clone = cloneStepWithNewIds(source as WorkoutStep);
    const sourceIds = collectStepIds(source as WorkoutStep);
    const cloneIds = collectStepIds(clone);

    expect(clone.id).not.toBe((source as WorkoutStep).id);
    expect(cloneIds).toHaveLength(sourceIds.length);
    cloneIds.forEach((id) => expect(sourceIds).not.toContain(id));
    expect(clone.label).toBe((source as WorkoutStep).label);
    expect(clone.repeatCount).toBe((source as WorkoutStep).repeatCount);
    expect(clone.children?.[0]?.durationSeconds).toBe(
      (source as WorkoutStep).children?.[0]?.durationSeconds,
    );
    expect(clone.children?.[0]?.targetPercentFTP).toBe(
      (source as WorkoutStep).children?.[0]?.targetPercentFTP,
    );
  });

  it("inserts reusable blocks as independent snapshots", () => {
    const reusableBlock = structuredClone(systemReusableBlocks[0]);
    const inserted = cloneStepWithNewIds(reusableBlock.block);

    reusableBlock.block.label = "Changed library block";
    reusableBlock.block.durationSeconds = 1;

    expect(inserted.label).toBe("Warmup ramp");
    expect(inserted.durationSeconds).toBe(10 * 60);
  });

  it("skips malformed stored blocks and normalizes target modes", () => {
    const storedBlock: ReusableWorkoutBlock = {
      id: "custom",
      name: "Custom",
      category: "general",
      source: "user",
      block: {
        id: "range-step",
        type: "steady",
        label: "Range",
        durationSeconds: 60,
        minPercentFTP: 80,
        maxPercentFTP: 90,
      },
      createdAt: "2026-06-28T00:00:00.000Z",
      updatedAt: "2026-06-28T00:00:00.000Z",
    };

    const normalized = normalizeReusableBlocks([
      storedBlock,
      { ...storedBlock, id: "system", source: "system" },
      { id: "broken" },
    ]);

    expect(normalized).toHaveLength(1);
    expect(normalized[0].block.targetMode).toBe("range");
    expect(normalized[0].tags).toEqual([]);
  });
});
