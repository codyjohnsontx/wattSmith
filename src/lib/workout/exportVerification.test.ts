import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { collectWorkoutCues } from "./cues";
import { exportWorkoutToErg } from "./exportErg";
import { exportTestFixtures } from "./exportFixtures";
import { exportWorkoutToMrc, safeFileName } from "./exportMrc";
import { flattenWorkout } from "./flatten";
import { secondsToMinutes } from "./math";

// These tests replace the human "import the file into TrainerRoad and eyeball
// the chart" step with a deterministic check: parse the emitted [COURSE DATA]
// back into a timeline and prove it reproduces flattenWorkout() exactly, so the
// file a third-party app reads reconstructs the intended workout.

interface DataPoint {
  minutes: number;
  value: number;
}

interface TextEvent {
  atSeconds: number;
  text: string;
  durationSeconds: number;
}

function sectionLines(content: string, start: string, end: string): string[] {
  const lines = content.split("\n");
  const startIdx = lines.indexOf(start);
  const endIdx = lines.indexOf(end);
  if (startIdx === -1 || endIdx === -1) return [];
  return lines.slice(startIdx + 1, endIdx).filter((line) => line.trim().length > 0);
}

function parseCourseData(content: string): DataPoint[] {
  return sectionLines(content, "[COURSE DATA]", "[END COURSE DATA]").map((line) => {
    const [minutes, value] = line.split("\t");
    return { minutes: Number(minutes), value: Number(value) };
  });
}

function parseCourseText(content: string): TextEvent[] {
  return sectionLines(content, "[COURSE TEXT]", "[END COURSE TEXT]").map((line) => {
    const [atSeconds, text, durationSeconds] = line.split("\t");
    return { atSeconds: Number(atSeconds), text, durationSeconds: Number(durationSeconds) };
  });
}

describe("export round-trip verification", () => {
  for (const fixture of exportTestFixtures) {
    const segments = flattenWorkout(fixture, "midpoint");

    it(`MRC reproduces the ${fixture.id} timeline in %FTP`, () => {
      const points = parseCourseData(exportWorkoutToMrc(fixture, "midpoint"));
      expect(points, fixture.id).toHaveLength(segments.length * 2);

      segments.forEach((segment, index) => {
        expect(points[index * 2].minutes).toBeCloseTo(secondsToMinutes(segment.startSeconds), 3);
        expect(points[index * 2 + 1].minutes).toBeCloseTo(secondsToMinutes(segment.endSeconds), 3);
        expect(points[index * 2].value).toBe(Math.round(segment.startPercentFTP));
        expect(points[index * 2 + 1].value).toBe(Math.round(segment.endPercentFTP));
      });

      // Time axis is monotonic non-decreasing (no jumbled/overlapping segments).
      for (let i = 1; i < points.length; i += 1) {
        expect(points[i].minutes).toBeGreaterThanOrEqual(points[i - 1].minutes);
      }

      // Final timestamp equals the workout's total duration.
      const totalSeconds = segments.at(-1)?.endSeconds ?? 0;
      expect(points.at(-1)?.minutes).toBeCloseTo(secondsToMinutes(totalSeconds), 3);
    });

    it(`ERG reproduces the ${fixture.id} timeline in watts`, () => {
      const points = parseCourseData(exportWorkoutToErg(fixture, "midpoint"));
      expect(points, fixture.id).toHaveLength(segments.length * 2);

      segments.forEach((segment, index) => {
        expect(points[index * 2].minutes).toBeCloseTo(secondsToMinutes(segment.startSeconds), 3);
        expect(points[index * 2 + 1].minutes).toBeCloseTo(secondsToMinutes(segment.endSeconds), 3);
        expect(points[index * 2].value).toBe(segment.startWatts);
        expect(points[index * 2 + 1].value).toBe(segment.endWatts);
      });
    });
  }

  it("preserves ramp slopes instead of flattening them to steps", () => {
    const ramps = exportTestFixtures.find((fixture) => fixture.id === "fixture-ramps");
    expect(ramps).toBeDefined();

    const segments = flattenWorkout(ramps!, "midpoint");
    const rampIndex = segments.findIndex((segment) => segment.startWatts !== segment.endWatts);
    expect(rampIndex, "expected at least one sloped segment").toBeGreaterThanOrEqual(0);

    const points = parseCourseData(exportWorkoutToErg(ramps!, "midpoint"));
    expect(points[rampIndex * 2].value).not.toBe(points[rampIndex * 2 + 1].value);
  });

  it("expands repeat blocks into their full interval count", () => {
    const repeats = exportTestFixtures.find((fixture) => fixture.id === "fixture-repeats");
    expect(repeats).toBeDefined();

    const segments = flattenWorkout(repeats!, "midpoint");
    const points = parseCourseData(exportWorkoutToMrc(repeats!, "midpoint"));

    expect(points).toHaveLength(segments.length * 2);
    // The file carries more segments than top-level blocks: repeats really expanded.
    expect(segments.length).toBeGreaterThan(repeats!.blocks.length);
  });

  it("emits COURSE TEXT events matching the workout cues", () => {
    const cueFixture = exportTestFixtures.find((fixture) => fixture.id === "fixture-cues");
    expect(cueFixture).toBeDefined();

    const cues = collectWorkoutCues(cueFixture!);
    expect(cues.length).toBeGreaterThan(0);

    const events = parseCourseText(exportWorkoutToMrc(cueFixture!, "midpoint"));
    expect(events).toHaveLength(cues.length);

    cues.forEach((cue, index) => {
      expect(events[index].atSeconds).toBe(Math.round(cue.atSeconds));
      expect(events[index].text).toBe(cue.text.replace(/\s+/g, " ").trim());
      expect(events[index].durationSeconds).toBe(Math.max(1, Math.round(cue.durationSeconds)));
    });
  });
});

describe("committed export fixtures stay in sync with the exporters", () => {
  const fixturesDir = join(process.cwd(), "docs", "export-fixtures");
  const readFixture = (name: string) => readFileSync(join(fixturesDir, name.toLowerCase()), "utf8");

  for (const fixture of exportTestFixtures) {
    const baseName = safeFileName(fixture.name);

    if (fixture.id === "fixture-ranges") {
      for (const strategy of ["low", "midpoint", "high"] as const) {
        const strategyBaseName = `${baseName}_${strategy}`;

        it(`${strategyBaseName}.mrc matches current export output`, () => {
          expect(readFixture(`${strategyBaseName}.mrc`)).toBe(
            exportWorkoutToMrc(fixture, strategy, strategyBaseName),
          );
        });

        it(`${strategyBaseName}.erg matches current export output`, () => {
          expect(readFixture(`${strategyBaseName}.erg`)).toBe(
            exportWorkoutToErg(fixture, strategy, strategyBaseName),
          );
        });
      }
      continue;
    }

    it(`${baseName}.mrc matches current export output`, () => {
      expect(readFixture(`${baseName}.mrc`)).toBe(exportWorkoutToMrc(fixture));
    });

    it(`${baseName}.erg matches current export output`, () => {
      expect(readFixture(`${baseName}.erg`)).toBe(exportWorkoutToErg(fixture));
    });
  }
});
