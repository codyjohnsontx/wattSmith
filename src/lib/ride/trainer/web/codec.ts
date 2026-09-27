// Pure byte codecs for the Bluetooth characteristics a smart trainer and a
// heart rate strap expose. No Web Bluetooth, DOM or timers here: every function
// takes a DataView or numbers and returns plain data, so the same file can back
// a phone app and is tested against committed byte fixtures.
//
// Layouts follow the Bluetooth SIG specifications:
// - Fitness Machine Service v1.0 (FTMS): Feature 4.3, Indoor Bike Data 4.9,
//   Supported Power Range 4.14, Control Point 4.16, Status 4.17.
// - GATT Specification Supplement (GSS) YAML for Indoor Bike Data,
//   Cycling Power Measurement, Heart Rate Measurement and Supported Power Range.
// All multi-octet fields are little endian.
// The Wahoo proprietary trainer characteristic is not a SIG specification; its
// encoders are at the end of this file and are unverified on hardware.

export class CodecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CodecError";
  }
}

// A bounds-checked little-endian reader.
class Reader {
  offset = 0;
  constructor(
    private readonly view: DataView,
    private readonly characteristic: string,
  ) {}

  get remaining(): number {
    return this.view.byteLength - this.offset;
  }

  private need(bytes: number, field: string): void {
    if (this.remaining < bytes) {
      throw new CodecError(
        `${this.characteristic}: ${field} needs ${bytes} byte(s) at offset ${this.offset}, ${this.remaining} left`,
      );
    }
  }

  uint8(field: string): number {
    this.need(1, field);
    return this.view.getUint8(this.offset++);
  }

  uint16(field: string): number {
    this.need(2, field);
    const value = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return value;
  }

  sint16(field: string): number {
    this.need(2, field);
    const value = this.view.getInt16(this.offset, true);
    this.offset += 2;
    return value;
  }

  uint24(field: string): number {
    this.need(3, field);
    const value = this.view.getUint16(this.offset, true) + (this.view.getUint8(this.offset + 2) << 16);
    this.offset += 3;
    return value;
  }

  uint32(field: string): number {
    this.need(4, field);
    const value = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return value;
  }

  skip(bytes: number, field: string): void {
    this.need(bytes, field);
    this.offset += bytes;
  }
}

const bit = (flags: number, n: number) => (flags & (1 << n)) !== 0;

// Hex helpers -----------------------------------------------------------------

export function toHex(view: DataView): string {
  const parts: string[] = [];
  for (let i = 0; i < view.byteLength; i++) parts.push(view.getUint8(i).toString(16).padStart(2, "0"));
  return parts.join(" ");
}

// Accepts "01 02 ff", "0102ff" or "01-02-FF".
export function fromHex(hex: string): DataView {
  const clean = hex.replace(/[\s:-]/g, "");
  if (clean.length % 2 !== 0 || /[^0-9a-f]/i.test(clean)) throw new CodecError(`Invalid hex string: "${hex}"`);
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return new DataView(bytes.buffer);
}

function bytesView(bytes: number[]): DataView {
  return new DataView(Uint8Array.from(bytes).buffer);
}

// Indoor Bike Data (0x2AD2) ------------------------------------------------------

export interface IndoorBikeData {
  // More Data (flags bit 0): this notification is part of a split data record
  // and carries no Instantaneous Speed field.
  moreData: boolean;
  speedKmh?: number;
  averageSpeedKmh?: number;
  cadenceRpm?: number;
  averageCadenceRpm?: number;
  totalDistanceMeters?: number;
  resistanceLevel?: number;
  powerWatts?: number;
  averagePowerWatts?: number;
  // Energy fields use the spec's "data not available" sentinels (0xFFFF, 0xFF);
  // those come back as undefined.
  totalEnergyKcal?: number;
  energyPerHourKcal?: number;
  energyPerMinuteKcal?: number;
  heartRateBpm?: number;
  metabolicEquivalent?: number;
  elapsedSeconds?: number;
  remainingSeconds?: number;
}

