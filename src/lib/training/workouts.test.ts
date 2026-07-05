import type { StructuredWorkout } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { defaultWorkout } from "@/lib/workout/defaultWorkout";
import { canAccessOwnedRecord, structuredWorkoutToWorkout, validateWorkoutPayload, workoutToStructuredInput } from "./workouts";

function dbWorkout(overrides: Partial<StructuredWorkout> = {}): StructuredWorkout {
  return {
    id: "workout-1",
    userId: "user-1",
    name: "Server Workout",
    description: "Stored workout",
    category: "threshold",
    favorite: true,
    ftp: 250,
    blocksJson: defaultWorkout.blocks,
    cuesJson: defaultWorkout.cues ?? [],
    rationaleJson: defaultWorkout.rationale ?? null,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-02T00:00:00.000Z"),
    ...overrides,
  };
}

describe("workout DTO mapping", () => {
  it("maps Workout to StructuredWorkout input", () => {
    const input = workoutToStructuredInput({ ...defaultWorkout, id: "workout-1", ftp: 249.6 });

    expect(input.id).toBe("workout-1");
    expect(input.ftp).toBe(250);
    expect(input.blocksJson).toEqual(defaultWorkout.blocks);
    expect(input.rationaleJson).toEqual(defaultWorkout.rationale);
  });

  it("maps StructuredWorkout records back to the app-facing Workout shape", () => {
    const workout = structuredWorkoutToWorkout(dbWorkout());

    expect(workout.id).toBe("workout-1");
    expect(workout.favorite).toBe(true);
    expect(workout.category).toBe("threshold");
    expect(workout.blocks).toEqual(defaultWorkout.blocks);
    expect(workout.updatedAt).toBe("2026-07-02T00:00:00.000Z");
  });

  it("validates malformed workout payloads", () => {
    const result = validateWorkoutPayload({ ...defaultWorkout, ftp: 0 });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors).toContain("FTP must be greater than zero.");
    }
  });

  it("checks workout ownership without leaking another user record", () => {
    expect(canAccessOwnedRecord({ userId: "user-1" }, "user-1")).toBe(true);
    expect(canAccessOwnedRecord({ userId: "user-2" }, "user-1")).toBe(false);
    expect(canAccessOwnedRecord(null, "user-1")).toBe(false);
  });
});
