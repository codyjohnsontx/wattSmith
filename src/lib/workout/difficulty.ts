import { calculateWorkoutSummary } from "./summary";
import type { Workout, WorkoutSummary } from "./types";

export type WorkoutDifficulty = "easy" | "moderate" | "hard" | "very-hard";

export const workoutDifficulties: WorkoutDifficulty[] = [
  "easy",
  "moderate",
  "hard",
  "very-hard",
];

export const difficultyLabels: Record<WorkoutDifficulty, string> = {
  easy: "Easy",
  moderate: "Moderate",
  hard: "Hard",
  "very-hard": "Very hard",
};

// A workout is rated by the harder of its intensity band (IF) and its total
// stress band (TSS), so long low-intensity rides and short high-intensity
// sessions both land where a coach would expect.
const difficultyBands: { level: WorkoutDifficulty; maxIf: number; maxTss: number }[] = [
  { level: "easy", maxIf: 0.7, maxTss: 45 },
  { level: "moderate", maxIf: 0.85, maxTss: 90 },
  { level: "hard", maxIf: 0.95, maxTss: 135 },
  { level: "very-hard", maxIf: Infinity, maxTss: Infinity },
];

export function difficultyRank(difficulty: WorkoutDifficulty): number {
  return workoutDifficulties.indexOf(difficulty);
}

export function deriveDifficultyFromMetrics(
  metrics: Pick<WorkoutSummary, "intensityFactor" | "trainingStressScore">,
): WorkoutDifficulty {
  const intensityBand = difficultyBands.findIndex(
    (band) => metrics.intensityFactor < band.maxIf,
  );
  const stressBand = difficultyBands.findIndex(
    (band) => metrics.trainingStressScore < band.maxTss,
  );

  return difficultyBands[Math.max(intensityBand, stressBand)].level;
}

export function deriveWorkoutDifficulty(workout: Workout): WorkoutDifficulty {
  return deriveDifficultyFromMetrics(calculateWorkoutSummary(workout));
}
