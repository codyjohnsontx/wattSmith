import type { WorkoutStepType } from "@/lib/workout/types";
import {
  finalizeDraft,
  nameFromFileName,
  roundPercent,
  stripBom,
  type DraftCue,
  type DraftStep,
} from "./draft";
import {
  DEFAULT_CUE_SECONDS,
  ImportError,
  MAX_CUE_TEXT_LENGTH,
  MAX_IMPORT_CHARS,
  MAX_IMPORT_SEGMENTS,
  type ImportOptions,
  type ImportResult,
} from "./types";

// Reader for the .erg (watts) and .mrc (%FTP) course formats. Behavior follows
// the most permissive reader in the wild, GoldenCheetah's ErgFile.cpp: rows
// are points on a piecewise-linear power line, so two rows at the same minute
// are a step and rows at different minutes are a ramp. Wattsmith's own
// exporters write exactly that shape, so every export re-imports losslessly.

type Units = "watts" | "percent";

interface DataPoint {
  minutes: number;
  value: number;
  line: number;
}

interface CourseSections {
  header: Map<string, string>;
  units?: Units;
  headerFtp?: number;
  data: DataPoint[];
  text: { line: number; raw: string }[];
  sawData: boolean;
}

const MAX_WATTS = 3000;
const MAX_PERCENT = 300;

function readSections(text: string, warnings: string[]): CourseSections {
  const result: CourseSections = { header: new Map(), data: [], text: [], sawData: false };
  let section: "header" | "data" | "text" | "other" | null = null;
  const unknownSections = new Set<string>();

  const lines = text.split(/\r\n|\r|\n/);
  lines.forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const line = rawLine.trim();
    if (!line || line.startsWith(";")) return;

    const sectionMatch = /^\[\s*(.+?)\s*\]$/.exec(line);
    if (sectionMatch) {
      const name = sectionMatch[1].toUpperCase().replace(/\s+/g, " ");
      if (name.startsWith("END")) {
        section = null;
      } else if (name === "COURSE HEADER") {
        section = "header";
      } else if (name === "COURSE DATA") {
        section = "data";
        result.sawData = true;
      } else if (name === "COURSE TEXT") {
        section = "text";
      } else {
        section = "other";
        unknownSections.add(name);
      }
      return;
    }

    if (section === "header") {
      const pair = /^([^=]+?)\s*=\s*(.*)$/.exec(line);
      if (pair) {
        const key = pair[1].trim().toUpperCase();
        result.header.set(key, pair[2].trim());
        if (key === "FTP") {
          const ftp = Number(pair[2]);
          if (Number.isFinite(ftp) && ftp > 0) result.headerFtp = ftp;
        }
        return;
      }
      // The unit line, e.g. "MINUTES WATTS". Other bare header lines are ignored.
      const [axis, value, ...rest] = line.toUpperCase().split(/\s+/);
      if (rest.length > 0) return;
      if (["MILES", "KM", "KILOMETERS", "METERS", "DISTANCE"].includes(axis)) {
        throw new ImportError(
          `Line ${lineNumber}: "${line}" is a distance-based course. Wattsmith imports time-based workouts only.`,
        );
      }
      if (axis !== "MINUTES") return;
      if (value === "WATTS") result.units = "watts";
      else if (value === "PERCENT" || value === "FTP") result.units = "percent";
      else throw new ImportError(`Line ${lineNumber}: unknown unit line "${line}".`);
      return;
    }

    if (section === "data") {
      const columns = line.split(/\s+/);
      if (columns.length >= 3) {
        throw new ImportError(
          `Line ${lineNumber}: "${line}" has more than two columns. Wattsmith reads "minutes value" rows only.`,
        );
      }
      const minutes = Number(columns[0]);
      const value = Number((columns[1] ?? "").replace(/%$/, ""));
      if (columns.length !== 2 || !Number.isFinite(minutes) || !Number.isFinite(value)) {
        throw new ImportError(`Line ${lineNumber}: expected "minutes value" but found "${line}".`);
      }
      if (result.data.length >= MAX_IMPORT_SEGMENTS * 2) {
        throw new ImportError(`The file has more than ${MAX_IMPORT_SEGMENTS * 2} data rows.`);
      }
      result.data.push({ minutes, value, line: lineNumber });
      return;
    }

    if (section === "text") {
      result.text.push({ line: lineNumber, raw: rawLine });
    }
  });

  if (unknownSections.size > 0) {
    warnings.push(`Ignored unknown sections: ${[...unknownSections].join(", ")}.`);
  }

  return result;
}

