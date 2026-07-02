import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { exportWorkoutToErg } from "../src/lib/workout/exportErg";
import { exportTestFixtures } from "../src/lib/workout/exportFixtures";
import { exportWorkoutToMrc, safeFileName } from "../src/lib/workout/exportMrc";
import type { ExportRangeStrategy } from "../src/lib/workout/types";

const outputDir = join(process.cwd(), "docs", "export-fixtures");
const rangeStrategies: ExportRangeStrategy[] = ["low", "midpoint", "high"];

mkdirSync(outputDir, { recursive: true });

let fileCount = 0;

function writeFixtureFile(baseName: string, extension: "mrc" | "erg", contents: string) {
  const fileName = `${baseName}.${extension}`.toLowerCase();
  writeFileSync(join(outputDir, fileName), contents);
  fileCount += 1;
  console.log(`  ${fileName}`);
}

console.log(`Writing export fixtures to ${outputDir}`);

for (const fixture of exportTestFixtures) {
  const baseName = safeFileName(fixture.name);

  if (fixture.id === "fixture-ranges") {
    for (const strategy of rangeStrategies) {
      writeFixtureFile(`${baseName}_${strategy}`, "mrc", exportWorkoutToMrc(fixture, strategy));
      writeFixtureFile(`${baseName}_${strategy}`, "erg", exportWorkoutToErg(fixture, strategy));
    }
    continue;
  }

  writeFixtureFile(baseName, "mrc", exportWorkoutToMrc(fixture));
  writeFixtureFile(baseName, "erg", exportWorkoutToErg(fixture));
}

console.log(`Done: ${fileCount} files.`);
