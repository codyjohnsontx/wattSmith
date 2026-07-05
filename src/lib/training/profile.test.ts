import { describe, expect, it } from "vitest";
import { validateProfilePayload } from "./profile";

const validProfile = {
  id: "local-athlete",
  ftp: 250,
  experienceLevel: "serious",
  weeklyHours: 8,
  availableDays: ["Tue", "Thu", "Sat"],
  primaryGoal: "Raise threshold",
  preferredWorkoutDurationMinutes: 75,
  constraints: ["travel"],
  updatedAt: "2026-07-01T00:00:00.000Z",
};

describe("profile validation", () => {
  it("accepts the editable athlete profile fields", () => {
    const result = validateProfilePayload(validProfile);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.profile.ftp).toBe(250);
      expect(result.profile.availableDays).toEqual(["Tue", "Thu", "Sat"]);
    }
  });

  it("rejects unsupported experience levels and invalid training values", () => {
    const result = validateProfilePayload({
      ...validProfile,
      ftp: 0,
      weeklyHours: -1,
      experienceLevel: "pro",
      preferredWorkoutDurationMinutes: 10,
      availableDays: ["Tue", "Funday"],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors).toContain("ftp must be at least 1.");
      expect(result.errors).toContain("weeklyHours must be at least 0.");
      expect(result.errors).toContain("experienceLevel is not supported.");
      expect(result.errors).toContain("preferredWorkoutDurationMinutes must be at least 15.");
      expect(result.errors).toContain("availableDays must only contain Mon through Sun.");
    }
  });
});
