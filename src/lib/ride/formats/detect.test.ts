// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { validateWorkout } from "@/lib/workout/validation";
import { domXmlParser } from "../importFile";
import { importWorkoutText } from "./detect";
import {
  exportFixtureDir,
  importError,
  importFixtureDir,
  importOk,
  importOptions,
  listFixtures,
  readFixture,
} from "./testUtils";
import { MAX_IMPORT_CHARS } from "./types";

const withXml = { parseXml: domXmlParser };
const zwo = readFixture(importFixtureDir, "zwo", "vo2_5x3.zwo");
const mrc = readFixture(exportFixtureDir, "fixture_steady_blocks.mrc");
const erg = readFixture(exportFixtureDir, "fixture_steady_blocks.erg");

describe("importWorkoutText format detection", () => {
  it("picks the parser from the extension", () => {
    expect(importOk(zwo, { ...withXml, fileName: "a.zwo" }).format).toBe("zwo");
    expect(importOk(mrc, { fileName: "a.mrc" }).format).toBe("mrc");
    expect(importOk(erg, { fileName: "a.ERG" }).format).toBe("erg");
  });

  it("sniffs misnamed files and warns", () => {
    const zwoAsErg = importOk(zwo, { ...withXml, fileName: "a.erg" });
    expect(zwoAsErg.format).toBe("zwo");
    expect(zwoAsErg.warnings[0]).toBe("The file is named .erg but contains a .zwo workout; read it as .zwo.");
    const ergAsZwo = importOk(erg, { ...withXml, fileName: "a.zwo" });
    expect(ergAsZwo.format).toBe("erg");
    expect(ergAsZwo.warnings[0]).toContain("named .zwo");
    expect(importOk(mrc, { fileName: "a.erg" }).warnings[0]).toContain("named .erg but contains a .mrc");
  });

  it("sniffs files with no or an unknown extension", () => {
    expect(importOk(zwo, { ...withXml, fileName: "download.txt" }).format).toBe("zwo");
    expect(importOk(mrc, { fileName: undefined }).format).toBe("mrc");
  });

  it.each([
    ["an empty file", "", "The file is empty."],
    ["whitespace", " \n\t ", "The file is empty."],
    ["an unknown format", "hello world", "does not look like a .zwo, .erg or .mrc"],
    ["an oversized file", "x".repeat(MAX_IMPORT_CHARS + 1), "too large"],
  ])("rejects %s", (_label, text, message) => {
    expect(importError(text, { fileName: "a.txt" })).toContain(message);
  });

  it("turns an unexpected parser failure into a readable error", () => {
    const result = importWorkoutText(zwo, importOptions({
      fileName: "a.zwo",
      parseXml: () => {
        throw new TypeError("boom");
      },
    }));
    expect(result).toEqual({ ok: false, error: "The file could not be read as a workout." });
  });
});

describe("hostile and damaged input never crashes the importer", () => {
  const sources = [
    ...listFixtures(exportFixtureDir, ".mrc").map((name) => readFixture(exportFixtureDir, name)),
    ...listFixtures(exportFixtureDir, ".erg").map((name) => readFixture(exportFixtureDir, name)),
    ...listFixtures(`${importFixtureDir}/zwo`, ".zwo").map((name) => readFixture(importFixtureDir, "zwo", name)),
  ];

  // Deterministic pseudo-random damage: truncation, byte flips and splices.
  let seed = 42;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    return seed / 2 ** 31;
  };
  const damage = (text: string): string => {
    const at = Math.floor(random() * text.length);
    const mode = Math.floor(random() * 3);
    if (mode === 0) return text.slice(0, at);
    if (mode === 1) return `${text.slice(0, at)}${String.fromCharCode(Math.floor(random() * 128))}${text.slice(at + 1)}`;
    return `${text.slice(0, at)}${text.slice(Math.floor(random() * text.length))}`;
  };

  it("returns a valid draft or an error for 1,500 damaged files", () => {
    for (let round = 0; round < 1500; round += 1) {
      const source = sources[round % sources.length];
      const text = damage(damage(source));
      const result = importWorkoutText(text, importOptions({ ...withXml, fileName: round % 2 ? "a.zwo" : "a.mrc" }));
      if (result.ok) {
        expect(validateWorkout(result.workout).filter((issue) => issue.severity === "error")).toEqual([]);
      } else {
        expect(result.error.length).toBeGreaterThan(0);
      }
    }
  });
});
