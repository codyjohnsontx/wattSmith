import { flattenWorkout } from "./flatten";
import { secondsToMinutes } from "./math";
import type { Workout } from "./types";

export function safeFileName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_");
}

export function exportWorkoutToMrc(workout: Workout): string {
  const segments = flattenWorkout(workout);
  const fileName = `${safeFileName(workout.name) || "wattsmith_workout"}.mrc`;
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
    lines.push(`${secondsToMinutes(segment.startSeconds).toFixed(3)} ${Math.round(segment.startPercentFTP)}`);
    lines.push(`${secondsToMinutes(segment.endSeconds).toFixed(3)} ${Math.round(segment.endPercentFTP)}`);
  }

  lines.push("[END COURSE DATA]");

  return `${lines.join("\n")}\n`;
}