// Collapses the point list into strictly ordered (seconds, value) points,
// dropping duplicate rows the way GoldenCheetah does.
interface TimedPoint extends DataPoint {
  seconds: number;
}

function cleanPoints(points: DataPoint[], warnings: string[]): TimedPoint[] {
  if (points.length < 2) {
    throw new ImportError("The [COURSE DATA] section needs at least two rows.");
  }

  const shift = points[0].minutes;
  if (shift !== 0) {
    warnings.push(`Line ${points[0].line}: the first row starts at ${shift} minutes; the workout was shifted to start at 0.`);
  }

  const cleaned: TimedPoint[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const previous = points[index - 1];
    if (previous && point.minutes < previous.minutes) {
      throw new ImportError(`Line ${point.line}: time goes backwards (${point.minutes} after ${previous.minutes} minutes).`);
    }

    // Rows at one minute: the first closes the previous block and the last
    // opens the next one; anything in between is noise.
    const next = points[index + 1];
    if (previous && next && point.minutes === previous.minutes && point.minutes === next.minutes) {
      warnings.push(`Line ${point.line}: more than two rows at ${point.minutes} minutes; the middle row was ignored.`);
      continue;
    }

    cleaned.push({ ...point, seconds: Math.round((point.minutes - shift) * 60) });
  }

  const last = cleaned[cleaned.length - 1];
  const beforeLast = cleaned[cleaned.length - 2];
  if (beforeLast && last.minutes === beforeLast.minutes) {
    warnings.push(`Line ${last.line}: the last row starts a block with no end time and was dropped.`);
    cleaned.pop();
  }

  return cleaned;
}

function toPercent(value: number, units: Units, ftp: number): number {
  return roundPercent(units === "watts" ? (value / ftp) * 100 : value);
}

function classifyBlocks(blocks: DraftStep[]): void {
  const average = (step: DraftStep) =>
    step.targetMode === "ramp"
      ? ((step.startPercentFTP ?? 0) + (step.endPercentFTP ?? 0)) / 2
      : (step.targetPercentFTP ?? 0);
  const labels: Record<Exclude<WorkoutStepType, "repeat">, string> = {
    warmup: "Warmup",
    cooldown: "Cooldown",
    recovery: "Recovery",
    steady: "Steady",
  };

  blocks.forEach((step, index) => {
    const isFirst = index === 0;
    const isLast = index === blocks.length - 1 && blocks.length > 1;
    const rampsUp = step.targetMode === "ramp" && (step.endPercentFTP ?? 0) > (step.startPercentFTP ?? 0);
    const rampsDown = step.targetMode === "ramp" && (step.endPercentFTP ?? 0) < (step.startPercentFTP ?? 0);
    let type: Exclude<WorkoutStepType, "repeat"> = "steady";

    if (isFirst && rampsUp && average(step) < 76) type = "warmup";
    else if (isLast && (rampsDown || average(step) < 60)) type = "cooldown";
    else if (!isFirst && !isLast && average(step) < 60) type = "recovery";

    step.type = type;
    step.label = type === "steady" && step.targetMode === "ramp" ? "Ramp" : labels[type];
  });
}

