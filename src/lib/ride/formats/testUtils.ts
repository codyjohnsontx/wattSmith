import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { importWorkoutText } from "./detect";
import type { ImportOptions, ImportResult } from "./types";

export const exportFixtureDir = join(process.cwd(), "docs", "export-fixtures");
export const importFixtureDir = join(process.cwd(), "docs", "import-fixtures");

export function listFixtures(dir: string, extension: string): string[] {
  return readdirSync(dir).filter((name) => name.endsWith(extension)).sort();
}

export function readFixture(...parts: string[]): string {
  return readFileSync(join(...parts), "utf8");
}

export function importOptions(overrides: Partial<ImportOptions> = {}): ImportOptions {
  return {
    fallbackFtp: 200,
    workoutId: "imported-workout",
    now: "2026-09-26T00:00:00.000Z",
    ...overrides,
  };
}

export function importOk(text: string, overrides: Partial<ImportOptions> = {}) {
  const result: ImportResult = importWorkoutText(text, importOptions(overrides));
  if (!result.ok) throw new Error(`expected import to succeed: ${result.error}`);
  return result;
}

export function importError(text: string, overrides: Partial<ImportOptions> = {}): string {
  const result = importWorkoutText(text, importOptions(overrides));
  if (result.ok) throw new Error("expected import to fail");
  return result.error;
}
