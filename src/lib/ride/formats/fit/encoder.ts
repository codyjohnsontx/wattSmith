import { FitWriter, fit_messages } from "@markw65/fit-file-writer";
import type { UserMessageMap } from "@markw65/fit-file-writer";
import type { RecorderRow } from "@/lib/ride/engine/types";
import { summarizeRide } from "./summary";
import type { FitTotals } from "./summary";

// Encodes a recorded ride as a FIT activity that Strava shows as a Virtual
// Ride (sport cycling, sub-sport virtual_activity). Message order follows
// Garmin's activity recipe. The writer library stays behind this file so it
// can be swapped; it computes the header and file CRCs.

export interface FitRideInput {
  // Wall-clock time of ride second 0, in epoch milliseconds.
  startMs: number;
  // Local offset from UTC, for the activity's local timestamp.
  utcOffsetMinutes: number;
  rows: RecorderRow[];
  // Stable per browser; FIT has no registered manufacturer ID for Wattsmith.
  serialNumber: number;
  // Wattsmith version, e.g. 0.1 for 0.1.0 (FIT keeps hundredths).
  softwareVersion: number;
  trainerName?: string;
  heartRateMonitorName?: string;
}

// Identifies the developer field below; a fixed random UUID for Wattsmith.
const APPLICATION_ID = [
  0x5b, 0x8e, 0x2f, 0x71, 0x0c, 0x4d, 0x4a, 0x93, 0x9e, 0x16, 0x3d, 0xa2, 0x57, 0xc4, 0x80, 0x1f,
];
const TARGET_POWER_FIELD = 0;
// FIT base type id of an endian-aware uint16.
const FIT_BASE_TYPE_UINT16 = 0x84;

// The writer declares any named type that fits in a byte as enum, but
// Garmin's profile gives these two fields base type uint8.
const PROFILE_BASE_TYPES = {
  device_info: { fields: { device_index: { ...fit_messages.device_info.fields.device_index, type: "uint8" } } },
  field_description: {
    fields: { fit_base_type_id: { ...fit_messages.field_description.fields.fit_base_type_id, type: "uint8" } },
  },
} satisfies UserMessageMap;
const CREATOR_DEVICE_INDEX = 0;
const TRAINER_DEVICE_INDEX = 1;
const HEART_RATE_DEVICE_INDEX = 2;

// The writer multiplies by the field's scale and then truncates, so 0.29 m
// comes out as 28 cm. Passing the midpoint of the wanted integer step makes
// the truncation land on it exactly.
function scaled(units: number, scale: number): number {
  return (units + 0.5) / scale;
}

// FIT strings are null-terminated bytes and the writer writes one byte per
// UTF-16 unit, so keep printable ASCII only.
function fitString(value: string): string {
  return `${value.replace(/[^\x20-\x7e]/g, "").trim()}\0`;
}

function optional(value: number | null): number | undefined {
  return value === null ? undefined : value;
}

function summaryFields(summary: FitTotals, startSeconds: number) {
  return {
    timestamp: startSeconds + summary.endT,
    start_time: startSeconds + summary.startT,
    total_elapsed_time: scaled((summary.endT - summary.startT) * 1000, 1000),
    total_timer_time: scaled(summary.timerSeconds * 1000, 1000),
    total_distance: scaled(summary.distanceCm, 100),
    avg_power: optional(summary.avgPower),
    max_power: optional(summary.maxPower),
    avg_cadence: optional(summary.avgCadence),
    max_cadence: optional(summary.maxCadence),
    avg_heart_rate: optional(summary.avgHeartRate),
    max_heart_rate: optional(summary.maxHeartRate),
    total_work: optional(summary.totalWork),
    sport: "cycling" as const,
    sub_sport: "virtual_activity" as const,
  };
}