function readCues(rows: CourseSections["text"], shiftSeconds: number, warnings: string[]): DraftCue[] {
  const cues: DraftCue[] = [];
  for (const row of rows) {
    const line = row.raw.trim();
    if (!line || line.startsWith(";")) continue;
    // Tab separated: seconds<TAB>text<TAB>duration. Fall back to whitespace
    // for files whose tabs were turned into spaces.
    const columns = row.raw.includes("\t")
      ? row.raw.split("\t").map((column) => column.trim())
      : (/^(\S+)\s+(.*?)(?:\s+(\d+(?:\.\d+)?))?$/.exec(line)?.slice(1) ?? []).map((column) => column?.trim());
    const atSeconds = Number(columns[0]);
    const text = (columns[1] ?? "").replace(/\s+/g, " ").trim();
    if (!Number.isFinite(atSeconds) || !text) {
      warnings.push(`Line ${row.line}: text event "${line}" could not be read and was skipped.`);
      continue;
    }
    const shifted = Math.round(atSeconds - shiftSeconds);
    if (shifted < 0) {
      warnings.push(`Line ${row.line}: text event before the workout start was skipped.`);
      continue;
    }
    let durationSeconds = Math.round(Number(columns[2]));
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      warnings.push(`Line ${row.line}: text event has no duration; showing it for ${DEFAULT_CUE_SECONDS} s.`);
      durationSeconds = DEFAULT_CUE_SECONDS;
    }
    cues.push({ atSeconds: shifted, text: text.slice(0, MAX_CUE_TEXT_LENGTH), durationSeconds });
  }
  return cues;
}

export function parseCourseFile(
  input: string,
  options: ImportOptions & { extension?: "erg" | "mrc" },
): ImportResult {
  if (input.length > MAX_IMPORT_CHARS) {
    throw new ImportError("The file is too large to be a workout.");
  }
  const warnings: string[] = [];
  const sections = readSections(stripBom(input), warnings);

  if (!sections.sawData) {
    throw new ImportError("No [COURSE DATA] section was found.");
  }

  let units = sections.units;
  if (!units) {
    if (options.extension) {
      units = options.extension === "erg" ? "watts" : "percent";
      warnings.push(`The file has no unit line; read targets as ${units === "watts" ? "watts" : "% of FTP"} from the .${options.extension} extension.`);
    } else {
      units = sections.headerFtp ? "watts" : "percent";
      warnings.push(`The file has no unit line; read targets as ${units === "watts" ? "watts" : "% of FTP"}.`);
    }
  }

  let ftp = options.fallbackFtp;
  if (units === "watts") {
    if (sections.headerFtp) {
      ftp = sections.headerFtp;
    } else {
      warnings.push(`This file has watt targets and no FTP; scaled using your FTP of ${options.fallbackFtp} W. Check the targets before riding.`);
    }
  }

  const points = cleanPoints(sections.data, warnings);
  const limit = units === "watts" ? MAX_WATTS : MAX_PERCENT;
  const unit = units === "watts" ? " W" : "%";
  const blocks: DraftStep[] = [];

  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const durationSeconds = end.seconds - start.seconds;
    if (durationSeconds <= 0) {
      // Two rows at one minute are a step change, not a block.
      if (end.minutes > start.minutes) {
        warnings.push(`Line ${end.line}: a block shorter than one second was dropped.`);
      }
      continue;
    }

    for (const point of [start, end]) {
      if (point.value < 0) {
        throw new ImportError(`Line ${point.line}: negative target ${point.value}${unit}.`);
      }
      if (point.value > limit) {
        warnings.push(`Line ${point.line}: target ${point.value}${unit} is unusually high; check it before riding.`);
      }
    }

    const startPercent = toPercent(start.value, units, ftp);
    const endPercent = toPercent(end.value, units, ftp);
    blocks.push(
      startPercent === endPercent
        ? { type: "steady", label: "", durationSeconds, targetMode: "single", targetPercentFTP: startPercent }
        : {
            type: "steady",
            label: "",
            durationSeconds,
            targetMode: "ramp",
            startPercentFTP: startPercent,
            endPercentFTP: endPercent,
          },
    );
  }

  classifyBlocks(blocks);

  const description = sections.header.get("DESCRIPTION") ?? "";
  return finalizeDraft(
    {
      name: nameFromFileName(options.fileName) || description || "Imported workout",
      description,
      ftp,
      blocks,
      cues: readCues(sections.text, Math.round(sections.data[0].minutes * 60), warnings),
    },
    units === "watts" ? "erg" : "mrc",
    warnings,
    options,
  );
}