// Resistance Level is sint16 in the characteristic definition published with
// FTMS v1.0 (and in the open-source parsers written against it, e.g.
// pycycling), but uint8 in the current GSS. The two layouts differ by one byte, so the
// payload length picks the width; v1.0's sint16 wins when neither fits exactly.
export function decodeIndoorBikeData(view: DataView): IndoorBikeData {
  const flags = new Reader(view, "Indoor Bike Data").uint16("Flags");
  if (bit(flags, 5)) {
    for (const width of [2, 1] as const) {
      try {
        return readIndoorBikeData(view, width, true);
      } catch {
        // Try the other width.
      }
    }
  }
  return readIndoorBikeData(view, 2);
}

function readIndoorBikeData(view: DataView, resistanceWidth: 1 | 2, exact = false): IndoorBikeData {
  const r = new Reader(view, "Indoor Bike Data");
  const flags = r.uint16("Flags");
  const data: IndoorBikeData = { moreData: bit(flags, 0) };

  // Bit 0 is inverted: speed is present when More Data is 0.
  if (!bit(flags, 0)) data.speedKmh = r.uint16("Instantaneous Speed") / 100;
  if (bit(flags, 1)) data.averageSpeedKmh = r.uint16("Average Speed") / 100;
  if (bit(flags, 2)) data.cadenceRpm = r.uint16("Instantaneous Cadence") / 2;
  if (bit(flags, 3)) data.averageCadenceRpm = r.uint16("Average Cadence") / 2;
  if (bit(flags, 4)) data.totalDistanceMeters = r.uint24("Total Distance");
  if (bit(flags, 5)) {
    data.resistanceLevel = resistanceWidth === 2 ? r.sint16("Resistance Level") : r.uint8("Resistance Level");
  }
  if (bit(flags, 6)) data.powerWatts = r.sint16("Instantaneous Power");
  if (bit(flags, 7)) data.averagePowerWatts = r.sint16("Average Power");
  if (bit(flags, 8)) {
    const total = r.uint16("Total Energy");
    const perHour = r.uint16("Energy Per Hour");
    const perMinute = r.uint8("Energy Per Minute");
    if (total !== 0xffff) data.totalEnergyKcal = total;
    if (perHour !== 0xffff) data.energyPerHourKcal = perHour;
    if (perMinute !== 0xff) data.energyPerMinuteKcal = perMinute;
  }
  if (bit(flags, 9)) data.heartRateBpm = r.uint8("Heart Rate");
  if (bit(flags, 10)) data.metabolicEquivalent = r.uint8("Metabolic Equivalent") / 10;
  if (bit(flags, 11)) data.elapsedSeconds = r.uint16("Elapsed Time");
  if (bit(flags, 12)) data.remainingSeconds = r.uint16("Remaining Time");
  if (exact && r.remaining !== 0) throw new CodecError(`Indoor Bike Data: ${r.remaining} trailing byte(s)`);
  return data;
}

// Cycling Power Measurement (0x2A63) ---------------------------------------------

export interface WheelRevolutionData {
  cumulativeRevolutions: number;
  // Unit 1/2048 s, rolls over at 65536.
  lastEventTime2048: number;
}

export interface CrankRevolutionData {
  // Rolls over at 65536.
  cumulativeRevolutions: number;
  // Unit 1/1024 s, rolls over at 65536.
  lastEventTime1024: number;
}

export interface CyclingPowerMeasurement {
  powerWatts: number;
  // Percent, resolution 0.5.
  pedalPowerBalancePercent?: number;
  accumulatedTorqueNm?: number;
  wheel?: WheelRevolutionData;
  crank?: CrankRevolutionData;
  accumulatedEnergyKj?: number;
}

