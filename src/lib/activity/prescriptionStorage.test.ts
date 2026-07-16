// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { createPeakDemandPrescription } from "./prescription";
import { consumeActivityPrescriptionDraft, saveActivityPrescriptionDraft } from "./prescriptionStorage";

function createDraft() {
  const draft = createPeakDemandPrescription({
    effort: { durationSeconds: 300, label: "5 min", watts: 237, startMovingSecond: 1693 },
    ftp: 268,
    sourcePath: "/activities/activity-123",
    sourceType: "strava",
  });
  if (!draft) throw new Error("Expected a prescription draft.");
  return draft;
}

describe("activity prescription storage", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("consumes a complete prescription draft", () => {
    const draft = createDraft();
    saveActivityPrescriptionDraft(draft);
    expect(consumeActivityPrescriptionDraft()).toEqual(draft);
  });

  it("rejects drafts missing origin values read by the builder", () => {
    const draft = createDraft();
    const malformed = structuredClone(draft) as unknown as Record<string, unknown>;
    delete (malformed.origin as Record<string, unknown>).observedWatts;
    window.sessionStorage.setItem("wattsmith.activity-prescription-draft.v1", JSON.stringify(malformed));
    expect(consumeActivityPrescriptionDraft()).toBeNull();
  });

  it("rejects workouts with malformed nested blocks", () => {
    const draft = createDraft();
    const malformed = structuredClone(draft) as unknown as Record<string, unknown>;
    const workout = malformed.workout as Record<string, unknown>;
    const repeat = (workout.blocks as Record<string, unknown>[])[1];
    delete (repeat.children as Record<string, unknown>[])[0].targetPercentFTP;
    window.sessionStorage.setItem("wattsmith.activity-prescription-draft.v1", JSON.stringify(malformed));
    expect(consumeActivityPrescriptionDraft()).toBeNull();
  });

  it("rejects workouts missing required top-level fields", () => {
    const draft = createDraft();
    const malformed = structuredClone(draft) as unknown as Record<string, unknown>;
    delete (malformed.workout as Record<string, unknown>).ftp;
    window.sessionStorage.setItem("wattsmith.activity-prescription-draft.v1", JSON.stringify(malformed));
    expect(consumeActivityPrescriptionDraft()).toBeNull();
  });
});