export function encodeRideFit(input: FitRideInput): Uint8Array<ArrayBuffer> {
  const summary = summarizeRide(input.rows);
  const writer = new FitWriter({ noCompressedTimestamps: true });
  const startSeconds = writer.time(input.startMs);
  const at = (t: number) => startSeconds + t;
  const endSeconds = at(summary.session.endT);

  writer.writeMessage(
    "file_id",
    {
      type: "activity",
      manufacturer: "development",
      product: 0,
      serial_number: input.serialNumber,
      time_created: startSeconds,
    },
    null,
    true,
  );
  writer.writeMessage("developer_data_id", { developer_data_index: 0, application_id: APPLICATION_ID }, null, true);
  writer.writeCustomMessage(
    PROFILE_BASE_TYPES,
    "field_description",
    {
      developer_data_index: 0,
      field_definition_number: TARGET_POWER_FIELD,
      fit_base_type_id: FIT_BASE_TYPE_UINT16,
      field_name: fitString("target_power"),
      units: fitString("watts"),
    },
    null,
    true,
  );

  writer.writeCustomMessage(
    PROFILE_BASE_TYPES,
    "device_info",
    {
      timestamp: startSeconds,
      device_index: CREATOR_DEVICE_INDEX,
      manufacturer: "development",
      product: 0,
      serial_number: input.serialNumber,
      software_version: scaled(Math.round(input.softwareVersion * 100), 100),
      product_name: fitString("Wattsmith Web"),
    },
    null,
    true,
  );
  if (input.trainerName) {
    writer.writeCustomMessage(
      PROFILE_BASE_TYPES,
      "device_info",
      {
        timestamp: startSeconds,
        device_index: TRAINER_DEVICE_INDEX,
        manufacturer: input.trainerName.startsWith("KICKR") ? "wahoo_fitness" : "development",
        source_type: "bluetooth_low_energy",
        product_name: fitString(input.trainerName),
      },
      null,
      true,
    );
  }
  if (input.heartRateMonitorName) {
    writer.writeCustomMessage(
      PROFILE_BASE_TYPES,
      "device_info",
      {
        timestamp: startSeconds,
        device_index: HEART_RATE_DEVICE_INDEX,
        manufacturer: "development",
        source_type: "bluetooth_low_energy",
        product_name: fitString(input.heartRateMonitorName),
      },
      null,
      true,
    );
  }

  writer.writeMessage("event", { timestamp: startSeconds, event: "timer", event_type: "start" });
  const timerEvents = [...summary.timerEvents];
  for (const record of summary.records) {
    while (timerEvents.length > 0 && timerEvents[0].t <= record.t) {
      const event = timerEvents.shift()!;
      writer.writeMessage("event", { timestamp: at(event.t), event: "timer", event_type: event.type });
    }
    // Unknown values are omitted, never written as 0, so averages stay honest.
    writer.writeMessage(
      "record",
      {
        timestamp: at(record.t),
        power: optional(record.power),
        cadence: optional(record.cadence),
        heart_rate: optional(record.heartRate),
        speed: record.speedMmPerSecond === null ? undefined : scaled(record.speedMmPerSecond, 1000),
        distance: scaled(record.distanceCm, 100),
      },
      record.targetWatts === null ? null : [{ field_num: TARGET_POWER_FIELD, value: record.targetWatts }],
    );
  }
  for (const event of timerEvents) {
    writer.writeMessage("event", { timestamp: at(event.t), event: "timer", event_type: event.type });
  }
  if (timerEvents.at(-1)?.type !== "stop_all") {
    writer.writeMessage("event", { timestamp: endSeconds, event: "timer", event_type: "stop_all" }, null, true);
  }

  summary.laps.forEach((lap, index) => {
    writer.writeMessage(
      "lap",
      { message_index: { value: index }, event: "lap", event_type: "stop", lap_trigger: "manual", ...summaryFields(lap, startSeconds) },
      null,
      index === summary.laps.length - 1,
    );
  });

  writer.writeMessage(
    "session",
    {
      message_index: { value: 0 },
      event: "session",
      event_type: "stop",
      trigger: "activity_end",
      first_lap_index: 0,
      num_laps: summary.laps.length,
      normalized_power: optional(summary.session.normalizedPower),
      ...summaryFields(summary.session, startSeconds),
    },
    null,
    true,
  );

  writer.writeMessage(
    "activity",
    {
      timestamp: endSeconds,
      local_timestamp: endSeconds + input.utcOffsetMinutes * 60,
      total_timer_time: scaled(summary.session.timerSeconds * 1000, 1000),
      num_sessions: 1,
      type: "manual",
      event: "activity",
      event_type: "stop",
    },
    null,
    true,
  );

  const data = writer.finish();
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}
