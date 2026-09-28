import { readFileSync } from "node:fs";
import { join } from "node:path";
import FitParser from "fit-file-parser";
import { readFitMessages } from "fit-file-parser/raw";
import { beforeAll, describe, expect, it } from "vitest";
import type { RecorderRow } from "@/lib/ride/engine/types";
import { FIT_FIXTURE_START_MS, FIT_FIXTURE_WORKOUT_NAME, recordFitFixtureRide } from "@/lib/ride/fitTestUtils";
import { createRideHarness } from "@/lib/ride/testUtils";
import { exportTestFixtures } from "@/lib/workout/exportFixtures";
import { encodeRideFit } from "./encoder";
import type { FitRideInput } from "./encoder";
import { rideFitFileName } from "./fileName";
import { normalizedPower, virtualSpeedMmPerSecond } from "./summary";

// The encoder is checked against fit-file-parser, an independent decoder used
// only in tests: every value the recorder captured must come back unchanged.

type Parsed = Awaited<ReturnType<FitParser["parseAsync"]>>;
type Message = Record<string, unknown>;

// Base types and field numbers from Garmin's public FIT profile (Profile.xlsx),
// kept by hand so a writer that declares a field differently is caught.
const BASE_TYPES = { enum: 0x00, uint8: 0x02, string: 0x07, byte: 0x0d, uint16: 0x84, uint32: 0x86, uint32z: 0x8c } as const;
type BaseType = keyof typeof BASE_TYPES;
// Strings and byte arrays have variable size.
const BASE_TYPE_SIZES: Partial<Record<BaseType, number>> = { enum: 1, uint8: 1, uint16: 2, uint32: 4, uint32z: 4 };
const PROFILE_FIELDS: Record<number, Record<number, BaseType>> = {
  // file_id: type, manufacturer, product, serial_number, time_created
  0: { 0: "enum", 1: "uint16", 2: "uint16", 3: "uint32z", 4: "uint32" },
  // developer_data_id: application_id, developer_data_index
  207: { 1: "byte", 3: "uint8" },
  // field_description: developer_data_index, field_definition_number, fit_base_type_id, field_name, units
  206: { 0: "uint8", 1: "uint8", 2: "uint8", 3: "string", 8: "string" },
  // device_info: device_index, manufacturer, serial_number, product, software_version, source_type, product_name, timestamp
  23: { 0: "uint8", 2: "uint16", 3: "uint32z", 4: "uint16", 5: "uint16", 25: "enum", 27: "string", 253: "uint32" },
  // event: event, event_type, timestamp
  21: { 0: "enum", 1: "enum", 253: "uint32" },
  // record: heart_rate, cadence, distance, speed, power, timestamp
  20: { 3: "uint8", 4: "uint8", 5: "uint32", 6: "uint16", 7: "uint16", 253: "uint32" },
  // lap: start_time, elapsed, timer, avg HR, avg cadence, avg power, timestamp, message_index
  19: { 2: "uint32", 7: "uint32", 8: "uint32", 15: "uint8", 17: "uint8", 19: "uint16", 253: "uint32", 254: "uint16" },
  // session: event, event_type, start_time, sport, sub_sport, elapsed, timer, distance, avg/max HR,
  // avg cadence, avg/max power, first_lap_index, num_laps, trigger, normalized_power, total_work
  18: {
    0: "enum", 1: "enum", 2: "uint32", 5: "enum", 6: "enum", 7: "uint32", 8: "uint32", 9: "uint32", 16: "uint8",
    17: "uint8", 18: "uint8", 20: "uint16", 21: "uint16", 25: "uint16", 26: "uint16", 28: "enum",
    34: "uint16", 48: "uint32", 253: "uint32", 254: "uint16",
  },
  // activity: total_timer_time, num_sessions, type, event, event_type, local_timestamp, timestamp
  34: { 0: "uint32", 1: "uint16", 2: "enum", 3: "enum", 4: "enum", 5: "uint32", 253: "uint32" },
};

// fit-file-parser's semantic decoder checks the header and file CRCs only
// with force off.
function decode(bytes: Uint8Array): Promise<Parsed> {
  return new FitParser({ force: false, mode: "list" }).parseAsync(bytes.slice().buffer);
}

