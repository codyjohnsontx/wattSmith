import { describe, expect, it } from "vitest";
import { exportWorkoutToErg } from "./exportErg";
import { exportTestFixtures } from "./exportFixtures";
import { exportWorkoutToMrc, safeFileName } from "./exportMrc";
import { buildExportReadinessChecklist } from "./exportReadiness";
import { calculateWorkoutSummary } from "./summary";
import { validateWorkout } from "./validation";

function readiness(workout: (typeof exportTestFixtures)[number]) {
  return buildExportReadinessChecklist({
    workout,
    rangeStrategy: "midpoint",
    validationIssues: validateWorkout(workout),
    summary: calculateWorkoutSummary(workout),
    mrc: exportWorkoutToMrc(workout),
    erg: exportWorkoutToErg(workout),
  });
}

describe("export test fixtures", () => {
  it("has no validation errors in any fixture", () => {
    for (const fixture of exportTestFixtures) {
      const errors = validateWorkout(fixture).filter((issue) => issue.severity === "error");
      expect(errors, fixture.id).toEqual([]);
    }
  });

  it("passes export readiness without blocking issues", () => {
    for (const fixture of exportTestFixtures) {
      const blocked = readiness(fixture).filter((item) => item.status === "error");
      expect(blocked, fixture.id).toEqual([]);
    }
  });

  it("keeps the long ride fixture on the timeline warning path", () => {
    const longRide = exportTestFixtures.find((fixture) => fixture.id === "fixture-long");
    expect(longRide).toBeDefined();

    const timeline = readiness(longRide!).find((item) => item.id === "timeline");
    expect(timeline?.status).toBe("warn");
  });

  it("produces well-formed MRC and ERG output for every fixture", () => {
    for (const fixture of exportTestFixtures) {
      for (const output of [exportWorkoutToMrc(fixture), exportWorkoutToErg(fixture)]) {
        expect(output, fixture.id).toContain("[COURSE HEADER]");
        expect(output, fixture.id).toContain("[COURSE DATA]");
        expect(output, fixture.id).toContain("[END COURSE DATA]");
      }
    }
  });

  it("emits COURSE TEXT events for the cue fixture", () => {
    const cueFixture = exportTestFixtures.find((fixture) => fixture.id === "fixture-cues");
    expect(cueFixture).toBeDefined();

    const mrc = exportWorkoutToMrc(cueFixture!);
    expect(mrc).toContain("[COURSE TEXT]");
    expect(mrc).toContain("Halfway there");
  });

  it("exports different range fixture data under low and high strategies", () => {
    const rangeFixture = exportTestFixtures.find((fixture) => fixture.id === "fixture-ranges");
    expect(rangeFixture).toBeDefined();

    expect(exportWorkoutToMrc(rangeFixture!, "low")).not.toBe(
      exportWorkoutToMrc(rangeFixture!, "high"),
    );
    expect(exportWorkoutToMrc(rangeFixture!, "low")).toContain("0.000\t88");
    expect(exportWorkoutToMrc(rangeFixture!, "high")).toContain("0.000\t94");
  });

  it("sanitizes the special-character fixture name into a usable filename", () => {
    const specialFixture = exportTestFixtures.find(
      (fixture) => fixture.id === "fixture-special-name",
    );
    expect(specialFixture).toBeDefined();

    const sanitized = safeFileName(specialFixture!.name);
    expect(sanitized.length).toBeGreaterThan(0);
    expect(sanitized).not.toMatch(/[^\w-]/);
  });

  it("gives every fixture a unique id and name", () => {
    expect(new Set(exportTestFixtures.map((fixture) => fixture.id)).size).toBe(
      exportTestFixtures.length,
    );
    expect(new Set(exportTestFixtures.map((fixture) => safeFileName(fixture.name))).size).toBe(
      exportTestFixtures.length,
    );
  });
});