export function decodeCyclingPowerMeasurement(view: DataView): CyclingPowerMeasurement {
  const r = new Reader(view, "Cycling Power Measurement");
  const flags = r.uint16("Flags");
  const data: CyclingPowerMeasurement = { powerWatts: r.sint16("Instantaneous Power") };

  if (bit(flags, 0)) data.pedalPowerBalancePercent = r.uint8("Pedal Power Balance") / 2;
  if (bit(flags, 2)) data.accumulatedTorqueNm = r.uint16("Accumulated Torque") / 32;
  if (bit(flags, 4)) {
    data.wheel = {
      cumulativeRevolutions: r.uint32("Cumulative Wheel Revolutions"),
      lastEventTime2048: r.uint16("Last Wheel Event Time"),
    };
  }
  if (bit(flags, 5)) {
    data.crank = {
      cumulativeRevolutions: r.uint16("Cumulative Crank Revolutions"),
      lastEventTime1024: r.uint16("Last Crank Event Time"),
    };
  }
  // The remaining fields are skipped only to reach Accumulated Energy.
  if (bit(flags, 6)) r.skip(4, "Extreme Force Magnitudes");
  if (bit(flags, 7)) r.skip(4, "Extreme Torque Magnitudes");
  if (bit(flags, 8)) r.skip(3, "Extreme Angles");
  if (bit(flags, 9)) r.skip(2, "Top Dead Spot Angle");
  if (bit(flags, 10)) r.skip(2, "Bottom Dead Spot Angle");
  if (bit(flags, 11)) data.accumulatedEnergyKj = r.uint16("Accumulated Energy");
  return data;
}

// Cadence from two consecutive crank revolution readings, handling the uint16
// rollover of both counters. Returns null when no new crank event happened
// between the readings (the event time did not move), which is how a sensor
// reports "no new revolution yet"; the caller decides when that means 0 rpm.
export function crankCadenceRpm(previous: CrankRevolutionData, next: CrankRevolutionData): number | null {
  const revolutions = (next.cumulativeRevolutions - previous.cumulativeRevolutions + 0x10000) % 0x10000;
  const ticks = (next.lastEventTime1024 - previous.lastEventTime1024 + 0x10000) % 0x10000;
  if (ticks === 0) return null;
  return (revolutions * 60 * 1024) / ticks;
}

// Cycling Power Feature (0x2A65) ---------------------------------------------------

export interface CyclingPowerFeature {
  raw: number;
  wheelRevolutionData: boolean;
  crankRevolutionData: boolean;
}

export function decodeCyclingPowerFeature(view: DataView): CyclingPowerFeature {
  const raw = new Reader(view, "Cycling Power Feature").uint32("Cycling Power Feature");
  return { raw, wheelRevolutionData: bit(raw, 2), crankRevolutionData: bit(raw, 3) };
}

// Heart Rate Measurement (0x2A37) --------------------------------------------------

export interface HeartRateMeasurement {
  heartRateBpm: number;
  // Undefined when the strap does not support contact detection.
  sensorContact?: boolean;
  energyExpended?: number;
  // Oldest first, in milliseconds (the wire unit is 1/1024 s).
  rrIntervalsMs: number[];
}

export function decodeHeartRateMeasurement(view: DataView): HeartRateMeasurement {
  const r = new Reader(view, "Heart Rate Measurement");
  const flags = r.uint8("Flags");
  const heartRateBpm = bit(flags, 0) ? r.uint16("Heart Rate (uint16)") : r.uint8("Heart Rate (uint8)");
  const data: HeartRateMeasurement = { heartRateBpm, rrIntervalsMs: [] };
  if (bit(flags, 2)) data.sensorContact = bit(flags, 1);
  if (bit(flags, 3)) data.energyExpended = r.uint16("Energy Expended");
  if (bit(flags, 4)) {
    if (r.remaining % 2 !== 0) throw new CodecError("Heart Rate Measurement: odd RR-Interval byte count");
    while (r.remaining > 0) data.rrIntervalsMs.push((r.uint16("RR-Interval") * 1000) / 1024);
  }
  return data;
}

