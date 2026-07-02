import { deriveDifficultyFromMetrics, difficultyRank, type WorkoutDifficulty } from "./difficulty";
import { calculateWorkoutSummary } from "./summary";
import type { Workout, WorkoutCategory, WorkoutSummary } from "./types";

export type WorkoutSortOrder =
  | "recent"
  | "duration-asc"
  | "duration-desc"
  | "name"
  | "hardest";

export const workoutSortOrders: WorkoutSortOrder[] = [
  "recent",
  "duration-asc",
  "duration-desc",
  "name",
  "hardest",
];

export const sortOrderLabels: Record<WorkoutSortOrder, string> = {
  recent: "Recently edited",
  "duration-asc": "Shortest first",
  "duration-desc": "Longest first",
  name: "Name A-Z",
  hardest: "Hardest first",
};

export interface LibraryWorkoutEntry {
  workout: Workout;
  summary: WorkoutSummary;
  difficulty: WorkoutDifficulty;
}

export interface LibraryFilter {
  query: string;
  category: "all" | WorkoutCategory;
  difficulty: "all" | WorkoutDifficulty;
  favoritesOnly: boolean;
}

export function decorateWorkouts(workouts: Workout[]): LibraryWorkoutEntry[] {
  return workouts.map((workout) => {
    const summary = calculateWorkoutSummary(workout);
    return { workout, summary, difficulty: deriveDifficultyFromMetrics(summary) };
  });
}

export function filterLibraryEntries(
  entries: LibraryWorkoutEntry[],
  { query, category, difficulty, favoritesOnly }: LibraryFilter,
): LibraryWorkoutEntry[] {
  const normalizedQuery = query.trim().toLowerCase();

  return entries.filter((entry) => {
    const matchesQuery =
      normalizedQuery.length === 0 ||
      `${entry.workout.name} ${entry.workout.description}`
        .toLowerCase()
        .includes(normalizedQuery);
    const matchesCategory = category === "all" || entry.workout.category === category;
    const matchesDifficulty = difficulty === "all" || entry.difficulty === difficulty;
    const matchesFavorite = !favoritesOnly || entry.workout.favorite === true;
    return matchesQuery && matchesCategory && matchesDifficulty && matchesFavorite;
  });
}

const sortComparators: Record<
  WorkoutSortOrder,
  (a: LibraryWorkoutEntry, b: LibraryWorkoutEntry) => number
> = {
  recent: (a, b) => b.workout.updatedAt.localeCompare(a.workout.updatedAt),
  "duration-asc": (a, b) => a.summary.totalDurationSeconds - b.summary.totalDurationSeconds,
  "duration-desc": (a, b) => b.summary.totalDurationSeconds - a.summary.totalDurationSeconds,
  name: (a, b) => a.workout.name.localeCompare(b.workout.name),
  hardest: (a, b) =>
    difficultyRank(b.difficulty) - difficultyRank(a.difficulty) ||
    b.summary.trainingStressScore - a.summary.trainingStressScore,
};

export function sortLibraryEntries(
  entries: LibraryWorkoutEntry[],
  sortOrder: WorkoutSortOrder,
): LibraryWorkoutEntry[] {
  const comparator = sortComparators[sortOrder];

  return [...entries].sort(
    (a, b) =>
      Number(b.workout.favorite === true) - Number(a.workout.favorite === true) ||
      comparator(a, b),
  );
}
