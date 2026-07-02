import { describe, expect, it } from "vitest";
import { defaultWorkout } from "./defaultWorkout";
import { duplicateWorkout } from "./editor";
import { normalizeWorkouts, toggleFavoriteInList } from "./storage";
import type { Workout } from "./types";

function savedWorkout(overrides: Partial<Workout> = {}): Workout {
  return {
    ...structuredClone(defaultWorkout),
    id: "workout-1",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-15T00:00:00.000Z",
    ...overrides,
  };
}

describe("workout storage", () => {
  it("defaults missing or malformed favorite flags to false", () => {
    const [missing] = normalizeWorkouts([savedWorkout()]);
    const [garbage] = normalizeWorkouts([
      { ...savedWorkout(), favorite: "yes" as unknown as boolean },
    ]);

    expect(missing.favorite).toBe(false);
    expect(garbage.favorite).toBe(false);
  });

  it("preserves favorite true through normalization", () => {
    const [workout] = normalizeWorkouts([savedWorkout({ favorite: true })]);

    expect(workout.favorite).toBe(true);
  });

  it("drops malformed workouts while keeping valid ones", () => {
    const normalized = normalizeWorkouts([savedWorkout(), { id: "broken" }]);

    expect(normalized).toHaveLength(1);
    expect(normalized[0].id).toBe("workout-1");
  });

  it("toggles favorite without touching updatedAt or other workouts", () => {
    const workouts = [savedWorkout(), savedWorkout({ id: "workout-2", favorite: true })];
    const next = toggleFavoriteInList(workouts, "workout-1");

    expect(next[0].favorite).toBe(true);
    expect(next[0].updatedAt).toBe(workouts[0].updatedAt);
    expect(next[1]).toBe(workouts[1]);

    const reverted = toggleFavoriteInList(next, "workout-1");
    expect(reverted[0].favorite).toBe(false);
  });

  it("leaves the list unchanged when toggling an unknown id", () => {
    const workouts = [savedWorkout()];
    const next = toggleFavoriteInList(workouts, "missing");

    expect(next).toEqual(workouts);
    expect(workouts[0].favorite).toBeUndefined();
  });

  it("resets favorite on duplicated workouts", () => {
    const copy = duplicateWorkout(savedWorkout({ favorite: true }));

    expect(copy.favorite).toBe(false);
    expect(copy.name).toContain("copy");
  });
});