// Fitness Machine Feature (0x2ACC) -------------------------------------------------

export const machineFeatureBits = {
  averageSpeed: 0,
  cadence: 1,
  totalDistance: 2,
  inclination: 3,
  elevationGain: 4,
  pace: 5,
  stepCount: 6,
  resistanceLevel: 7,
  strideCount: 8,
  expendedEnergy: 9,
  heartRateMeasurement: 10,
  metabolicEquivalent: 11,
  elapsedTime: 12,
  remainingTime: 13,
  powerMeasurement: 14,
  forceOnBeltAndPowerOutput: 15,
  userDataRetention: 16,
} as const;

export const targetSettingFeatureBits = {
  speed: 0,
  inclination: 1,
  resistance: 2,
  power: 3,
  heartRate: 4,
  targetedExpendedEnergy: 5,
  targetedStepNumber: 6,
  targetedStrideNumber: 7,
  targetedDistance: 8,
  targetedTrainingTime: 9,
  targetedTimeInTwoHeartRateZones: 10,
  targetedTimeInThreeHeartRateZones: 11,
  targetedTimeInFiveHeartRateZones: 12,
  indoorBikeSimulation: 13,
  wheelCircumference: 14,
  spinDownControl: 15,
  targetedCadence: 16,
} as const;

export type MachineFeatures = Record<keyof typeof machineFeatureBits, boolean>;
export type TargetSettingFeatures = Record<keyof typeof targetSettingFeatureBits, boolean>;

export interface FitnessMachineFeature {
  machineRaw: number;
  targetRaw: number;
  machine: MachineFeatures;
  target: TargetSettingFeatures;
}

function expandBits<T extends Record<string, number>>(raw: number, bits: T): Record<keyof T, boolean> {
  const result = {} as Record<keyof T, boolean>;
  for (const key of Object.keys(bits) as (keyof T)[]) result[key] = ((raw >>> bits[key]) & 1) === 1;
  return result;
}

export function decodeFitnessMachineFeature(view: DataView): FitnessMachineFeature {
  const r = new Reader(view, "Fitness Machine Feature");
  const machineRaw = r.uint32("Fitness Machine Features");
  const targetRaw = r.uint32("Target Setting Features");
  return {
    machineRaw,
    targetRaw,
    machine: expandBits(machineRaw, machineFeatureBits),
    target: expandBits(targetRaw, targetSettingFeatureBits),
  };
}

// Supported Power Range (0x2AD8) ---------------------------------------------------

export interface SupportedPowerRange {
  minWatts: number;
  maxWatts: number;
  incrementWatts: number;
}

export function decodeSupportedPowerRange(view: DataView): SupportedPowerRange {
  const r = new Reader(view, "Supported Power Range");
  return {
    minWatts: r.sint16("Minimum Power"),
    maxWatts: r.sint16("Maximum Power"),
    incrementWatts: r.uint16("Minimum Increment"),
  };
}

// Fitness Machine Control Point (0x2AD9) -----------------------------------------

export const ControlOpCode = {
  requestControl: 0x00,
  reset: 0x01,
  setTargetResistanceLevel: 0x04,
  setTargetPower: 0x05,
  startOrResume: 0x07,
  stopOrPause: 0x08,
  setIndoorBikeSimulation: 0x11,
  responseCode: 0x80,
} as const;

export const ControlResultCode = {
  success: 0x01,
  opCodeNotSupported: 0x02,
  invalidParameter: 0x03,
  operationFailed: 0x04,
  controlNotPermitted: 0x05,
} as const;

export type ControlResult = keyof typeof ControlResultCode | "unknown";

