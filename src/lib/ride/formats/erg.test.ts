import { describe, expect, it } from "vitest";
import { collectWorkoutCues } from "@/lib/workout/cues";
import { exportWorkoutToErg } from "@/lib/workout/exportErg";
import { exportTestFixtures } from "@/lib/workout/exportFixtures";
import { exportWorkoutToMrc, safeFileName } from "@/lib/workout/exportMrc";
import { flattenWorkout } from "@/lib/workout/flatten";
import type { ExportRangeStrategy, Workout } from "@/lib/workout/types";
import { validateWorkout } from "@/lib/workout/validation";
import {
  exportFixtureDir,
  importError,
  importFixtureDir,
  importOk,
  listFixtures,
  readFixture,
} from "../importTestUtils";

// Every committed export fixture names the workout and range strategy it was
// generated from (see scripts/generateExportFixtures.ts).
function sourceOf(fileName: string): { workout: Workout; strategy: ExportRangeStrategy } {
  const base = fileName.replace(/\.(erg|mrc)$/, "");
  for (const workout of exportTestFixtures) {
    const name = safeFileName(workout.name).toLowerCase();
    if (base === name) return { workout, strategy: "midpoint" };
    for (const strategy of ["low", "midpoint", "high"] as const) {
      if (base === `${name}_${strategy}`) return { workout, strategy };
    }
  }
  throw new Error(`No export fixture matches ${fileName}`);
}

// The timeline a file encodes: .mrc rows carry whole %FTP, .erg rows watts.
function timeline(workout: Workout, units: "percent" | "watts", strategy: ExportRangeStrategy = "midpoint") {
  return flattenWorkout(workout, strategy).map((segment) => ({
    startSeconds: segment.startSeconds,
    endSeconds: segment.endSeconds,
    start: units === "percent" ? Math.round(segment.startPercentFTP) : segment.startWatts,
    end: units === "percent" ? Math.round(segment.endPercentFTP) : segment.endWatts,
  }));
}

function cueTimeline(workout: Workout) {
  return collectWorkoutCues(workout).map(({ atSeconds, text, durationSeconds }) => ({
    atSeconds,
    text: text.replace(/\s+/g, " ").trim(),
    durationSeconds,
  }));
}

function noErrors(workout: Workout) {
  return validateWorkout(workout).filter((issue) => issue.severity === "error");
}

describe("committed export fixtures round-trip through the importer", () => {
  const files = [...listFixtures(exportFixtureDir, ".mrc"), ...listFixtures(exportFixtureDir, ".erg")];

  it("covers every committed export fixture", () => {
    expect(files).toHaveLength(18);
  });

  it.each(files)("%s", (fileName) => {
    const { workout: source, strategy } = sourceOf(fileName);
    const text = readFixture(exportFixtureDir, fileName);
    const result = importOk(text, { fileName, fallbackFtp: source.ftp });
    const units = fileName.endsWith(".erg") ? "watts" : "percent";

    expect(result.format).toBe(fileName.endsWith(".erg") ? "erg" : "mrc");
    expect(result.warnings).toEqual([]);
    expect(noErrors(result.workout)).toEqual([]);
    expect(result.workout.ftp).toBe(source.ftp);
    expect(timeline(result.workout, units)).toEqual(timeline(source, units, strategy));
    expect(cueTimeline(result.workout)).toEqual(cueTimeline(source));
  });

  it("re-exports an imported file byte for byte", () => {
    for (const source of exportTestFixtures) {
      const mrc = exportWorkoutToMrc(source);
      const reimported = importOk(mrc, { fileName: "x.mrc", fallbackFtp: source.ftp }).workout;
      expect(exportWorkoutToMrc({ ...reimported, name: source.name, description: source.description })).toBe(mrc);
      const erg = exportWorkoutToErg(source);
      const fromErg = importOk(erg, { fileName: "x.erg" }).workout;
      expect(exportWorkoutToErg({ ...fromErg, name: source.name, description: source.description })).toBe(erg);
    }
  });
});

