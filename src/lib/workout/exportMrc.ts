import { flattenWorkout } from "./flatten";
import { secondsToMinutes } from "./math";
import { collectWorkoutCues } from "./cues";
import type { ExportRangeStrategy, Workout } from "./types";

export function safeFileName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_");
}

export function exportWorkoutToMrc(
  workout: Workout,
  rangeStrategy: ExportRangeStrategy = "midpoint",
): string {
  const segments = flattenWorkout(workout, rangeStrategy);
  const cues = collectWorkoutCues(workout);
  const fileName = `${safeFileName(workout.name) || "wattsmith_workout"}.mrc`.toLowerCase();
  const lines = [
    "[COURSE HEADER]",
    "VERSION = 2",
    "UNITS = ENGLISH",
    `DESCRIPTION = ${workout.description || workout.name}`,
    `FILE NAME = ${fileName}`,
    "MINUTES PERCENT",
    "[END COURSE HEADER]",
    "[COURSE DATA]",
  ];

  for (const segment of segments) {
    lines.push(
      `${secondsToMinutes(segment.startSeconds).toFixed(3)}\t${Math.round(segment.startPercentFTP)}`,
    );
    lines.push(
      `${secondsToMinutes(segment.endSeconds).toFixed(3)}\t${Math.round(segment.endPercentFTP)}`,
    );
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
