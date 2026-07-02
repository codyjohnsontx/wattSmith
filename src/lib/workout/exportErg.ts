import { flattenWorkout } from "./flatten";
import { secondsToMinutes } from "./math";
import { collectWorkoutCues } from "./cues";
import { resolveExportBaseFileName } from "./exportMrc";
import type { ExportRangeStrategy, Workout } from "./types";

export function exportWorkoutToErg(
  workout: Workout,
  rangeStrategy: ExportRangeStrategy = "midpoint",
  baseFileName?: string,
): string {
  const segments = flattenWorkout(workout, rangeStrategy);
  const cues = collectWorkoutCues(workout);
  const fileName = `${resolveExportBaseFileName(workout, baseFileName)}.erg`.toLowerCase();
  const lines = [
    "[COURSE HEADER]",
    "VERSION = 2",
    "UNITS = ENGLISH",
    `DESCRIPTION = ${workout.description || workout.name}`,
    `FILE NAME = ${fileName}`,
    `FTP = ${workout.ftp}`,
    "MINUTES\tWATTS",
    "[END COURSE HEADER]",
    "[COURSE DATA]",
  ];

  for (const segment of segments) {
    lines.push(`${secondsToMinutes(segment.startSeconds).toFixed(3)}\t${segment.startWatts}`);
    lines.push(`${secondsToMinutes(segment.endSeconds).toFixed(3)}\t${segment.endWatts}`);
  }

  lines.push("[END COURSE DATA]");

  if (cues.length > 0) {
    lines.push("[COURSE TEXT]");
    for (const cue of cues) {
      lines.push(
        `${Math.round(cue.atSeconds)}\t${cue.text.replace(/\s+/g, " ").trim()}\t${Math.max(1, Math.round(cue.durationSeconds))}`,
      );
    }
    lines.push("[END COURSE TEXT]");
  }

  return `${lines.join("\n")}\n`;
}
