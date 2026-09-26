import { zones } from "@/lib/workout/zones";
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
  FREE_RIDE_PLACEHOLDER_PERCENT,
  ImportError,
  MAX_CUE_TEXT_LENGTH,
  MAX_IMPORT_CHARS,
  MAX_REPEAT_COUNT,
  type ImportOptions,
  type ImportResult,
  type XmlElement,
} from "./types";

// Reader for Zwift .zwo workouts. There is no official spec; element and
// attribute behavior follows the empirical reference built from Zwift's own
// files (github.com/h4l/zwift-workout-file-reference). Names are compared
// case-insensitively because hand-edited files vary.

interface Attributes {
  get(name: string): string | undefined;
  number(name: string): number | undefined;
}

interface ParseContext {
  warnings: string[];
  unsupported: Set<string>;
}

const TEXT_EVENTS = new Set(["textevent", "textnotification"]);

// Zwift zone numbers map onto the midpoint of the matching Wattsmith zone,
// rounded to a whole percent. Zwift has no sweet-spot zone, so its six zones
// skip that band. The open-ended bottom and top zones are bounded at 40% and
// 150% so their midpoints stay rideable.
const ZWIFT_ZONE_IDS = ["recovery", "endurance", "tempo", "threshold", "vo2", "anaerobic", "anaerobic"];

function zoneMidpoint(zoneNumber: number): number | undefined {
  const zoneId = ZWIFT_ZONE_IDS[Math.round(zoneNumber) - 1];
  const index = zones.findIndex((zone) => zone.id === zoneId);
  if (index === -1) return undefined;
  const low = index === 0 ? 40 : Math.ceil(zones[index - 1].max);
  const high = Number.isFinite(zones[index].max) ? Math.round(zones[index].max) : 150;
  return Math.round((low + high) / 2);
}

function lower(value: string): string {
  return value.toLowerCase();
}

function attributesOf(element: XmlElement, context: ParseContext, consumed: string[] = []): Attributes {
  const map = new Map<string, string>();
  for (const [key, value] of Object.entries(element.attributes)) {
    map.set(lower(key), value);
  }
  const used = new Set(consumed);
  for (const [key] of Object.entries(element.attributes)) {
    if (!used.has(lower(key))) context.unsupported.add(key);
  }
  return {
    get: (name) => map.get(name),
    number: (name) => {
      const raw = map.get(name);
      if (raw === undefined || raw.trim() === "") return undefined;
      const value = Number(raw);
      return Number.isFinite(value) ? value : undefined;
    },
  };
}

function textOf(element: XmlElement | undefined): string {
  return (element?.text ?? "").replace(/\s+/g, " ").trim();
}

function childNamed(element: XmlElement, name: string): XmlElement | undefined {
  return element.children.find((child) => lower(child.name) === name);
}

function toPercent(fraction: number, where: string, context: ParseContext): number {
  if (fraction < 0) {
    throw new ImportError(`${where} has a negative power target.`);
  }
  if (fraction > 3) {
    context.warnings.push(`${where} has a target above 300% FTP; check it before riding.`);
  }
  return roundPercent(fraction * 100);
}

function readDuration(value: number | undefined, where: string, context: ParseContext): number | undefined {
  const seconds = value === undefined ? undefined : Math.round(value);
  if (seconds === undefined || seconds <= 0) {
    context.warnings.push(`${where} has no duration and was skipped.`);
    return undefined;
  }
  return seconds;
}

function freeRide(label: string, durationSeconds: number): DraftStep {
  return {
    type: "steady",
    label,
    durationSeconds,
    targetMode: "single",
    targetPercentFTP: FREE_RIDE_PLACEHOLDER_PERCENT,
    ergEnabled: false,
  };
}