export const controlOpCodeNames: Record<number, string> = {
  0x00: "Request Control",
  0x01: "Reset",
  0x02: "Set Target Speed",
  0x03: "Set Target Inclination",
  0x04: "Set Target Resistance Level",
  0x05: "Set Target Power",
  0x06: "Set Target Heart Rate",
  0x07: "Start or Resume",
  0x08: "Stop or Pause",
  0x11: "Set Indoor Bike Simulation Parameters",
  0x12: "Set Wheel Circumference",
  0x13: "Spin Down Control",
  0x14: "Set Targeted Cadence",
};

const SINT16_MIN = -0x8000;
const SINT16_MAX = 0x7fff;

function sint16Bytes(value: number): [number, number] {
  const clamped = Math.min(SINT16_MAX, Math.max(SINT16_MIN, Math.round(value)));
  const unsigned = clamped & 0xffff;
  return [unsigned & 0xff, unsigned >> 8];
}

export const encodeRequestControl = (): DataView => bytesView([ControlOpCode.requestControl]);
export const encodeReset = (): DataView => bytesView([ControlOpCode.reset]);
export const encodeStartOrResume = (): DataView => bytesView([ControlOpCode.startOrResume]);

// Control Information parameter: 0x01 stop, 0x02 pause (FTMS Table 4.16).
export function encodeStopOrPause(action: "stop" | "pause"): DataView {
  return bytesView([ControlOpCode.stopOrPause, action === "stop" ? 0x01 : 0x02]);
}

// Target Power: sint16 watts, resolution 1 W. Values outside sint16 saturate.
export function encodeSetTargetPower(watts: number): DataView {
  return bytesView([ControlOpCode.setTargetPower, ...sint16Bytes(watts)]);
}

export interface IndoorBikeSimulation {
  windSpeedMps: number;
  gradePercent: number;
  // Coefficient of rolling resistance, unitless.
  crr: number;
  // Wind resistance coefficient, kg/m.
  cw: number;
}

// Wind sint16 at 0.001 m/s, grade sint16 at 0.01 %, Crr uint8 at 0.0001,
// Cw uint8 at 0.01 kg/m (FTMS Table 4.20).
export function encodeSetIndoorBikeSimulation(sim: IndoorBikeSimulation): DataView {
  const uint8 = (value: number) => Math.min(0xff, Math.max(0, Math.round(value)));
  return bytesView([
    ControlOpCode.setIndoorBikeSimulation,
    ...sint16Bytes(sim.windSpeedMps * 1000),
    ...sint16Bytes(sim.gradePercent * 100),
    uint8(sim.crr * 10000),
    uint8(sim.cw * 100),
  ]);
}

// Flat road: what the trainer layer sends to leave ERG for free riding.
export const flatRoadSimulation: IndoorBikeSimulation = { windSpeedMps: 0, gradePercent: 0, crr: 0.004, cw: 0.51 };

export interface ControlPointResponse {
  requestOpCode: number;
  resultCode: number;
  result: ControlResult;
  // Response Parameter bytes, present only for Spin Down.
  parameter: number[];
}

const resultByCode = new Map<number, ControlResult>(
  (Object.entries(ControlResultCode) as [ControlResult, number][]).map(([name, code]) => [code, name]),
);

export function decodeControlPointResponse(view: DataView): ControlPointResponse {
  const r = new Reader(view, "Fitness Machine Control Point");
  const responseCode = r.uint8("Response Code");
  if (responseCode !== ControlOpCode.responseCode) {
    throw new CodecError(
      `Fitness Machine Control Point: expected response op code 0x80, got 0x${responseCode.toString(16).padStart(2, "0")}`,
    );
  }
  const requestOpCode = r.uint8("Request Op Code");
  const resultCode = r.uint8("Result Code");
  const parameter: number[] = [];
  while (r.remaining > 0) parameter.push(r.uint8("Response Parameter"));
  return { requestOpCode, resultCode, result: resultByCode.get(resultCode) ?? "unknown", parameter };
}

// Fitness Machine Status (0x2ADA) ----------------------------------------------------

