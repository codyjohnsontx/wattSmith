import { describe, expect, it } from "vitest";
import { defaultWorkout } from "./defaultWorkout";
import {
  deriveDifficultyFromMetrics,
  deriveWorkoutDifficulty,
  difficultyRank,
  workoutDifficulties,
} from "./difficulty";

function metrics(intensityFactor: number, trainingStressScore = 0) {
  return { intensityFactor, trainingStressScore };
}

describe("workout difficulty", () => {
  it("buckets intensity factor at each boundary", () => {
    expect(deriveDifficultyFromMetrics(metrics(0.69))).toBe("easy");
    expect(deriveDifficultyFromMetrics(metrics(0.7))).toBe("moderate");
    expect(deriveDifficultyFromMetrics(metrics(0.84))).toBe("moderate");
    expect(deriveDifficultyFromMetrics(metrics(0.85))).toBe("hard");
    expect(deriveDifficultyFromMetrics(metrics(0.94))).toBe("hard");
    expect(deriveDifficultyFromMetrics(metrics(0.95))).toBe("very-hard");
  });

  it("escalates low-intensity workouts by training stress", () => {
    expect(deriveDifficultyFromMetrics(metrics(0.65, 44))).toBe("easy");
    expect(deriveDifficultyFromMetrics(metrics(0.65, 45))).toBe("moderate");
    expect(deriveDifficultyFromMetrics(metrics(0.65, 100))).toBe("hard");
    expect(deriveDifficultyFromMetrics(metrics(0.65, 140))).toBe("very-hard");
  });

  it("keeps the harder of the intensity and stress bands", () => {
    expect(deriveDifficultyFromMetrics(metrics(0.96, 10))).toBe("very-hard");
    expect(deriveDifficultyFromMetrics(metrics(0.72, 140))).toBe("very-hard");
  });

  it("treats zero metrics as easy", () => {
    expect(deriveDifficultyFromMetrics(metrics(0, 0))).toBe("easy");
  });

  it("derives a stable difficulty for the default workout", () => {
    const difficulty = deriveWorkoutDifficulty(defaultWorkout);

    expect(workoutDifficulties).toContain(difficulty);
    expect(deriveWorkoutDifficulty(defaultWorkout)).toBe(difficulty);
  });

  it("ranks difficulties in escalating order", () => {
    expect(difficultyRank("easy")).toBeLessThan(difficultyRank("moderate"));
    expect(difficultyRank("moderate")).toBeLessThan(difficultyRank("hard"));
    expect(difficultyRank("hard")).toBeLessThan(difficultyRank("very-hard"));
  });
});