// Power for one side of a block: a single `power`, a `low`/`high` pair (ramp
// or range) or a zone number. Returns undefined when the block has none.
function readTarget(
  attrs: Attributes,
  keys: { single: string; low: string; high: string; zone: string },
  where: string,
  context: ParseContext,
  pair: "ramp" | "range",
): Pick<DraftStep, "targetMode" | "targetPercentFTP" | "startPercentFTP" | "endPercentFTP" | "minPercentFTP" | "maxPercentFTP"> | undefined {
  const low = attrs.number(keys.low);
  const high = attrs.number(keys.high);
  const single = attrs.number(keys.single);

  if (pair === "range" && single !== undefined) {
    if (low !== undefined || high !== undefined) {
      context.warnings.push(`${where} has both Power and PowerLow/PowerHigh; used Power and ignored the pair.`);
    }
    return { targetMode: "single", targetPercentFTP: toPercent(single, where, context) };
  }

  if (low !== undefined && high !== undefined) {
    const start = toPercent(low, where, context);
    const end = toPercent(high, where, context);
    if (start === end) return { targetMode: "single", targetPercentFTP: start };
    if (pair === "ramp") return { targetMode: "ramp", startPercentFTP: start, endPercentFTP: end };
    return {
      targetMode: "range",
      minPercentFTP: Math.min(start, end),
      maxPercentFTP: Math.max(start, end),
    };
  }

  const fallback = single ?? low ?? high;
  if (fallback !== undefined) {
    return { targetMode: "single", targetPercentFTP: toPercent(fallback, where, context) };
  }

  const zone = attrs.number(keys.zone);
  const zonePercent = zone === undefined ? undefined : zoneMidpoint(zone);
  if (zonePercent !== undefined) {
    context.warnings.push(`${where} uses Zwift zone ${zone}; set to ${zonePercent}% FTP.`);
    return { targetMode: "single", targetPercentFTP: zonePercent };
  }

  return undefined;
}

function readCue(element: XmlElement, where: string, context: ParseContext): DraftCue | undefined {
  const attrs = attributesOf(element, context, ["timeoffset", "message", "duration", "y"]);
  const offset = attrs.number("timeoffset");
  const text = (attrs.get("message") ?? "").replace(/\s+/g, " ").trim();
  if (offset === undefined || offset < 0 || !text) {
    context.warnings.push(`${where} has a text event without a time offset or message; it was skipped.`);
    return undefined;
  }
  let durationSeconds = Math.round(attrs.number("duration") ?? 0);
  if (durationSeconds <= 0) durationSeconds = DEFAULT_CUE_SECONDS;
  return { atSeconds: Math.round(offset), text: text.slice(0, MAX_CUE_TEXT_LENGTH), durationSeconds };
}

function readBlockCues(element: XmlElement, where: string, context: ParseContext): DraftCue[] {
  return element.children
    .filter((child) => TEXT_EVENTS.has(lower(child.name)))
    .map((child) => readCue(child, where, context))
    .filter((cue): cue is DraftCue => cue !== undefined);
}

function withCues(step: DraftStep, cues: DraftCue[]): DraftStep {
  return cues.length > 0 ? { ...step, cues } : step;
}

