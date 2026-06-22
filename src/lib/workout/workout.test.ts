import { describe, expect, it } from "vitest";
import { scienceNotes } from "../science/notes";
import { getScienceSource } from "../science/sources";
import { defaultWorkout } from "./defaultWorkout";
import { createBlockFromTemplate, moveItem } from "./editor";
import { exportWorkoutToErg } from "./exportErg";
import { exportWorkoutToMrc } from "./exportMrc";
import { flattenWorkout } from "./flatten";
import { percentToWatts } from "./math";
import { calculateWorkoutSummary } from "./summary";
import { validateWorkout } from "./validation";
import type { Workout } from "./types";

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

  it("rejects invalid zero-duration blocks", () => {
    const workout = {
      ...defaultWorkout,
      blocks: [{ ...createBlockFromTemplate("steady"), durationSeconds: 0 }],
    };

    expect(validateWorkout(workout).some((issue) => issue.severity === "error")).toBe(true);
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
});
