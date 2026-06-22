import { flattenWorkout } from "./flatten";
import { secondsToMinutes } from "./math";
import { safeFileName } from "./exportMrc";
import type { Workout } from "./types";

export function exportWorkoutToErg(workout: Workout): string {
  const segments = flattenWorkout(workout);
  const fileName = `${safeFileName(workout.name) || "wattsmith_workout"}.erg`;
  const lines = [
    "[COURSE HEADER]",
    "VERSION = 2",
    "UNITS = ENGLISH",
    `DESCRIPTION = ${workout.description || workout.name}`,
    `FILE NAME = ${fileName}`,
    "MINUTES WATTS",
    "[END COURSE HEADER]",
    "[COURSE DATA]",
  ];

  for (const segment of segments) {
    lines.push(`${secondsToMinutes(segment.startSeconds).toFixed(3)} ${segment.startWatts}`);
    lines.push(`${secondsToMinutes(segment.endSeconds).toFixed(3)} ${segment.endWatts}`);
  }

  lines.push("[END COURSE DATA]");

  return `${lines.join("\n")}\n`;
}
