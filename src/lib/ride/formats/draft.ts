import { normalizeWorkouts } from "@/lib/workout/storage";
import { flattenWorkout } from "@/lib/workout/flatten";
import type { Workout, WorkoutCategory, WorkoutCue, WorkoutStep } from "@/lib/workout/types";
import { validateWorkout } from "@/lib/workout/validation";
import { zoneForPercent } from "@/lib/workout/zones";
import {
  ImportError,
  LONG_WORKOUT_SECONDS,
  MAX_DESCRIPTION_LENGTH,
  MAX_IMPORT_SECONDS,
  MAX_IMPORT_SEGMENTS,
  MAX_NAME_LENGTH,
  type ImportOptions,
  type ImportResult,
  type WorkoutFileFormat,
} from "./types";

export type DraftStep = Omit<WorkoutStep, "id" | "children" | "cues"> & {
  children?: DraftStep[];
  cues?: DraftCue[];
};

export type DraftCue = Omit<WorkoutCue, "id">;

export interface WorkoutDraft {
  name: string;
  description: string;
  ftp: number;
  blocks: DraftStep[];
  cues: DraftCue[];
}

const workoutCategories: WorkoutCategory[] = [
  "recovery",
  "endurance",
  "tempo",
  "sweet-spot",
  "threshold",
  "vo2",
  "anaerobic",
];

// The zone the work is done in: warmup, cooldown, recovery and free-ride
// time is left out so a VO2 session is not filed as recovery.
function guessCategory(workout: Workout): WorkoutCategory {
  const seconds = new Map<string, number>();
  for (const segment of flattenWorkout(workout)) {
    if (segment.type !== "steady" || segment.ergEnabled === false) continue;
    const zone = zoneForPercent((segment.startPercentFTP + segment.endPercentFTP) / 2).id;
    seconds.set(zone, (seconds.get(zone) ?? 0) + segment.durationSeconds);
  }
  const [dominant] = [...seconds].sort((a, b) => b[1] - a[1])[0] ?? [];
  return workoutCategories.find((category) => category === dominant) ?? "endurance";
}

export function roundPercent(value: number): number {
  return Math.round(value * 100) / 100;
}

// "fixture_long_ride.erg" -> "fixture long ride"
export function nameFromFileName(fileName: string | undefined): string {
  if (!fileName) return "";
  const base = fileName.split(/[\\/]/).pop() ?? "";
  return base.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim();
}

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function stepSegmentCount(step: DraftStep): number {
  if (step.type !== "repeat") return 1;
  const children = (step.children ?? []).reduce((total, child) => total + stepSegmentCount(child), 0);
  return children * Math.max(1, step.repeatCount ?? 1);
}

function stepSeconds(step: DraftStep): number {
  if (step.type !== "repeat") return step.durationSeconds ?? 0;
  const children = (step.children ?? []).reduce((total, child) => total + stepSeconds(child), 0);
  return children * Math.max(1, step.repeatCount ?? 1);
}

function clip(value: string, max: number, what: string, warnings: string[]): string {
  if (value.length <= max) return value;
  warnings.push(`${what} was longer than ${max} characters and was shortened.`);
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

// Turns a parser's draft into a builder-ready Workout: ids, timestamps and a
// category, then the same normalize + validate path API payloads take. A draft
// that still fails validation is reported as an error, never handed on.
export function finalizeDraft(
  draft: WorkoutDraft,
  format: WorkoutFileFormat,
  warnings: string[],
  options: ImportOptions,
): ImportResult {
  if (draft.blocks.length === 0) {
    throw new ImportError("The file has no workout blocks with a duration.");
  }

  const segmentCount = draft.blocks.reduce((total, block) => total + stepSegmentCount(block), 0);
  if (segmentCount > MAX_IMPORT_SEGMENTS) {
    throw new ImportError(
      `The workout expands to ${segmentCount} segments; Wattsmith imports at most ${MAX_IMPORT_SEGMENTS}.`,
    );
  }

  const totalSeconds = draft.blocks.reduce((total, block) => total + stepSeconds(block), 0);
  if (totalSeconds > MAX_IMPORT_SECONDS) {
    throw new ImportError("The workout is longer than 24 hours, which Wattsmith does not import.");
  }
  if (totalSeconds > LONG_WORKOUT_SECONDS) {
    warnings.push("The workout is longer than 8 hours.");
  }

  let nextId = 0;
  const id = (prefix: string) => `imported-${prefix}-${(nextId += 1)}`;
  const withCueIds = (cues: DraftCue[] | undefined): WorkoutCue[] | undefined =>
    cues?.map((cue) => ({ ...cue, id: id("cue") }));
  const withStepIds = (step: DraftStep): WorkoutStep => {
    const { children, cues, ...rest } = step;
    return {
      ...rest,
      id: id("step"),
      ...(children ? { children: children.map(withStepIds) } : {}),
      ...(cues?.length ? { cues: withCueIds(cues) } : {}),
    };
  };

  const name = clip(draft.name.trim() || "Imported workout", MAX_NAME_LENGTH, "The workout name", warnings);
  const description = clip(draft.description.trim(), MAX_DESCRIPTION_LENGTH, "The description", warnings);

  const workout: Workout = {
    id: options.workoutId,
    name,
    description,
    favorite: false,
    ftp: Math.round(draft.ftp),
    blocks: draft.blocks.map(withStepIds),
    cues: withCueIds(draft.cues) ?? [],
    createdAt: options.now,
    updatedAt: options.now,
  };

  workout.category = guessCategory(workout);

  const [normalized] = normalizeWorkouts([workout]);
  const errors = normalized
    ? validateWorkout(normalized).filter((issue) => issue.severity === "error")
    : [{ message: "The imported workout is malformed." }];
  if (!normalized || errors.length > 0) {
    throw new ImportError(`The imported workout is not valid: ${errors[0].message}`);
  }

  return { ok: true, format, workout: normalized, warnings };
}
