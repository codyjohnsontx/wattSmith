import type { Workout } from "./types";

export interface WorkoutHistoryState {
  past: Workout[];
  present: Workout;
  future: Workout[];
}

export const MAX_WORKOUT_HISTORY = 50;

function cloneWorkout(workout: Workout): Workout {
  return structuredClone(workout);
}

function serializeWorkout(workout: Workout): string {
  return JSON.stringify(workout);
}

function appendPast(past: Workout[], workout: Workout): Workout[] {
  return [...past, cloneWorkout(workout)].slice(-MAX_WORKOUT_HISTORY);
}

export function createWorkoutHistory(workout: Workout): WorkoutHistoryState {
  return {
    past: [],
    present: cloneWorkout(workout),
    future: [],
  };
}

export function pushWorkoutHistory(
  state: WorkoutHistoryState,
  nextWorkout: Workout,
): WorkoutHistoryState {
  if (serializeWorkout(state.present) === serializeWorkout(nextWorkout)) {
    return state;
  }

  return {
    past: appendPast(state.past, state.present),
    present: cloneWorkout(nextWorkout),
    future: [],
  };
}

export function replaceWorkoutHistory(workout: Workout): WorkoutHistoryState {
  return createWorkoutHistory(workout);
}

export function undoWorkoutHistory(state: WorkoutHistoryState): WorkoutHistoryState {
  if (!canUndoWorkoutHistory(state)) return state;

  const present = state.past[state.past.length - 1];

  return {
    past: state.past.slice(0, -1).map(cloneWorkout),
    present: cloneWorkout(present),
    future: [cloneWorkout(state.present), ...state.future.map(cloneWorkout)],
  };
}

export function redoWorkoutHistory(state: WorkoutHistoryState): WorkoutHistoryState {
  if (!canRedoWorkoutHistory(state)) return state;

  const [present, ...future] = state.future;

  return {
    past: appendPast(state.past, state.present),
    present: cloneWorkout(present),
    future: future.map(cloneWorkout),
  };
}

export function canUndoWorkoutHistory(state: WorkoutHistoryState): boolean {
  return state.past.length > 0;
}

export function canRedoWorkoutHistory(state: WorkoutHistoryState): boolean {
  return state.future.length > 0;
}