function readIntervals(element: XmlElement, where: string, context: ParseContext): DraftStep | undefined {
  const attrs = attributesOf(element, context, [
    "repeat",
    "onduration",
    "offduration",
    "onpower",
    "offpower",
    "poweronlow",
    "poweronhigh",
    "powerofflow",
    "poweroffhigh",
    "poweronzone",
    "poweroffzone",
  ]);
  const onSeconds = readDuration(attrs.number("onduration"), `${where} (on)`, context);
  if (onSeconds === undefined) return undefined;

  let repeatCount = Math.round(attrs.number("repeat") ?? 1);
  if (repeatCount < 1) {
    context.warnings.push(`${where} repeats ${repeatCount} times; imported as 1.`);
    repeatCount = 1;
  }
  if (repeatCount > MAX_REPEAT_COUNT) {
    throw new ImportError(`${where} repeats ${repeatCount} times; Wattsmith imports at most ${MAX_REPEAT_COUNT}.`);
  }

  const onTarget = readTarget(
    attrs,
    { single: "onpower", low: "poweronlow", high: "poweronhigh", zone: "poweronzone" },
    `${where} (on)`,
    context,
    "ramp",
  );
  if (!onTarget) {
    context.warnings.push(`${where} (on) has no power target; the block was skipped.`);
    return undefined;
  }
  const on: DraftStep = { type: "steady", label: "On", durationSeconds: onSeconds, ...onTarget };

  const offRaw = attrs.number("offduration");
  const offSeconds = offRaw === undefined ? 0 : Math.round(offRaw);
  const children = [on];
  let offDropped = false;
  if (offSeconds > 0) {
    const offTarget = readTarget(
      attrs,
      { single: "offpower", low: "powerofflow", high: "poweroffhigh", zone: "poweroffzone" },
      `${where} (off)`,
      context,
      "ramp",
    );
    if (offTarget) {
      children.push({ type: "recovery", label: "Off", durationSeconds: offSeconds, ...offTarget });
    } else {
      context.warnings.push(`${where} (off) has no power target; the off part was dropped.`);
      offDropped = true;
    }
  }

  // Zwift repeats a text event's offset in every repetition, which is how a
  // cue on a repeat child already behaves in Wattsmith.
  const repeatCues: DraftCue[] = [];
  for (const cue of readBlockCues(element, where, context)) {
    if (cue.atSeconds < onSeconds) {
      children[0].cues = [...(children[0].cues ?? []), cue];
    } else if (offDropped) {
      context.warnings.push(`${where} text event at ${cue.atSeconds} s was timed against the dropped off part; skipped.`);
    } else if (children[1] && cue.atSeconds < onSeconds + offSeconds) {
      children[1].cues = [...(children[1].cues ?? []), { ...cue, atSeconds: cue.atSeconds - onSeconds }];
    } else {
      repeatCues.push(cue);
    }
  }

  return withCues({ type: "repeat", label: "Intervals", repeatCount, children }, repeatCues);
}

function readBlock(element: XmlElement, index: number, context: ParseContext): DraftStep | undefined {
  const tag = lower(element.name);
  const where = `<${element.name}> block ${index + 1}`;

  if (tag === "intervalst") return readIntervals(element, where, context);

  const simple: Record<string, { type: DraftStep["type"]; label: string; pair: "ramp" | "range" }> = {
    warmup: { type: "warmup", label: "Warmup", pair: "ramp" },
    cooldown: { type: "cooldown", label: "Cooldown", pair: "ramp" },
    ramp: { type: "steady", label: "Ramp", pair: "ramp" },
    steadystate: { type: "steady", label: "Steady", pair: "range" },
    solidstate: { type: "steady", label: "Steady", pair: "range" },
  };
  const known = simple[tag];

  if (known) {
    const attrs = attributesOf(element, context, ["duration", "power", "powerlow", "powerhigh", "zone"]);
    const durationSeconds = readDuration(attrs.number("duration"), where, context);
    if (durationSeconds === undefined) return undefined;
    const target = readTarget(
      attrs,
      { single: "power", low: "powerlow", high: "powerhigh", zone: "zone" },
      where,
      context,
      known.pair,
    );
    if (!target) {
      context.warnings.push(`${where} has no power target; the block was skipped.`);
      return undefined;
    }
    return withCues(
      { type: known.type, label: known.label, durationSeconds, ...target },
      readBlockCues(element, where, context),
    );
  }

  if (tag !== "freeride" && tag !== "maxeffort") {
    context.warnings.push(`${where}: unsupported element, skipped.`);
    return undefined;
  }

  const attrs = attributesOf(element, context, ["duration"]);
  const durationSeconds = readDuration(attrs.number("duration"), where, context);
  if (durationSeconds === undefined) return undefined;

  let label = "Free ride";
  if (tag === "freeride") {
    context.warnings.push(`${where}: free ride block, no ERG target.`);
  } else {
    label = "Max effort";
    context.warnings.push(`${where}: max effort has no meaning under ERG; imported as a free ride block with no ERG target.`);
  }
  return withCues(freeRide(label, durationSeconds), readBlockCues(element, where, context));
}

