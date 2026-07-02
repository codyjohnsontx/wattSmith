import { describe, expect, it } from "vitest";
import {
  decorateWorkouts,
  filterLibraryEntries,
  sortLibraryEntries,
  workoutSortOrders,
  type LibraryFilter,
} from "./library";
import { formatRelativeTime } from "./math";
import type { Workout, WorkoutStep } from "./types";

function steadyBlock(durationSeconds: number, targetPercentFTP: number): WorkoutStep {
  return {
    id: `steady-${durationSeconds}-${targetPercentFTP}`,
    type: "steady",
    label: "Steady",
    targetMode: "single",
    durationSeconds,
    targetPercentFTP,
  };
}

function workout(overrides: Partial<Workout>): Workout {
  return {
    id: "workout",
    name: "Workout",
    description: "",
    category: "endurance",
    ftp: 200,
    blocks: [steadyBlock(30 * 60, 65)],
    cues: [],
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-15T00:00:00.000Z",
    ...overrides,
  };
}

const easySpin = workout({
  id: "easy-spin",
  name: "Easy Spin",
  description: "Gentle recovery ride",
  category: "recovery",
  blocks: [steadyBlock(30 * 60, 50)],
  updatedAt: "2026-06-10T00:00:00.000Z",
});

const longEndurance = workout({
  id: "long-endurance",
  name: "Long Endurance",
  description: "Long aerobic base ride",
  category: "endurance",
  blocks: [steadyBlock(2.5 * 60 * 60, 67)],
  updatedAt: "2026-06-12T00:00:00.000Z",
});

const vo2Razor = workout({
  id: "vo2-razor",
  name: "VO2 Razor",
  description: "Short and sharp intervals",
  category: "vo2",
  favorite: true,
  blocks: [steadyBlock(30 * 60, 100)],
  updatedAt: "2026-06-08T00:00:00.000Z",
});

const allWorkouts = [easySpin, longEndurance, vo2Razor];

function filter(overrides: Partial<LibraryFilter> = {}): LibraryFilter {
  return { query: "", category: "all", difficulty: "all", favoritesOnly: false, ...overrides };
}

describe("workout library helpers", () => {
  it("decorates workouts with summary and derived difficulty", () => {
    const entries = decorateWorkouts(allWorkouts);

    expect(entries).toHaveLength(3);
    expect(entries[0].summary.totalDurationSeconds).toBe(30 * 60);
    expect(entries.find((entry) => entry.workout.id === "easy-spin")?.difficulty).toBe("easy");
    expect(entries.find((entry) => entry.workout.id === "long-endurance")?.difficulty).not.toBe(
      "easy",
    );
    expect(entries.find((entry) => entry.workout.id === "vo2-razor")?.difficulty).toBe(
      "very-hard",
    );
  });

  it("filters by query against name and description", () => {
    const entries = decorateWorkouts(allWorkouts);

    expect(filterLibraryEntries(entries, filter({ query: "razor" }))).toHaveLength(1);
    expect(filterLibraryEntries(entries, filter({ query: "aerobic base" }))).toHaveLength(1);
    expect(filterLibraryEntries(entries, filter({ query: "zzz" }))).toHaveLength(0);
  });

  it("composes query, category, difficulty, and favorites filters with AND", () => {
    const entries = decorateWorkouts(allWorkouts);

    expect(filterLibraryEntries(entries, filter({ category: "vo2" }))).toHaveLength(1);
    expect(filterLibraryEntries(entries, filter({ difficulty: "easy" }))).toHaveLength(1);
    expect(filterLibraryEntries(entries, filter({ favoritesOnly: true }))).toHaveLength(1);
    expect(
      filterLibraryEntries(entries, filter({ query: "razor", category: "recovery" })),
    ).toHaveLength(0);
    expect(
      filterLibraryEntries(
        entries,
        filter({ query: "vo2", category: "vo2", difficulty: "very-hard", favoritesOnly: true }),
      ),
    ).toHaveLength(1);
  });

  it("sorts by recently edited by default order", () => {
    const unfavorited = decorateWorkouts([easySpin, longEndurance, { ...vo2Razor, favorite: false }]);
    const sorted = sortLibraryEntries(unfavorited, "recent");

    expect(sorted.map((entry) => entry.workout.id)).toEqual([
      "long-endurance",
      "easy-spin",
      "vo2-razor",
    ]);
  });

  it("sorts by duration in both directions", () => {
    const entries = decorateWorkouts([easySpin, longEndurance].map((item) => ({ ...item, favorite: false })));

    expect(sortLibraryEntries(entries, "duration-asc")[0].workout.id).toBe("easy-spin");
    expect(sortLibraryEntries(entries, "duration-desc")[0].workout.id).toBe("long-endurance");
  });

  it("sorts by name and by hardest", () => {
    const entries = decorateWorkouts(allWorkouts.map((item) => ({ ...item, favorite: false })));

    expect(sortLibraryEntries(entries, "name")[0].workout.name).toBe("Easy Spin");
    expect(sortLibraryEntries(entries, "hardest")[0].workout.id).toBe("vo2-razor");
    expect(sortLibraryEntries(entries, "hardest").at(-1)?.workout.id).toBe("easy-spin");
  });

  it("pins favorites first under every sort order", () => {
    const entries = decorateWorkouts(allWorkouts);

    for (const order of workoutSortOrders) {
      expect(sortLibraryEntries(entries, order)[0].workout.id).toBe("vo2-razor");
    }
  });

  it("does not mutate the input when sorting", () => {
    const entries = decorateWorkouts(allWorkouts);
    const before = entries.map((entry) => entry.workout.id);
    sortLibraryEntries(entries, "name");

    expect(entries.map((entry) => entry.workout.id)).toEqual(before);
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-06-15T12:00:00.000Z");

  it("formats each elapsed-time bucket", () => {
    expect(formatRelativeTime("2026-06-15T11:59:30.000Z", now)).toBe("just now");
    expect(formatRelativeTime("2026-06-15T11:45:00.000Z", now)).toBe("15m ago");
    expect(formatRelativeTime("2026-06-15T07:00:00.000Z", now)).toBe("5h ago");
    expect(formatRelativeTime("2026-06-12T12:00:00.000Z", now)).toBe("3d ago");
    expect(formatRelativeTime("2026-01-01T00:00:00.000Z", now)).toBe(
      new Date("2026-01-01T00:00:00.000Z").toLocaleDateString(),
    );
  });

  it("treats unparseable timestamps as just now", () => {
    expect(formatRelativeTime("not-a-date", now)).toBe("just now");
  });
});
