// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { collectWorkoutCues } from "@/lib/workout/cues";
import { flattenWorkout } from "@/lib/workout/flatten";
import type { Workout } from "@/lib/workout/types";
import { validateWorkout } from "@/lib/workout/validation";
import { domXmlParser } from "../importFile";
import { importError, importFixtureDir, importOk, listFixtures, readFixture } from "./testUtils";

const zwoDir = `${importFixtureDir}/zwo`;
const withXml = { parseXml: domXmlParser };

function load(fileName: string) {
  return importOk(readFixture(zwoDir, fileName), { ...withXml, fileName });
}

function totalSeconds(workout: Workout): number {
  return flattenWorkout(workout).at(-1)?.endSeconds ?? 0;
}

function wrap(body: string, meta = "<name>Test</name>") {
  return `<workout_file>${meta}<sportType>bike</sportType><workout>${body}</workout></workout_file>`;
}

describe(".zwo fixtures", () => {
  const files = listFixtures(zwoDir, ".zwo");

  it("has about ten real-world style files", () => {
    expect(files.length).toBeGreaterThanOrEqual(10);
  });

  it.each(files)("%s imports into a valid draft", (fileName) => {
    const result = load(fileName);
    expect(result.format).toBe("zwo");
    expect(validateWorkout(result.workout).filter((issue) => issue.severity === "error")).toEqual([]);
    expect(result.workout.blocks.length).toBeGreaterThan(0);
  });

  it("covers every supported element across the fixtures", () => {
    const sources = files.map((fileName) => readFixture(zwoDir, fileName).toLowerCase());
    for (const element of ["<warmup", "<cooldown", "<steadystate", "<intervalst", "<ramp", "<freeride", "<textevent"]) {
      expect(sources.some((source) => source.includes(element)), element).toBe(true);
    }
  });

  it("maps Warmup, SteadyState and Cooldown with text events", () => {
    const { workout, warnings } = load("sweet_spot_2x20.zwo");
    expect(workout.name).toBe("Sweet Spot 2x20");
    expect(workout.description).toContain("Author: Wattsmith");
    expect(workout.description).toContain("Tags: SWEETSPOT, FTP BUILDER");
    expect(workout.category).toBe("sweet-spot");
    expect(workout.blocks.map((block) => [block.type, block.targetMode])).toEqual([
      ["warmup", "ramp"],
      ["steady", "single"],
      ["steady", "single"],
      ["steady", "single"],
      ["cooldown", "ramp"],
    ]);
    expect(workout.blocks[0]).toMatchObject({ durationSeconds: 600, startPercentFTP: 45, endPercentFTP: 75 });
    expect(workout.blocks[1]).toMatchObject({ durationSeconds: 1200, targetPercentFTP: 90 });
    expect(workout.blocks[4]).toMatchObject({ startPercentFTP: 65, endPercentFTP: 40 });
    expect(collectWorkoutCues(workout).map((cue) => [cue.atSeconds, cue.text, cue.durationSeconds])).toEqual([
      [10, "Easy spin to start", 10],
      [540, "First effort in one minute", 10],
      [600, "Settle in at sweet spot", 10],
      [1200, "Halfway through the first block", 10],
      [3240, "One minute left", 15],
    ]);
    expect(warnings).toEqual(["Unsupported attributes ignored: pace, Cadence."]);
  });

  it("maps IntervalsT to a repeat with on and off children and per-repetition cues", () => {
    const { workout } = load("vo2_5x3.zwo");
    expect(workout.category).toBe("vo2");
    const intervals = workout.blocks[1];
    expect(intervals).toMatchObject({ type: "repeat", repeatCount: 5 });
    expect(intervals.children).toMatchObject([
      { type: "steady", label: "On", durationSeconds: 180, targetPercentFTP: 115 },
      { type: "recovery", label: "Off", durationSeconds: 180, targetPercentFTP: 50 },
    ]);
    const cues = collectWorkoutCues(workout).filter((cue) => cue.text === "Go! Hold it smooth");
    expect(cues.map((cue) => cue.atSeconds)).toEqual([480, 840, 1200, 1560, 1920]);
    const recover = collectWorkoutCues(workout).find((cue) => cue.text === "Recover and breathe");
    expect(recover?.atSeconds).toBe(480 + 190);
    expect(totalSeconds(workout)).toBe(480 + 5 * 360 + 420);
  });

  it("maps Ramp blocks in both directions", () => {
    const { workout } = load("ramp_test.zwo");
    expect(workout.blocks[1]).toMatchObject({ type: "steady", label: "Ramp", targetMode: "ramp", startPercentFTP: 60, endPercentFTP: 80 });
    expect(workout.blocks[4]).toMatchObject({ targetMode: "ramp", startPercentFTP: 100, endPercentFTP: 55 });
  });

  it("maps FreeRide and MaxEffort to free-ride blocks with no ERG target", () => {
    const { workout, warnings } = load("group_ride_freeride.zwo");
    const free = workout.blocks.slice(1);
    expect(free).toHaveLength(3);
    for (const block of free) {
      expect(block).toMatchObject({ targetMode: "single", targetPercentFTP: 60, ergEnabled: false });
    }
    expect(free.map((block) => block.label)).toEqual(["Free ride", "Max effort", "Free ride"]);
    expect(flattenWorkout(workout).filter((segment) => segment.ergEnabled === false)).toHaveLength(3);
    expect(warnings.filter((warning) => warning.includes("no ERG target"))).toHaveLength(3);
    expect(warnings.at(-1)).toBe("Unsupported attributes ignored: FlatRoad.");
    expect(collectWorkoutCues(workout)[0]).toMatchObject({ atSeconds: 630, text: "Ride how you feel" });
  });

  it("turns ramped on/off power into ramp children", () => {
    const { workout } = load("over_unders.zwo");
    expect(workout.blocks[1].children).toMatchObject([
      { targetMode: "ramp", startPercentFTP: 95, endPercentFTP: 105 },
      { targetMode: "single", targetPercentFTP: 110 },
    ]);
  });

  it("reads a hand-edited file with a BOM, comments, bare ampersands and case variants", () => {
    const { workout, warnings } = load("hand_edited.zwo");
    expect(workout.name).toBe("Tempo & Torque");
    expect(workout.blocks[0]).toMatchObject({ type: "warmup", durationSeconds: 600 });
    expect(workout.blocks.map((block) => block.targetPercentFTP ?? null)).toEqual([null, 82, 78, 105, null]);
    expect(collectWorkoutCues(workout).map((cue) => cue.text)).toEqual(["Big gear, low cadence", "Surge!"]);
    expect(warnings).toContain("The file has unescaped & characters; they were read as text.");
  });

  it("maps zone numbers to the midpoint of the matching Wattsmith zone", () => {
    const { workout, warnings } = load("zone_intervals.zwo");
    expect(workout.blocks[1].children).toMatchObject([{ targetPercentFTP: 113 }, { targetPercentFTP: 48 }]);
    expect(workout.blocks[2]).toMatchObject({ targetPercentFTP: 65 });
    expect(warnings.filter((warning) => warning.includes("Zwift zone"))).toHaveLength(3);
    expect(warnings.at(-1)).toContain("ftpOverride (250 W");
  });

  it("maps SteadyState power ranges to range targets", () => {
    const { workout } = load("tempo_range.zwo");
    expect(workout.blocks[1]).toMatchObject({ targetMode: "range", minPercentFTP: 76, maxPercentFTP: 87 });
    expect(workout.category).toBe("tempo");
  });

  it("never sorts warmup or cooldown power: PowerLow is the start", () => {
    const { workout } = load("reverse_ramps.zwo");
    expect(workout.blocks[0]).toMatchObject({ type: "warmup", startPercentFTP: 80, endPercentFTP: 55 });
    expect(workout.blocks[2]).toMatchObject({ type: "cooldown", startPercentFTP: 40, endPercentFTP: 65 });
    expect(workout.cues?.map((cue) => [cue.atSeconds, cue.text])).toEqual([
      [0, "Welcome, this one starts hard"],
      [1490, "Done"],
    ]);
  });

  it("survives awkward but legal content with a warning for each fix", () => {
    const { workout, warnings } = load("rough_edges.zwo");
    expect(workout.blocks.map((block) => block.type)).toEqual(["warmup", "repeat", "steady", "steady", "cooldown"]);
    expect(workout.blocks[1]).toMatchObject({ repeatCount: 1 });
    expect(workout.blocks[2]).toMatchObject({ targetPercentFTP: 0 });
    expect(warnings).toEqual([
      "The file has 2 <workout> sections; imported the first.",
      "<SteadyState> block 2 has no duration and was skipped.",
      "<IntervalsT> block 3 repeats 0 times; imported as 1.",
      "<IntervalsT> block 4 (on) has no duration and was skipped.",
    ]);
  });
});

