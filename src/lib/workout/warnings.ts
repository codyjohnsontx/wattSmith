import { formatDuration } from "./math";
import { calculateWorkoutSummary } from "./summary";
import type { AthleteProfile, Workout } from "./types";

export function getProfileWarnings(profile: AthleteProfile, workout: Workout): string[] {
  const summary = calculateWorkoutSummary(workout);
  const warnings: string[] = [];

  if (summary.totalDurationSeconds / 60 > profile.preferredWorkoutDurationMinutes) {
    warnings.push(
      `This workout is ${formatDuration(summary.totalDurationSeconds)}, longer than your preferred ${profile.preferredWorkoutDurationMinutes} minutes.`,
    );
  }

  const intensityDensity = summary.aboveThresholdSeconds / Math.max(1, summary.totalDurationSeconds);
  if (intensityDensity > 0.22 && profile.experienceLevel !== "elite") {
    warnings.push(
      "This workout has a high share of work above FTP. Consider reducing repeats when fatigued.",
    );
  }

  return warnings;
}