function hasBareAmpersand(text: string): boolean {
  return /&(?!(?:[a-zA-Z][a-zA-Z0-9]*|#\d+|#x[0-9a-fA-F]+);)/.test(text);
}

function escapeBareAmpersands(text: string): string {
  return text.replace(/&(?!(?:[a-zA-Z][a-zA-Z0-9]*|#\d+|#x[0-9a-fA-F]+);)/g, "&amp;");
}

function parseTree(text: string, options: ImportOptions, warnings: string[]): XmlElement {
  if (!options.parseXml) {
    throw new ImportError("No XML reader is available to open .zwo files.");
  }
  // .zwo files never need a DTD. Refusing one up front rules out external
  // entities and entity-expansion attacks whatever XML parser is plugged in.
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) {
    throw new ImportError("The file declares a DOCTYPE or entities, which .zwo files never use; it was not read.");
  }

  let parsed = options.parseXml(text);
  if (!parsed.ok && hasBareAmpersand(text)) {
    const retry = options.parseXml(escapeBareAmpersands(text));
    if (retry.ok) {
      warnings.push("The file has unescaped & characters; they were read as text.");
      parsed = retry;
    }
  }
  if (!parsed.ok) {
    throw new ImportError(`The file is not valid XML: ${parsed.error}`);
  }
  return parsed.root;
}

export function parseZwo(input: string, options: ImportOptions): ImportResult {
  if (input.length > MAX_IMPORT_CHARS) {
    throw new ImportError("The file is too large to be a workout.");
  }
  const warnings: string[] = [];
  const context: ParseContext = { warnings, unsupported: new Set() };
  const root = parseTree(stripBom(input).trim(), options, warnings);

  if (lower(root.name) !== "workout_file") {
    throw new ImportError(`Expected a <workout_file> document but found <${root.name}>.`);
  }

  const sportType = lower(textOf(childNamed(root, "sporttype")));
  if (sportType && sportType !== "bike") {
    throw new ImportError("Wattsmith imports bike workouts only.");
  }
  if (lower(textOf(childNamed(root, "durationtype"))) === "distance") {
    throw new ImportError("Wattsmith imports time-based bike workouts only; this workout uses distance.");
  }

  const workouts = root.children.filter((child) => lower(child.name) === "workout");
  if (workouts.length === 0) {
    throw new ImportError("The file has no <workout> section.");
  }
  if (workouts.length > 1) {
    warnings.push(`The file has ${workouts.length} <workout> sections; imported the first.`);
  }

  const blocks: DraftStep[] = [];
  const cues: DraftCue[] = [];
  let blockIndex = 0;
  for (const child of workouts[0].children) {
    if (TEXT_EVENTS.has(lower(child.name))) {
      const cue = readCue(child, "The workout", context);
      if (cue) cues.push(cue);
      continue;
    }
    const block = readBlock(child, blockIndex, context);
    blockIndex += 1;
    if (block) blocks.push(block);
  }

  const author = textOf(childNamed(root, "author"));
  const tags = (childNamed(root, "tags")?.children ?? [])
    .map((tag) => (Object.entries(tag.attributes).find(([key]) => lower(key) === "name")?.[1] ?? "").trim())
    .filter(Boolean);
  const description = [
    textOf(childNamed(root, "description")),
    author ? `Author: ${author}` : "",
    tags.length ? `Tags: ${tags.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const ftpOverride = textOf(childNamed(root, "ftpoverride"));
  if (ftpOverride) context.unsupported.add(`ftpOverride (${ftpOverride} W; set your FTP manually if you want it)`);
  if (context.unsupported.size > 0) {
    warnings.push(`Unsupported attributes ignored: ${[...context.unsupported].join(", ")}.`);
  }

  return finalizeDraft(
    {
      name: textOf(childNamed(root, "name")) || nameFromFileName(options.fileName) || "Imported workout",
      description,
      ftp: options.fallbackFtp,
      blocks,
      cues,
    },
    "zwo",
    warnings,
    options,
  );
}
