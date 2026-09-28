import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { encodeRideFit } from "../src/lib/ride/formats/fit/encoder";
import { rideFitFileName } from "../src/lib/ride/formats/fit/fileName";
import { FIT_FIXTURE_WORKOUT_NAME, recordFitFixtureRide } from "../src/lib/ride/fitTestUtils";

const outputDir = join(process.cwd(), "docs", "ride-fixtures");

async function main() {
  const input = await recordFitFixtureRide();
  const fileName = rideFitFileName(FIT_FIXTURE_WORKOUT_NAME, input.startMs, input.utcOffsetMinutes);
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(join(outputDir, fileName), encodeRideFit(input));
  console.log(`Wrote ${join(outputDir, fileName)}`);
}

void main();
