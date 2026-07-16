import type { ActivityPrescriptionDraft } from "@/lib/activity/prescription";

const prescriptionDraftKey = "wattsmith.activity-prescription-draft.v1";

function isPrescriptionDraft(value: unknown): value is ActivityPrescriptionDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const draft = value as Partial<ActivityPrescriptionDraft>;
  return draft.version === 1
    && Boolean(draft.workout && typeof draft.workout.name === "string" && Array.isArray(draft.workout.blocks))
    && Boolean(draft.origin
      && typeof draft.origin.findingLabel === "string"
      && typeof draft.origin.targetPercentFtp === "number"
      && typeof draft.origin.sourcePath === "string"
      && (draft.origin.sourcePath.startsWith("/activities/") || draft.origin.sourcePath.startsWith("/demo/activities/")));
}

export function saveActivityPrescriptionDraft(draft: ActivityPrescriptionDraft) {
  window.sessionStorage.setItem(prescriptionDraftKey, JSON.stringify(draft));
}

export function consumeActivityPrescriptionDraft(): ActivityPrescriptionDraft | null {
  const raw = window.sessionStorage.getItem(prescriptionDraftKey);
  if (!raw) return null;
  window.sessionStorage.removeItem(prescriptionDraftKey);

  try {
    const value: unknown = JSON.parse(raw);
    return isPrescriptionDraft(value) ? value : null;
  } catch {
    return null;
  }
}