describe(".zwo edge cases", () => {
  it("rounds fractional durations", () => {
    const { workout } = importOk(wrap('<SteadyState Duration="599.5" Power="0.7"/>'), withXml);
    expect(workout.blocks[0].durationSeconds).toBe(600);
  });

  it("uses the file name when the workout has no name", () => {
    const { workout } = importOk(wrap('<SteadyState Duration="60" Power="0.7"/>', ""), { ...withXml, fileName: "my_ride.zwo" });
    expect(workout.name).toBe("my ride");
  });

  it("keeps a SteadyState with only PowerLow and PowerHigh equal as a single target", () => {
    const { workout } = importOk(wrap('<SteadyState Duration="60" PowerLow="0.7" PowerHigh="0.7"/>'), withXml);
    expect(workout.blocks[0]).toMatchObject({ targetMode: "single", targetPercentFTP: 70 });
  });

  it("skips an unknown timed element and warns", () => {
    const result = importOk(wrap('<Mystery Duration="120"/><SteadyState Duration="60" Power="0.7"/>'), withXml);
    expect(result.workout.blocks).toHaveLength(1);
    expect(result.workout.blocks[0]).toMatchObject({ targetPercentFTP: 70, durationSeconds: 60 });
    expect(result.workout.blocks[0].ergEnabled).toBeUndefined();
    expect(result.warnings).toContain("<Mystery> block 1: unsupported element, skipped.");
  });

  it("skips a structured block whose power attribute is misspelled", () => {
    const result = importOk(wrap('<SteadyState Duration="300" Powr="0.8"/><SteadyState Duration="60" Power="0.7"/>'), withXml);
    expect(result.workout.blocks).toHaveLength(1);
    expect(result.workout.blocks[0]).toMatchObject({ targetPercentFTP: 70, durationSeconds: 60 });
    expect(result.workout.blocks[0].ergEnabled).toBeUndefined();
    expect(result.warnings).toContain("<SteadyState> block 1 has no power target; the block was skipped.");
  });

  it("skips a ramp element with no readable power", () => {
    const result = importOk(wrap('<Warmup Duration="300"/><SteadyState Duration="60" Power="0.7"/>'), withXml);
    expect(result.workout.blocks).toHaveLength(1);
    expect(result.warnings).toContain("<Warmup> block 1 has no power target; the block was skipped.");
  });

  it("skips an IntervalsT whose on part has no readable power", () => {
    const result = importOk(
      wrap('<IntervalsT Repeat="3" OnDuration="60" OffDuration="60" OnPowr="1.1" OffPower="0.5"/><SteadyState Duration="60" Power="0.7"/>'),
      withXml,
    );
    expect(result.workout.blocks).toHaveLength(1);
    expect(result.workout.blocks[0]).toMatchObject({ type: "steady", targetPercentFTP: 70 });
    expect(result.warnings).toContain("<IntervalsT> block 1 (on) has no power target; the block was skipped.");
  });

  it("drops the off part of an IntervalsT whose off power is unreadable", () => {
    const result = importOk(
      wrap('<IntervalsT Repeat="3" OnDuration="60" OffDuration="60" OnPower="1.1" OffPowr="0.5"><textevent timeoffset="90" message="Spin"/></IntervalsT>'),
      withXml,
    );
    const [repeat] = result.workout.blocks;
    expect(repeat).toMatchObject({ type: "repeat", repeatCount: 3 });
    expect(repeat.children).toHaveLength(1);
    expect(repeat.children![0]).toMatchObject({ label: "On", durationSeconds: 60, targetPercentFTP: 110 });
    expect(repeat.children![0].ergEnabled).toBeUndefined();
    expect(result.warnings).toContain("<IntervalsT> block 1 (off) has no power target; the off part was dropped.");
  });

  it.each([
    ["not XML at all", "hello <workout_file", "not valid XML"],
    ["an unclosed tag", "<workout_file><workout><SteadyState Duration='60' Power='0.7'></workout></workout_file>", "not valid XML"],
    ["the wrong root element", "<workout_file_x/>", "Expected a <workout_file>"],
    ["a run workout", "<workout_file><sportType>run</sportType><workout><SteadyState Duration='60' pace='1'/></workout></workout_file>", "bike workouts only"],
    ["a distance workout", "<workout_file><durationType>distance</durationType><workout><SteadyState Duration='600' Power='0.5'/></workout></workout_file>", "time-based"],
    ["no workout section", "<workout_file><name>x</name></workout_file>", "no <workout> section"],
    ["no timed blocks", wrap("<textevent timeoffset='0' message='hi'/>"), "no workout blocks"],
    ["a negative power", wrap('<SteadyState Duration="60" Power="-0.5"/>'), "negative power"],
    ["a huge repeat", wrap('<IntervalsT Repeat="100000" OnDuration="1" OffDuration="1" OnPower="1" OffPower="0.5"/>'), "at most 500"],
    ["too many segments", wrap('<IntervalsT Repeat="500" OnDuration="1" OffDuration="1" OnPower="1" OffPower="0.5"/>'.repeat(6)), "imports at most 5000"],
    ["a DOCTYPE with entities", '<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol">]><workout_file><name>&lol;</name></workout_file>', "DOCTYPE"],
    ["an external entity", '<!DOCTYPE x [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><workout_file><name>&xxe;</name></workout_file>', "DOCTYPE"],
    ["deep nesting", `<workout_file>${"<a>".repeat(100)}${"</a>".repeat(100)}</workout_file>`, "not valid XML"],
  ])("rejects %s with a readable error", (_label, text, message) => {
    expect(importError(text, { ...withXml, fileName: "bad.zwo" })).toContain(message);
  });

  it("reports a missing XML reader instead of crashing", () => {
    expect(importError(wrap('<SteadyState Duration="60" Power="0.7"/>'))).toContain("No XML reader");
  });
});
