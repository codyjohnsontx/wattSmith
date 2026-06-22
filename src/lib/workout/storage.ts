import type { Workout } from "./types";

export const STORAGE_KEY = "wattsmith.workouts.v1";

export function loadWorkouts(): Workout[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveWorkout(workout: Workout): Workout[] {
  const existing = loadWorkouts();
  const updatedWorkout = { ...workout, updatedAt: new Date().toISOString() };
  const next = existing.some((item) => item.id === workout.id)
    ? existing.map((item) => (item.id === workout.id ? updatedWorkout : item))
    : [updatedWorkout, ...existing];

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function deleteWorkout(id: string): Workout[] {
  const next = loadWorkouts().filter((workout) => workout.id !== id);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}
