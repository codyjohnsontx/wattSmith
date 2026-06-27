import { describe, expect, it } from "vitest";
import { scienceNotes } from "../science/notes";
import { getScienceSource } from "../science/sources";
import { defaultWorkout } from "./defaultWorkout";
import { createBlockFromTemplate, moveItem } from "./editor";
import { exportWorkoutToErg } from "./exportErg";
import { exportWorkoutToMrc } from "./exportMrc";
import {
  buildExportReadinessChecklist,
  type ExportReadinessItem,
} from "./exportReadiness";
import { flattenWorkout } from "./flatten";
import { percentToWatts } from "./math";
import { calculateWorkoutSummary } from "./summary";
import { defaultProfile } from "./storage";
import { validateWorkout } from "./validation";
import { getProfileWarnings } from "./warnings";
import type { ExportRangeStrategy, Workout } from "./types";

function buildChecklist(
  workout: Workout,
  rangeStrategy: ExportRangeStrategy = "midpoint",
  overrides: Partial<{ mrc: string; erg: string }> = {},
): ExportReadinessItem[] {
  return buildExportReadinessChecklist({
    workout,
    rangeStrategy,
    validationIssues: validateWorkout(workout),
    summary: calculateWorkoutSummary(workout),
    mrc: overrides.mrc ?? exportWorkoutToMrc(workout, rangeStrategy),
    erg: overrides.erg ?? exportWorkoutToErg(workout, rangeStrategy),
  });
}

function readinessItem(items: ExportReadinessItem[], id: string): ExportReadinessItem {
  const item = items.find((candidate) => candidate.id === id);
  expect(item).toBeDefined();
  return item as ExportReadinessItem;
}