export type FitnessMachineStatus =
  | { type: "reset" }
  | { type: "stoppedOrPausedByUser"; action: "stop" | "pause" | "unknown" }
  | { type: "stoppedBySafetyKey" }
  | { type: "startedOrResumedByUser" }
  | { type: "targetResistanceChanged"; level: number }
  | { type: "targetPowerChanged"; watts: number }
  | { type: "indoorBikeSimulationChanged"; simulation: IndoorBikeSimulation }
  | { type: "spinDownStatus"; status: number }
  | { type: "controlPermissionLost" }
  | { type: "other"; opCode: number; parameter: number[] };

export function decodeFitnessMachineStatus(view: DataView): FitnessMachineStatus {
  const r = new Reader(view, "Fitness Machine Status");
  const opCode = r.uint8("Op Code");
  switch (opCode) {
    case 0x01:
      return { type: "reset" };
    case 0x02: {
      const info = r.uint8("Control Information");
      return { type: "stoppedOrPausedByUser", action: info === 0x01 ? "stop" : info === 0x02 ? "pause" : "unknown" };
    }
    case 0x03:
      return { type: "stoppedBySafetyKey" };
    case 0x04:
      return { type: "startedOrResumedByUser" };
    case 0x07:
      return { type: "targetResistanceChanged", level: r.uint8("New Target Resistance Level") / 10 };
    case 0x08:
      return { type: "targetPowerChanged", watts: r.sint16("New Target Power") };
    case 0x12:
      return {
        type: "indoorBikeSimulationChanged",
        simulation: {
          windSpeedMps: r.sint16("Wind Speed") / 1000,
          gradePercent: r.sint16("Grade") / 100,
          crr: r.uint8("Crr") / 10000,
          cw: r.uint8("Cw") / 100,
        },
      };
    case 0x14:
      return { type: "spinDownStatus", status: r.uint8("Spin Down Status") };
    case 0xff:
      return { type: "controlPermissionLost" };
    default: {
      const parameter: number[] = [];
      while (r.remaining > 0) parameter.push(r.uint8("Parameter"));
      return { type: "other", opCode, parameter };
    }
  }
}

// Wahoo proprietary trainer characteristic (fallback, off by default) -------------
//
// Not a SIG specification. Op codes as documented by open-source trainer apps
// (GoldenCheetah, qdomyos-zwift, KickrShiftr): 0x20 unlock with payload EE FC,
// 0x42 ERG with a uint16 little-endian watts target. Unverified on the owner's
// KICKR CORE; see docs/hardware-testing.md.

export const WahooOpCode = {
  unlock: 0x20,
  setResistanceMode: 0x40,
  setStandardMode: 0x41,
  setErgMode: 0x42,
  setSimMode: 0x43,
} as const;

export const encodeWahooUnlock = (): DataView => bytesView([WahooOpCode.unlock, 0xee, 0xfc]);

export function encodeWahooSetErg(watts: number): DataView {
  const value = Math.min(0xffff, Math.max(0, Math.round(watts)));
  return bytesView([WahooOpCode.setErgMode, value & 0xff, value >> 8]);
}

export const encodeWahooStandardMode = (): DataView => bytesView([WahooOpCode.setStandardMode]);

// Decoders by characteristic name: the diagnostics log and the capture
// fixtures name characteristics this way.
export const characteristicDecoders = {
  indoorBikeData: decodeIndoorBikeData,
  cyclingPowerMeasurement: decodeCyclingPowerMeasurement,
  cyclingPowerFeature: decodeCyclingPowerFeature,
  heartRateMeasurement: decodeHeartRateMeasurement,
  fitnessMachineFeature: decodeFitnessMachineFeature,
  supportedPowerRange: decodeSupportedPowerRange,
  controlPointResponse: decodeControlPointResponse,
  fitnessMachineStatus: decodeFitnessMachineStatus,
} as const;

export type CharacteristicName = keyof typeof characteristicDecoders;
