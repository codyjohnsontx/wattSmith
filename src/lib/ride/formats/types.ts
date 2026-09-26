import type { Workout } from "@/lib/workout/types";

export type WorkoutFileFormat = "zwo" | "erg" | "mrc";

export type ImportResult =
  | { ok: true; format: WorkoutFileFormat; workout: Workout; warnings: string[] }
  | { ok: false; error: string };

// A minimal XML tree so the .zwo reader does not depend on the DOM. The browser
// supplies a DOMParser adapter; another platform can supply any XML library.
export interface XmlElement {
  name: string;
  attributes: Record<string, string>;
  children: XmlElement[];
  text: string;
}

export type XmlParser = (text: string) => { ok: true; root: XmlElement } | { ok: false; error: string };

// Everything platform or clock dependent comes in through options so the
// parsers stay pure and deterministic.
export interface ImportOptions {
  fileName?: string;
  // The rider's FTP: the draft's FTP for %FTP files, and the scale for watt
  // files that carry no FTP of their own.
  fallbackFtp: number;
  workoutId: string;
  now: string;
  parseXml?: XmlParser;
}

// Imported files are untrusted input. These caps keep a hostile file from
// exhausting memory in the parser or in flattenWorkout afterwards.
export const MAX_IMPORT_CHARS = 1_000_000;
export const MAX_IMPORT_SEGMENTS = 5_000;
export const MAX_IMPORT_SECONDS = 24 * 60 * 60;
export const LONG_WORKOUT_SECONDS = 8 * 60 * 60;
export const MAX_REPEAT_COUNT = 500;
export const MAX_NAME_LENGTH = 120;
export const MAX_DESCRIPTION_LENGTH = 2_000;
export const MAX_CUE_TEXT_LENGTH = 200;
export const DEFAULT_CUE_SECONDS = 10;
export const FREE_RIDE_PLACEHOLDER_PERCENT = 60;

export class ImportError extends Error {}
