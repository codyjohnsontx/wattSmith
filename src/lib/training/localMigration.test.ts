import { describe, expect, it } from "vitest";
import { defaultWorkout } from "@/lib/workout/defaultWorkout";
import { defaultProfile } from "@/lib/workout/storage";
import { validateLocalMigrationPayload } from "./localMigration";

describe("local migration payload validation", () => {
  it("accepts a valid local profile and workout list", () => {
    const result = validateLocalMigrationPayload({
      profile: defaultProfile,
      workouts: [defaultWorkout],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.profile?.ftp).toBe(defaultProfile.ftp);
      expect(result.workouts).toHaveLength(1);
    }
  });

  it("rejects malformed migration payloads", () => {
    const result = validateLocalMigrationPayload({
      profile: { ...defaultProfile, availableDays: ["Mon", "Someday"] },
      workouts: [{ id: "broken" }],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.join(" ")).toContain("availableDays");
      expect(result.errors.join(" ")).toContain("workouts[0]");
    }
  });
});
