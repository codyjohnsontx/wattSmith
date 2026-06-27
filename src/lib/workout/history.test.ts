import { describe, expect, it } from "vitest";
import { defaultWorkout } from "./defaultWorkout";
import {
  MAX_WORKOUT_HISTORY,
  createWorkoutHistory,
  pushWorkoutHistory,
  redoWorkoutHistory,
  replaceWorkoutHistory,
  undoWorkoutHistory,
} from "./history";
import type { Workout } from "./types";

function renamedWorkout(name: string): Workout {
  return {
    ...structuredClone(defaultWorkout),
    name,
  };
}

describe("workout history", () => {
  it("starts with empty past and future stacks", () => {
    const history = createWorkoutHistory(defaultWorkout);

    expect(history.past).toEqual([]);
    expect(history.present).toEqual(defaultWorkout);
    expect(history.future).toEqual([]);
  });

  it("moves the current workout to past when pushing an edit", () => {
    const firstEdit = renamedWorkout("First edit");
    const history = pushWorkoutHistory(createWorkoutHistory(defaultWorkout), firstEdit);

    expect(history.past).toHaveLength(1);
    expect(history.past[0].name).toBe(defaultWorkout.name);
    expect(history.present.name).toBe("First edit");
    expect(history.future).toEqual([]);
  });

  it("undo restores the previous workout", () => {
    const firstEdit = pushWorkoutHistory(
      createWorkoutHistory(defaultWorkout),
      renamedWorkout("First edit"),
    );
    const undone = undoWorkoutHistory(firstEdit);

    expect(undone.present.name).toBe(defaultWorkout.name);
    expect(undone.future[0].name).toBe("First edit");
  });

  it("redo restores an undone workout", () => {
    const firstEdit = pushWorkoutHistory(
      createWorkoutHistory(defaultWorkout),
      renamedWorkout("First edit"),
    );
    const redone = redoWorkoutHistory(undoWorkoutHistory(firstEdit));

    expect(redone.present.name).toBe("First edit");
    expect(redone.past[0].name).toBe(defaultWorkout.name);
    expect(redone.future).toEqual([]);
  });

  it("clears redo history when editing after undo", () => {
    const firstEdit = pushWorkoutHistory(
      createWorkoutHistory(defaultWorkout),
      renamedWorkout("First edit"),
    );
    const undone = undoWorkoutHistory(firstEdit);
    const secondEdit = pushWorkoutHistory(undone, renamedWorkout("Second edit"));

    expect(secondEdit.present.name).toBe("Second edit");
    expect(secondEdit.future).toEqual([]);
  });

  it("ignores no-op pushes", () => {
    const history = createWorkoutHistory(defaultWorkout);
    const nextHistory = pushWorkoutHistory(history, structuredClone(defaultWorkout));

    expect(nextHistory).toBe(history);
    expect(nextHistory.past).toEqual([]);
  });

  it("caps past history", () => {
    let history = createWorkoutHistory(defaultWorkout);

    for (let index = 0; index < MAX_WORKOUT_HISTORY + 5; index += 1) {
      history = pushWorkoutHistory(history, renamedWorkout(`Edit ${index}`));
    }

    expect(history.past).toHaveLength(MAX_WORKOUT_HISTORY);
    expect(history.past[0].name).toBe("Edit 4");
  });

  it("replace clears past and future", () => {
    const edited = pushWorkoutHistory(createWorkoutHistory(defaultWorkout), renamedWorkout("Edit"));
    const undone = undoWorkoutHistory(edited);
    const replaced = replaceWorkoutHistory(renamedWorkout("Replacement"));

    expect(undone.future).toHaveLength(1);
    expect(replaced.present.name).toBe("Replacement");
    expect(replaced.past).toEqual([]);
    expect(replaced.future).toEqual([]);
  });
});
