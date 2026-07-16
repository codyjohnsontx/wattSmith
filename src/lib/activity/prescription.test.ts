import { describe, expect, it } from "vitest";
import { createPeakDemandPrescription, mapPeakDemand } from "./prescription";

const fiveMinutePeak = {
  durationSeconds: 300,
  label: "5 min",
  watts: 237,
  startMovingSecond: 1693,
};

describe("activity demand prescription", () => {
  it("maps a selected five-minute peak into an explicit repeat structure", () => {
    expect(mapPeakDemand(fiveMinutePeak, 268)).toEqual({
      findingLabel: "5 min peak",
      observedWatts: 237,
      observedPercentFtp: 88,
      targetWatts: 225,
      targetPercentFtp: 84,
      workIntervalSeconds: 300,
      repeatCount: 3,
      recoverySeconds: 300,
    });
  });

  it("creates an editable workout without copying activity identity into the workout record", () => {
    const draft = createPeakDemandPrescription({
      effort: fiveMinutePeak,
      ftp: 268,
      sourcePath: "/activities/strava-activity-123",
      sourceType: "strava",
    });

    expect(draft?.workout.blocks[1]).toMatchObject({ repeatCount: 3 });
    expect(JSON.stringify(draft?.workout)).not.toContain("strava-activity-123");
    expect(draft?.origin.sourcePath).toBe("/activities/strava-activity-123");
  });
});