describe("workout helpers", () => {
  it("calculates watts from FTP percentages", () => {
    expect(percentToWatts(164, 120)).toBe(197);
    expect(percentToWatts(164, 50)).toBe(82);
    expect(percentToWatts(200, 120)).toBe(240);
  });

  it("flattens nested repeat blocks chronologically", () => {
    const segments = flattenWorkout(defaultWorkout);
    const summary = calculateWorkoutSummary(defaultWorkout);

    expect(segments.filter((segment) => segment.label === "30 sec VO2 on")).toHaveLength(18);
    expect(segments.filter((segment) => segment.label === "15 sec float")).toHaveLength(18);
    expect(summary.totalDurationSeconds).toBe(43.5 * 60);
  });

  it("calculates zone and load-style metrics", () => {
    const summary = calculateWorkoutSummary(defaultWorkout);

    expect(summary.zones.find((zone) => zone.id === "vo2")?.seconds).toBe(9 * 60);
    expect(summary.intensityFactor).toBeGreaterThan(0);
    expect(summary.trainingStressScore).toBeGreaterThan(0);
    expect(summary.normalizedPowerEstimate).toBeGreaterThan(summary.averageWatts);
  });

  it("exports MRC as percentages and ERG as watts", () => {
    const workout = { ...defaultWorkout, ftp: 200 };
    const mrc = exportWorkoutToMrc(workout);
    const erg = exportWorkoutToErg(workout);

    expect(mrc).toContain("MINUTES PERCENT");
    expect(mrc).toContain("12.000\t120");
    expect(mrc).toContain("12.500\t50");
    expect(erg).toContain("FTP = 200");
    expect(erg).toContain("12.000\t240");
    expect(erg).toContain("12.500\t100");
  });

  it("exports range targets using the selected strategy", () => {
    const workout: Workout = {
      ...defaultWorkout,
      blocks: [
        {
          id: "range",
          type: "steady",
          label: "Range",
          targetMode: "range",
          durationSeconds: 60,
          minPercentFTP: 80,
          maxPercentFTP: 90,
        },
      ],
    };

    expect(exportWorkoutToMrc(workout, "low")).toContain("0.000\t80");
    expect(exportWorkoutToMrc(workout, "midpoint")).toContain("0.000\t85");
    expect(exportWorkoutToMrc(workout, "high")).toContain("0.000\t90");
  });

  it("marks the default workout as export-ready", () => {
    const checklist = buildChecklist(defaultWorkout);

    expect(checklist.some((item) => item.status === "error")).toBe(false);
    for (const id of ["validation", "ftp", "timeline", "targets", "preview", "filename"]) {
      expect(readinessItem(checklist, id).status).toBe("pass");
    }
    expect(readinessItem(checklist, "range-strategy").status).toBe("pass");
  });

  it("surfaces validation errors as blocked checklist details", () => {
    const workout = { ...defaultWorkout, name: "" };
    const checklist = buildChecklist(workout);
    const validation = readinessItem(checklist, "validation");

    expect(validation.status).toBe("error");
    expect(validation.details).toContain("Workout needs a name.");
  });

  it("keeps validation warnings review-only", () => {
    const workout: Workout = {
      ...defaultWorkout,
      blocks: [{ ...defaultWorkout.blocks[0], id: "blank-label", label: "" }],
    };
    const checklist = buildChecklist(workout);

    expect(readinessItem(checklist, "validation").status).toBe("warn");
    expect(checklist.some((item) => item.status === "error")).toBe(false);
  });

  it("creates an FTP readiness error when FTP is invalid", () => {
    const checklist = buildChecklist({ ...defaultWorkout, ftp: 0 });

    expect(readinessItem(checklist, "ftp").status).toBe("error");
  });

  it("creates a timeline warning for workouts over four hours", () => {
    const workout: Workout = {
      ...defaultWorkout,
      blocks: [
        {
          id: "long",
          type: "steady",
          label: "Long endurance",
          targetMode: "single",
          durationSeconds: 4 * 60 * 60 + 60,
          targetPercentFTP: 65,
        },
      ],
    };
    const checklist = buildChecklist(workout);

    expect(readinessItem(checklist, "timeline").status).toBe("warn");
  });

  it("creates a target warning for targets over 200 percent FTP", () => {
    const workout: Workout = {
      ...defaultWorkout,
      blocks: [
        {
          id: "high-target",
          type: "steady",
          label: "Hard surge",
          targetMode: "single",
          durationSeconds: 60,
          targetPercentFTP: 225,
        },
      ],
    };
    const checklist = buildChecklist(workout);

    expect(readinessItem(checklist, "targets").status).toBe("warn");
  });

  it("updates the range strategy readiness message", () => {
    const workout: Workout = {
      ...defaultWorkout,
      blocks: [
        {
          id: "range",
          type: "steady",
          label: "Range",
          targetMode: "range",
          durationSeconds: 60,
          minPercentFTP: 80,
          maxPercentFTP: 90,
        },
      ],
    };

    for (const strategy of ["low", "midpoint", "high"] as const) {
      expect(readinessItem(buildChecklist(workout, strategy), "range-strategy").message).toContain(
        strategy,
      );
    }
  });

  it("creates a preview readiness error when a preview is malformed", () => {
    const checklist = buildChecklist(defaultWorkout, "midpoint", { mrc: "" });

    expect(readinessItem(checklist, "preview").status).toBe("error");
  });

  it("rejects invalid block durations and repeat counts", () => {
    const zeroDurationWorkout = {
      ...defaultWorkout,
      blocks: [{ ...createBlockFromTemplate("steady"), durationSeconds: 0 }],
    };
    const fractionalRepeatWorkout = {
      ...defaultWorkout,
      blocks: [{ ...defaultWorkout.blocks[1], repeatCount: 2.5 }],
    };

    expect(validateWorkout(zeroDurationWorkout).some((issue) => issue.severity === "error")).toBe(
      true,
    );
    expect(
      validateWorkout(fractionalRepeatWorkout).some((issue) => issue.severity === "error"),
    ).toBe(true);
  });

  it("leaves workout-level validation issues without a step id", () => {
    const issues = validateWorkout({ ...defaultWorkout, name: "", blocks: [] });

    expect(issues.find((issue) => issue.id === "workout-name")?.stepId).toBeUndefined();
    expect(issues.find((issue) => issue.id === "workout-blocks")?.stepId).toBeUndefined();
  });

  it("groups step-level validation issues by step id", () => {
    const issues = validateWorkout({
      ...defaultWorkout,
      blocks: [{ ...createBlockFromTemplate("steady"), id: "invalid-step", durationSeconds: 0 }],
    });

    expect(issues.find((issue) => issue.id === "invalid-step-duration")?.stepId).toBe(
      "invalid-step",
    );
  });

  it("surfaces repeat child validation issues with the child step id", () => {
    const repeat = defaultWorkout.blocks.find((block) => block.id === "set-1");
    if (!repeat?.children?.[0]) {
      throw new Error("Expected set-1 to include a child interval.");
    }

    const child = repeat.children[0];
    const issues = validateWorkout({
      ...defaultWorkout,
      blocks: [
        {
          ...repeat,
          children: [{ ...child, durationSeconds: 0 }],
        },
      ],
    });

    expect(issues.find((issue) => issue.id === `${child.id}-duration`)?.stepId).toBe(child.id);
  });

  it("moves blocks without losing items", () => {
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
  });

  it("resolves every science note source id", () => {
    for (const note of scienceNotes) {
      expect(note.sourceIds.length).toBeGreaterThan(0);
      for (const sourceId of note.sourceIds) {
        expect(getScienceSource(sourceId), sourceId).toBeTruthy();
      }
    }
  });

  it("warns when a workout exceeds the preferred profile duration", () => {
    const warnings = getProfileWarnings(
      { ...defaultProfile, preferredWorkoutDurationMinutes: 30 },
      defaultWorkout,
    );

    expect(warnings.some((warning) => warning.includes("longer than your preferred 30 minutes"))).toBe(
      true,
    );
  });

  it("warns when a non-elite profile has high above-FTP density", () => {
    const workout: Workout = {
      ...defaultWorkout,
      blocks: [
        {
          id: "high",
          type: "steady",
          label: "Hard work",
          targetMode: "single",
          durationSeconds: 4 * 60,
          targetPercentFTP: 120,
        },
        {
          id: "recovery",
          type: "recovery",
          label: "Recovery",
          targetMode: "single",
          durationSeconds: 8 * 60,
          targetPercentFTP: 50,
        },
      ],
    };

    const warnings = getProfileWarnings(
      { ...defaultProfile, experienceLevel: "serious", preferredWorkoutDurationMinutes: 90 },
      workout,
    );

    expect(warnings).toContain(
      "This workout has a high share of work above FTP. Consider reducing repeats when fatigued.",
    );
  });

  it("does not warn elite profiles for high above-FTP density", () => {
    const workout: Workout = {
      ...defaultWorkout,
      blocks: [
        {
          id: "high",
          type: "steady",
          label: "Hard work",
          targetMode: "single",
          durationSeconds: 4 * 60,
          targetPercentFTP: 120,
        },
        {
          id: "recovery",
          type: "recovery",
          label: "Recovery",
          targetMode: "single",
          durationSeconds: 8 * 60,
          targetPercentFTP: 50,
        },
      ],
    };

    const warnings = getProfileWarnings(
      { ...defaultProfile, experienceLevel: "elite", preferredWorkoutDurationMinutes: 90 },
      workout,
    );

    expect(warnings).not.toContain(
      "This workout has a high share of work above FTP. Consider reducing repeats when fatigued.",
    );
  });
});
