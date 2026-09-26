import { stripBom } from "./draft";
import { parseCourseFile } from "./erg";
import { ImportError, MAX_IMPORT_CHARS, type ImportOptions, type ImportResult, type WorkoutFileFormat } from "./types";
import { parseZwo } from "./zwo";

export const IMPORT_FILE_EXTENSIONS = [".zwo", ".erg", ".mrc"] as const;

function extensionOf(fileName: string | undefined): WorkoutFileFormat | undefined {
  const match = /\.(zwo|erg|mrc)$/i.exec(fileName?.trim() ?? "");
  return match ? (match[1].toLowerCase() as WorkoutFileFormat) : undefined;
}

function sniff(text: string): "zwo" | "course" | undefined {
  const head = stripBom(text).slice(0, 4096);
  if (/<\s*workout_file[\s>]/i.test(head)) return "zwo";
  if (/\[\s*course\s+(header|data)\s*\]/i.test(head)) return "course";
  return undefined;
}

// Picks a parser by file content first and extension second, because files
// arrive misnamed, and turns every failure into a readable error. This is the
// only entry point the UI calls; it never throws.
export function importWorkoutText(text: string, options: ImportOptions): ImportResult {
  try {
    if (text.length > MAX_IMPORT_CHARS) {
      return { ok: false, error: "The file is too large to be a workout (limit 1 MB)." };
    }
    if (!stripBom(text).trim()) {
      return { ok: false, error: "The file is empty." };
    }

    const extension = extensionOf(options.fileName);
    const sniffed = sniff(text);
    const kind = sniffed ?? (extension === "zwo" ? "zwo" : extension ? "course" : undefined);
    if (!kind) {
      return {
        ok: false,
        error: "This does not look like a .zwo, .erg or .mrc workout file.",
      };
    }

    const result =
      kind === "zwo"
        ? parseZwo(text, options)
        : parseCourseFile(text, { ...options, extension: extension === "zwo" ? undefined : extension });

    if (result.ok && extension && extension !== result.format) {
      result.warnings.unshift(`The file is named .${extension} but contains a .${result.format} workout; read it as .${result.format}.`);
    }
    return result;
  } catch (error) {
    if (error instanceof ImportError) {
      return { ok: false, error: error.message };
    }
    return { ok: false, error: "The file could not be read as a workout." };
  }
}