describe(".erg/.mrc importer", () => {
  it("labels warmup, recovery and cooldown blocks from their shape", () => {
    const { workout } = importOk(readFixture(exportFixtureDir, "fixture_repeats.mrc"), {
      fileName: "fixture_repeats.mrc",
    });
    const types = workout.blocks.map((block) => block.type);
    expect(types[0]).toBe("warmup");
    expect(types.at(-1)).toBe("cooldown");
    expect(types).toContain("recovery");
    expect(workout.name).toBe("fixture repeats");
  });

  it("reads a TrainerRoad-style .mrc with CRLF, comments, mixed columns and % suffixes", () => {
    const result = importOk(readFixture(importFixtureDir, "course", "threshold_3x10.mrc"), {
      fileName: "threshold_3x10.mrc",
    });
    expect(result.format).toBe("mrc");
    expect(result.warnings).toEqual([]);
    expect(result.workout.blocks).toHaveLength(7);
    expect(result.workout.blocks[0]).toMatchObject({
      type: "warmup",
      targetMode: "ramp",
      startPercentFTP: 50,
      endPercentFTP: 70,
      durationSeconds: 600,
    });
    expect(result.workout.blocks[1]).toMatchObject({ targetMode: "single", targetPercentFTP: 95 });
    expect(result.workout.blocks.at(-1)).toMatchObject({ type: "cooldown", startPercentFTP: 65, endPercentFTP: 40 });
    expect(result.workout.cues?.map((cue) => cue.atSeconds)).toEqual([600, 1500, 2400]);
    expect(result.workout.description).toContain("Threshold 3x10");
  });

  it("reads a GoldenCheetah-style .erg without END markers and shifts a late start", () => {
    const result = importOk(readFixture(importFixtureDir, "course", "endurance_goldencheetah.erg"), {
      fileName: "endurance_goldencheetah.erg",
    });
    expect(result.format).toBe("erg");
    expect(result.workout.ftp).toBe(250);
    expect(result.workout.blocks[0]).toMatchObject({ startPercentFTP: 50, endPercentFTP: 70, durationSeconds: 300 });
    expect(flattenWorkout(result.workout).at(-1)?.endSeconds).toBe(43 * 60);
    expect(result.workout.cues).toMatchObject([
      { atSeconds: 240, text: "Settle into endurance pace", durationSeconds: 10 },
      { atSeconds: 2100, text: "Opener one 10", durationSeconds: 10 },
      { atSeconds: 2250, text: "Opener two", durationSeconds: 10 },
    ]);
    expect(result.warnings).toEqual([
      expect.stringContaining("shifted to start at 0"),
      expect.stringContaining("Line 24: text event has no tab"),
      expect.stringContaining("Line 25: text event has no tab"),
      expect.stringContaining("Line 26: text event has no tab"),
    ]);
    expect(noErrors(result.workout)).toEqual([]);
  });

  const header = (units: string, extra = "") => `[COURSE HEADER]\n${extra}${units}\n[END COURSE HEADER]\n`;

  it.each([
    ["600 Interval 2", "Interval 2"],
    ["900 Rep 3 of 5", "Rep 3 of 5"],
  ])("keeps trailing numbers as text in the tabless text row %j", (row, text) => {
    const result = importOk(`${header("MINUTES PERCENT")}[COURSE DATA]\n0 50\n20 50\n[COURSE TEXT]\n${row}\n`, {
      fileName: "a.mrc",
    });
    expect(result.workout.cues).toMatchObject([{ atSeconds: Number(row.split(" ")[0]), text, durationSeconds: 10 }]);
    expect(result.warnings).toEqual([expect.stringContaining("text event has no tab between its columns")]);
  });

  it("still reads the duration column of a tab separated text row", () => {
    const result = importOk(`${header("MINUTES PERCENT")}[COURSE DATA]\n0 50\n20 50\n[COURSE TEXT]\n600\tRep 3 of 5\t15\n`, {
      fileName: "a.mrc",
    });
    expect(result.workout.cues).toMatchObject([{ atSeconds: 600, text: "Rep 3 of 5", durationSeconds: 15 }]);
    expect(result.warnings).toEqual([]);
  });

  it("scales a watt file with no FTP by the rider's FTP and says so", () => {
    const result = importOk(`${header("MINUTES WATTS")}[COURSE DATA]\n0 150\n10 150\n[END COURSE DATA]\n`, {
      fileName: "a.erg",
      fallbackFtp: 300,
    });
    expect(result.workout.ftp).toBe(300);
    expect(result.workout.blocks[0]).toMatchObject({ targetPercentFTP: 50 });
    expect(result.warnings[0]).toContain("no FTP; scaled using your FTP of 300 W");
  });

  it("falls back to the extension for units and warns", () => {
    const text = "[COURSE HEADER]\nFTP = 200\n[END COURSE HEADER]\n[COURSE DATA]\n0 100\n5 100\n[END COURSE DATA]\n";
    const asErg = importOk(text, { fileName: "a.erg" });
    expect(asErg.workout.blocks[0]).toMatchObject({ targetPercentFTP: 50 });
    expect(asErg.warnings[0]).toContain("no unit line");
    const asMrc = importOk(text, { fileName: "a.mrc" });
    expect(asMrc.workout.blocks[0]).toMatchObject({ targetPercentFTP: 100 });
  });

  it("reads MINUTES FTP, a BOM and lowercase section names", () => {
    const result = importOk(`﻿[course header]\nMINUTES FTP\n[course data]\n0 60\n5 60\n5 80\n10 80\n`, {
      fileName: "a.mrc",
    });
    expect(result.workout.blocks.map((block) => block.targetPercentFTP)).toEqual([60, 80]);
  });

  it("ignores stray bare header lines", () => {
    const result = importOk(`${header("MINUTES PERCENT", "GENERATED BY\n")}[COURSE DATA]\n0 50\n5 50\n`, { fileName: "a.mrc" });
    expect(result.workout.blocks).toHaveLength(1);
  });

  it("keeps the last of several rows at one minute and warns", () => {
    const result = importOk(`${header("MINUTES PERCENT")}[COURSE DATA]\n0 50\n5 50\n5 70\n5 90\n10 90\n`, {
      fileName: "a.mrc",
    });
    expect(result.workout.blocks.map((block) => block.targetPercentFTP)).toEqual([50, 90]);
    expect(result.warnings.join(" ")).toContain("middle row was ignored");
  });

  it("drops a trailing unpaired row and warns", () => {
    const result = importOk(`${header("MINUTES PERCENT")}[COURSE DATA]\n0 50\n5 50\n5 90\n`, { fileName: "a.mrc" });
    expect(result.workout.blocks).toHaveLength(1);
    expect(result.warnings.join(" ")).toContain("no end time");
  });

  it("warns about absurd targets but keeps them", () => {
    const result = importOk(`${header("MINUTES PERCENT")}[COURSE DATA]\n0 350\n1 350\n`, { fileName: "a.mrc" });
    expect(result.workout.blocks[0]).toMatchObject({ targetPercentFTP: 350 });
    expect(result.warnings.join(" ")).toContain("unusually high");
  });

  it("warns about workouts longer than 8 hours", () => {
    const result = importOk(`${header("MINUTES PERCENT")}[COURSE DATA]\n0 50\n600 50\n`, { fileName: "a.mrc" });
    expect(result.warnings.join(" ")).toContain("longer than 8 hours");
  });

  it.each([
    ["no data section", `${header("MINUTES PERCENT")}`, "No [COURSE DATA]"],
    ["a single row", `${header("MINUTES PERCENT")}[COURSE DATA]\n0 50\n`, "at least two rows"],
    ["time going backwards", `${header("MINUTES PERCENT")}[COURSE DATA]\n0 50\n5 50\n4 60\n`, "Line 7: time goes backwards"],
    ["a non-numeric row", `${header("MINUTES PERCENT")}[COURSE DATA]\n0 50\nfive 50\n`, "Line 6: expected"],
    ["a third column ramp shorthand", `${header("MINUTES PERCENT")}[COURSE DATA]\n5 40 70\n`, "Line 5: \"5 40 70\" has more than two columns"],
    ["a distance course", `${header("KM WATTS")}[COURSE DATA]\n0 50\n5 50\n`, "distance-based"],
    ["negative targets", `${header("MINUTES PERCENT")}[COURSE DATA]\n0 -5\n5 -5\n`, "negative target"],
    ["a day-long file", `${header("MINUTES PERCENT")}[COURSE DATA]\n0 50\n1500 50\n`, "longer than 24 hours"],
    ["only jumps", `${header("MINUTES PERCENT")}[COURSE DATA]\n0 50\n0 60\n`, "no workout blocks"],
  ])("rejects %s with a readable error", (_label, text, message) => {
    expect(importError(text, { fileName: "bad.mrc" })).toContain(message);
  });
});