const at = (t: number) => new Date(FIT_FIXTURE_START_MS + t * 1000);

// Expected values computed straight from the recorder rows, independently of
// the encoder's summary module.
function expectedTotals(rows: RecorderRow[]) {
  const riding = rows.filter((row) => !row.paused);
  const values = (key: "power" | "cadence" | "heartRate") =>
    riding.map((row) => row[key]).filter((value): value is number => value !== null);
  const avg = (list: number[]) => Math.round(list.reduce((sum, value) => sum + value, 0) / list.length);
  const power = values("power");
  const lap = {
    start_time: at(rows[0].t),
    timestamp: at(rows.at(-1)!.t + 1),
    total_elapsed_time: rows.at(-1)!.t + 1 - rows[0].t,
    total_timer_time: riding.length,
    avg_power: avg(power),
    avg_cadence: avg(values("cadence")),
    avg_heart_rate: avg(values("heartRate")),
  };
  return {
    lap,
    session: {
      ...lap,
      max_power: Math.max(...power),
      max_heart_rate: Math.max(...values("heartRate")),
      total_work: power.reduce((sum, value) => sum + value, 0),
    },
  };
}

describe("FIT encoder round trip", () => {
  let input: FitRideInput;
  let bytes: Uint8Array;
  let fit: Parsed;

  beforeAll(async () => {
    input = await recordFitFixtureRide();
    bytes = encodeRideFit(input);
    fit = await decode(bytes);
  });

  it("records a 20-minute ride with a pause, a skip and a free-ride segment", () => {
    const { rows } = input;
    expect(rows).toHaveLength(20 * 60);
    expect(rows.filter((row) => row.paused)).toHaveLength(45);
    expect(rows.some((row) => row.targetWatts === null && !row.paused)).toBe(true);
    expect(rows.some((row) => row.power === null && !row.paused)).toBe(true);
  });

  it("writes a valid FIT structure in Garmin's activity recipe order", () => {
    const { messages, issues } = readFitMessages(bytes);
    expect(issues).toEqual([]);
    const order = messages.map((message) => message.globalMessageNumber).filter((n, i, all) => n !== all[i - 1]);
    // file_id, developer_data_id, field_description, device_info, event, then
    // records split by pause events, then event, lap, session, activity.
    expect(order).toEqual([0, 207, 206, 23, 21, 20, 21, 20, 21, 19, 18, 34]);
  });

  it("declares every native field with the size and base type of Garmin's FIT profile", () => {
    const { messages } = readFitMessages(bytes);
    const mismatches = new Set<string>();
    for (const message of messages) {
      for (const field of message.fields) {
        const expected = PROFILE_FIELDS[message.globalMessageNumber]?.[field.fieldNumber];
        const baseSize = expected && BASE_TYPE_SIZES[expected];
        const ok =
          expected !== undefined &&
          field.baseType === BASE_TYPES[expected] &&
          (baseSize === undefined ? field.size > 0 : field.size === baseSize);
        if (!ok) {
          mismatches.add(`message ${message.globalMessageNumber} field ${field.fieldNumber}: base 0x${field.baseType.toString(16)} size ${field.size}`);
        }
      }
    }
    expect([...mismatches]).toEqual([]);
  });

  it("identifies the file, the app and its devices", () => {
    expect(fit.file_ids).toEqual([
      {
        type: "activity",
        manufacturer: "development",
        product: 0,
        serial_number: input.serialNumber,
        time_created: at(0),
      },
    ]);
    expect(fit.device_infos).toEqual([
      {
        timestamp: at(0),
        device_index: "creator",
        manufacturer: "development",
        product: 0,
        serial_number: input.serialNumber,
        software_version: 0.1,
        product_name: "Wattsmith Web",
      },
      {
        timestamp: at(0),
        device_index: 1,
        manufacturer: "wahoo_fitness",
        source_type: "bluetooth_low_energy",
        product_name: "KICKR CORE 5A1B",
      },
      {
        timestamp: at(0),
        device_index: 2,
        manufacturer: "development",
        source_type: "bluetooth_low_energy",
        product_name: "TICKR 1234",
      },
    ]);
    expect(fit.field_descriptions).toEqual([
      expect.objectContaining({ developer_data_index: 0, field_definition_number: 0, fit_base_type_id: "uint16", field_name: "target_power", units: "watts" }),
    ]);
  });

  it("decodes one record per riding second with every recorded value and no invented zeros", () => {
    const riding = input.rows.filter((row) => !row.paused);
    expect(fit.records).toHaveLength(riding.length);

    let distanceMm = 0;
    riding.forEach((row, i) => {
      const record = fit.records![i] as Message;
      const speedMm = row.power === null ? null : virtualSpeedMmPerSecond(row.power);
      distanceMm += speedMm ?? 0;
      const expected: Message = { timestamp: at(row.t), distance: Math.round(distanceMm / 10) / 100 };
      if (row.power !== null) expected.power = row.power;
      if (row.cadence !== null) expected.cadence = row.cadence;
      if (row.heartRate !== null) expected.heart_rate = row.heartRate;
      if (row.targetWatts !== null) expected.target_power = row.targetWatts;
      if (speedMm !== null) expected.speed = speedMm / 1000;
      expect(record, `second ${row.t}`).toEqual(expected);
    });
  });

  it("stops the timer for the pause and at the end", () => {
    const pausedAt = input.rows.find((row) => row.paused)!.t;
    const resumedAt = input.rows.find((row) => row.t > pausedAt && !row.paused)!.t;
    expect(fit.events).toEqual([
      { timestamp: at(0), event: "timer", event_type: "start" },
      { timestamp: at(pausedAt), event: "timer", event_type: "stop_all" },
      { timestamp: at(resumedAt), event: "timer", event_type: "start" },
      { timestamp: at(input.rows.length), event: "timer", event_type: "stop_all" },
    ]);
  });

  it("writes one lap per ridden segment, bounded by the segment's seconds", () => {
    const runs: RecorderRow[][] = [];
    for (const row of input.rows) {
      if (runs.at(-1)?.[0].segmentIndex === row.segmentIndex) runs.at(-1)!.push(row);
      else runs.push([row]);
    }
    // Warmup, the skipped VO2 on, float, VO2 on, float, the free VO2 on.
    expect(runs.map((run) => run[0].segmentIndex)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(fit.laps).toHaveLength(runs.length);
    runs.forEach((run, i) => {
      expect(fit.laps![i], `lap ${i}`).toEqual({
        ...expectedTotals(run).lap,
        message_index: { value: i, reserved: false, selected: false },
      });
    });
  });

  it("summarizes the session as a Virtual Ride with the recorder's totals", () => {
    const rows = input.rows;
    const lastRecord = fit.records!.at(-1) as Message;
    expect(fit.sessions).toHaveLength(1);
    expect(fit.sessions![0]).not.toHaveProperty("max_cadence");
    expect(fit.sessions![0]).toMatchObject({
      ...expectedTotals(rows).session,
      sport: "cycling",
      sub_sport: "virtual_activity",
      total_distance: lastRecord.distance,
      num_laps: fit.laps!.length,
      first_lap_index: 0,
      // Also what Garmin's FIT SDK reports for the golden file.
      normalized_power: 171,
      event: "session",
      event_type: "stop",
      trigger: "activity_end",
    });
    expect(fit.activity).toMatchObject({
      num_sessions: 1,
      type: "manual",
      event: "activity",
      event_type: "stop",
      total_timer_time: rows.filter((row) => !row.paused).length,
      timestamp: at(rows.length),
    });
  });

  it("is rejected by the decoder when a data byte or the header is corrupted", async () => {
    const data = bytes.slice();
    data[200] ^= 0xff;
    await expect(decode(data)).rejects.toBe("File CRC mismatch");
    expect(() => readFitMessages(data)).toThrow();

    const header = bytes.slice();
    header[4] ^= 0x01;
    await expect(decode(header)).rejects.toBe("Header CRC mismatch");
  });

  it("matches the committed golden file byte for byte", () => {
    const golden = readFileSync(join(process.cwd(), "docs", "ride-fixtures", rideFitFileName(FIT_FIXTURE_WORKOUT_NAME, input.startMs, input.utcOffsetMinutes)));
    expect(Buffer.from(bytes).equals(golden), "run npm run generate:ride-fixtures after an intended change").toBe(true);
  });
});

describe("FIT encoder edge cases", () => {
  const row = (t: number, fields: Partial<RecorderRow> = {}): RecorderRow => ({
    t,
    targetWatts: 150,
    power: 150,
    cadence: 90,
    heartRate: 130,
    segmentIndex: 0,
    ergEnabled: true,
    paused: false,
    ...fields,
  });
  const base = { startMs: FIT_FIXTURE_START_MS, utcOffsetMinutes: 0, serialNumber: 1, softwareVersion: 0.1 };

  it("encodes a ride with no sensor data and no optional devices", async () => {
    const rows = [0, 1, 2].map((t) => row(t, { power: null, cadence: null, heartRate: null, targetWatts: null }));
    const fit = await decode(encodeRideFit({ ...base, rows }));
    expect(fit.records).toEqual(rows.map((r) => ({ timestamp: at(r.t), distance: 0 })));
    expect(fit.device_infos).toHaveLength(1);
    expect(fit.sessions![0]).not.toHaveProperty("avg_power");
    expect(fit.sessions![0]).not.toHaveProperty("normalized_power");
  });

  it("ends on the pause's own timer stop when the ride finishes paused", async () => {
    const rows = [row(0), row(1), row(2, { paused: true }), row(3, { paused: true })];
    const fit = await decode(encodeRideFit({ ...base, rows }));
    expect(fit.records).toHaveLength(2);
    expect(fit.events!.map((event) => event.event_type)).toEqual(["start", "stop_all"]);
    expect(fit.sessions![0]).toMatchObject({ total_elapsed_time: 4, total_timer_time: 2 });
  });

  it("tags only trainers named KICKR as Wahoo", async () => {
    const fit = await decode(encodeRideFit({ ...base, rows: [row(0)], trainerName: "kickr-clone" }));
    expect(fit.device_infos![1]).toMatchObject({ manufacturer: "development", product_name: "kickr-clone" });
  });

  it("keeps the timer running across a skip", async () => {
    const workout = exportTestFixtures.find((fixture) => fixture.name === FIT_FIXTURE_WORKOUT_NAME)!;
    const harness = createRideHarness({ workout, ftp: workout.ftp });
    await harness.start();
    harness.advance(60_000);
    harness.command("skip");
    harness.advance(60_000);
    harness.command("stop");
    const rows = harness.state.recorder.rows;
    expect(new Set(rows.map((r) => r.segmentIndex)).size).toBe(2);

    const fit = await decode(encodeRideFit({ ...base, rows }));
    expect(fit.events!.map((event) => event.event_type)).toEqual(["start", "stop_all"]);
    expect(fit.records).toHaveLength(rows.length);
    expect(fit.sessions![0]).toMatchObject({ total_elapsed_time: rows.length, total_timer_time: rows.length });
  });

  it("indexes at most 4,096 laps and folds the rest of the ride into the last one", async () => {
    const oneLapPerSecond = (count: number) => Array.from({ length: count }, (_, t) => row(t, { segmentIndex: t }));

    const full = await decode(encodeRideFit({ ...base, rows: oneLapPerSecond(4096) }));
    expect(full.laps).toHaveLength(4096);
    expect(full.laps!.at(-1)).toMatchObject({ message_index: { value: 4095, reserved: false }, total_elapsed_time: 1 });

    // 4,097 would need message_index 4096, which FIT's 12 index bits cannot hold.
    const over = await decode(encodeRideFit({ ...base, rows: oneLapPerSecond(4097) }));
    expect(over.laps).toHaveLength(4096);
    expect(over.laps!.every((lap, i) => (lap.message_index as unknown as { value: number; reserved: boolean }).value === i)).toBe(true);
    expect(over.laps!.at(-1)).toMatchObject({
      message_index: { value: 4095, reserved: false },
      start_time: at(4095),
      total_elapsed_time: 2,
    });
    expect(over.sessions![0]).toMatchObject({ num_laps: 4096, total_elapsed_time: 4097 });
    expect(over.records).toHaveLength(4097);
  });

  it("writes no normalized power from sparse power data", async () => {
    // 600 riding seconds with a 200 W reading every 20 s: 5 % coverage.
    const rows = Array.from({ length: 600 }, (_, t) => row(t, { power: t % 20 === 0 ? 200 : null }));
    const fit = await decode(encodeRideFit({ ...base, rows }));
    expect(fit.sessions![0]).toMatchObject({ avg_power: 200, total_timer_time: 600 });
    expect(fit.sessions![0]).not.toHaveProperty("normalized_power");
  });

  it("keeps only printable ASCII in device names", async () => {
    const fit = await decode(encodeRideFit({ ...base, rows: [row(0)], trainerName: "KICKR CORE ☆ 1" }));
    expect(fit.device_infos![1]).toMatchObject({ manufacturer: "wahoo_fitness", product_name: "KICKR CORE  1" });
  });

  it("refuses an empty ride", () => {
    expect(() => encodeRideFit({ ...base, rows: [] })).toThrow("at least one recorded second");
  });
});

describe("FIT summary helpers", () => {
  it("derives a flat-road virtual speed that rises with power", () => {
    expect(virtualSpeedMmPerSecond(0)).toBe(0);
    const speeds = [100, 200, 300].map(virtualSpeedMmPerSecond);
    expect(speeds[0]).toBeLessThan(speeds[1]);
    expect(speeds[1]).toBeLessThan(speeds[2]);
    // About 34 km/h at 200 W.
    expect(speeds[1] * 3.6e-3).toBeCloseTo(34, 0);
  });

  // Expected values are worked by hand, not by the production helper.
  it("computes normalized power over 30-second rolling means", () => {
    expect(normalizedPower([Array(29).fill(200)])).toBeNull();
    expect(normalizedPower([Array(60).fill(200)])).toBe(200);
    // Every window has 5 or fewer gaps, so each averages 200 over its readings.
    expect(normalizedPower([Array.from({ length: 120 }, (_, i) => (i % 6 === 0 ? null : 200))])).toBe(200);
    // One hard and one easy minute: 31 windows at 300 W, 31 at 100 W and 29
    // mixed ones (k/30 * 300 + (30-k)/30 * 100 for k = 1..29), so
    // NP = ((31 * 300^4 + 31 * 100^4 + sum of the mixed fourth powers) / 91)^(1/4).
    expect(normalizedPower([[...Array(60).fill(300), ...Array(60).fill(100)]])).toBe(244);
  });

  it("skips windows under 24 of 30 readings instead of closing up the gaps", () => {
    // One reading every 20 s: no window qualifies.
    expect(normalizedPower([Array.from({ length: 600 }, (_, i) => (i % 20 === 0 ? 200 : null))])).toBeNull();
    // 2 minutes at 300 W, a 10-minute outage, 2 minutes at 100 W. 97 windows
    // each side qualify (91 full plus 6 with up to 6 gaps), none mixes the two,
    // so NP = ((300^4 + 100^4) / 2)^(1/4) = 253.
    expect(normalizedPower([[...Array(120).fill(300), ...Array(600).fill(null), ...Array(120).fill(100)]])).toBe(253);
  });

  it("never runs a window across a pause", () => {
    // Joined, the two stretches would give the mixed windows above (244 W).
    expect(normalizedPower([Array(60).fill(300), Array(60).fill(100)])).toBe(253);
  });
});

describe("ride FIT file name", () => {
  it("names the file after the workout and the rider's local date", () => {
    // 2026-09-28 02:00 UTC is still the 27th in UTC-5.
    const startMs = Date.UTC(2026, 8, 28, 2, 0, 0);
    expect(rideFitFileName("Sweet Spot 3x12!", startMs, -300)).toBe("wattsmith_sweet_spot_3x12_2026-09-27.fit");
    expect(rideFitFileName("Sweet Spot 3x12!", startMs, 0)).toBe("wattsmith_sweet_spot_3x12_2026-09-28.fit");
    expect(rideFitFileName("  ", startMs, 0)).toBe("wattsmith_ride_2026-09-28.fit");
  });
});
