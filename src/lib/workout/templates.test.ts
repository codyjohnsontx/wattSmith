import { describe, expect, it } from "vitest";
import { getScienceSource } from "../science/sources";
import { workoutTemplates } from "./templates";

describe("workout template rationale", () => {
  it("gives every template a why-it-works and who-should-modify explanation", () => {
    for (const template of workoutTemplates) {
      expect(template.rationale.summary.trim().length, template.id).toBeGreaterThan(0);
      expect(template.rationale.whyItWorks?.trim().length ?? 0, template.id).toBeGreaterThan(0);
      expect(
        template.rationale.whoShouldModify?.trim().length ?? 0,
        template.id,
      ).toBeGreaterThan(0);
    }
  });

  it("cites at least one resolvable approved source per template", () => {
    for (const template of workoutTemplates) {
      expect(template.rationale.sourceIds.length, template.id).toBeGreaterThan(0);
      for (const sourceId of template.rationale.sourceIds) {
        expect(getScienceSource(sourceId), `${template.id} -> ${sourceId}`).toBeTruthy();
      }
    }
  });

  it("keeps the preview rationale and the cloned workout rationale in sync", () => {
    for (const template of workoutTemplates) {
      expect(template.defaultWorkout.rationale, template.id).toEqual(template.rationale);
    }
  });
});
