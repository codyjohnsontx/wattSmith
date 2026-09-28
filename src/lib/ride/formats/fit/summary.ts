import type { RecorderRow } from "@/lib/ride/engine/types";

// Library-free ride summary for the FIT encoder: per-second records with a
// virtual speed and distance, laps per workout segment and session totals.
// Every value is an integer in the unit FIT stores, so the encoded file
// decodes to exactly these numbers.

// Flat-road model for the virtual speed: a Virtual Ride with 0 km reads as
// broken on Strava. Solves P = v * (Crr * m * g + 0.5 * rho * CdA * v^2).
const TOTAL_MASS_KG = 83;
const ROLLING_RESISTANCE = 0.004;
const DRAG_AREA_M2 = 0.32;
const AIR_DENSITY = 1.225;
const GRAVITY = 9.81;

export function virtualSpeedMmPerSecond(watts: number): number {
  if (watts <= 0) return 0;
  const rolling = ROLLING_RESISTANCE * TOTAL_MASS_KG * GRAVITY;
  const aero = 0.5 * AIR_DENSITY * DRAG_AREA_M2;
  let v = 10;
  for (let i = 0; i < 50; i += 1) {
    const f = rolling * v + aero * v ** 3 - watts;
    v -= f / (rolling + 3 * aero * v ** 2);
  }
  return Math.round(v * 1000);
}

export interface FitRecord {
  // Ride clock second (RecorderRow.t).
  t: number;
  power: number | null;
  cadence: number | null;
  heartRate: number | null;
  targetWatts: number | null;
  // Omitted when power is unknown.
  speedMmPerSecond: number | null;
  distanceCm: number;
}

export interface FitTotals {
  // First ride second and one past the last, so elapsed = endT - startT.
  startT: number;
  endT: number;
  timerSeconds: number;
  distanceCm: number;
  avgPower: number | null;
  maxPower: number | null;
  avgCadence: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  // Joules: 1 W for 1 s per recorded second.
  totalWork: number | null;
}

export interface FitLap extends FitTotals {
  segmentIndex: number | null;
}

export interface FitSession extends FitTotals {
  normalizedPower: number | null;
}

// A timer stop or start, at the first paused or first resumed second.
export interface FitTimerEvent {
  t: number;
  type: "stop_all" | "start";
}

export interface FitRideSummary {
  records: FitRecord[];
  timerEvents: FitTimerEvent[];
  laps: FitLap[];
  session: FitSession;
}

function present(values: (number | null)[]): number[] {
  return values.filter((value): value is number => value !== null);
}

function mean(values: number[]): number | null {
  return values.length === 0 ? null : Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function max(values: number[]): number | null {
  return values.length === 0 ? null : Math.max(...values);
}

// Coggan normalized power: 30 s rolling mean, fourth-power mean, fourth root.
// Each stretch is an unpaused run of the 1 Hz power stream with unknown
// seconds kept in place, so an outage is never collapsed into a window that
// did not happen. A window counts only when at least 24 of its 30 seconds have
// power (the same rule as the activity analysis) and is averaged over those.
const NP_WINDOW = 30;
const NP_MIN_VALID = 24;

export function normalizedPower(stretches: (number | null)[][]): number | null {
  const means: number[] = [];
  for (const watts of stretches) {
    for (let end = NP_WINDOW; end <= watts.length; end += 1) {
      const valid = present(watts.slice(end - NP_WINDOW, end));
      if (valid.length >= NP_MIN_VALID) means.push(valid.reduce((sum, value) => sum + value, 0) / valid.length);
    }
  }
  if (means.length === 0) return null;
  return Math.round((means.reduce((sum, value) => sum + value ** 4, 0) / means.length) ** 0.25);
}

// Unpaused runs of power readings, split at every pause.
function ridingStretches(rows: RecorderRow[]): (number | null)[][] {
  const stretches: (number | null)[][] = [];
  let current: (number | null)[] | null = null;
  for (const row of rows) {
    if (row.paused) current = null;
    else if (current) current.push(row.power);
    else stretches.push((current = [row.power]));
  }
  return stretches;
}

function totals(rows: RecorderRow[], records: Map<number, FitRecord>): FitTotals {
  const riding = rows.filter((row) => !row.paused);
  const power = present(riding.map((row) => row.power));
  const cadence = present(riding.map((row) => row.cadence));
  const heartRate = present(riding.map((row) => row.heartRate));
  const distance = riding.reduce((sum, row) => sum + (records.get(row.t)?.speedMmPerSecond ?? 0), 0);
  return {
    startT: rows[0].t,
    endT: rows[rows.length - 1].t + 1,
    timerSeconds: riding.length,
    distanceCm: Math.round(distance / 10),
    avgPower: mean(power),
    maxPower: max(power),
    avgCadence: mean(cadence),
    avgHeartRate: mean(heartRate),
    maxHeartRate: max(heartRate),
    totalWork: power.length === 0 ? null : power.reduce((sum, value) => sum + value, 0),
  };
}

// FIT message_index keeps 12 bits for the index, so 4,096 laps at most.
export const MAX_FIT_LAPS = 4096;

// Consecutive rows with the same segment form a lap, so skip and back give
// laps in ride order and a repeated segment gets a lap each time. An import
// can hold more segments than FIT can index; the rest of such a ride goes
// into the last lap rather than failing the whole file.
function splitLaps(rows: RecorderRow[]): RecorderRow[][] {
  const laps: RecorderRow[][] = [];
  for (const row of rows) {
    const current = laps.at(-1);
    if (current && (current[0].segmentIndex === row.segmentIndex || laps.length === MAX_FIT_LAPS)) current.push(row);
    else laps.push([row]);
  }
  return laps;
}

export function summarizeRide(rows: RecorderRow[]): FitRideSummary {
  if (rows.length === 0) throw new Error("A FIT activity needs at least one recorded second.");

  // Paused seconds are timer-stopped: no record, bracketed by timer events.
  // Skips and clock gaps need no timer events: a skip moves the workout
  // position but not the ride clock, and the reducer clamps a clock gap to
  // maxTickGapMs (2 s), so neither leaves idle time in the recorded rows.
  const records: FitRecord[] = [];
  const timerEvents: FitTimerEvent[] = [];
  let distanceMm = 0;
  let wasPaused = false;
  for (const row of rows) {
    if (row.paused !== wasPaused) timerEvents.push({ t: row.t, type: row.paused ? "stop_all" : "start" });
    wasPaused = row.paused;
    if (row.paused) continue;
    const speed = row.power === null ? null : virtualSpeedMmPerSecond(row.power);
    distanceMm += speed ?? 0;
    records.push({
      t: row.t,
      power: row.power,
      cadence: row.cadence,
      heartRate: row.heartRate,
      targetWatts: row.targetWatts,
      speedMmPerSecond: speed,
      distanceCm: Math.round(distanceMm / 10),
    });
  }

  const byT = new Map(records.map((record) => [record.t, record]));
  return {
    records,
    timerEvents,
    laps: splitLaps(rows).map((lapRows) => ({ segmentIndex: lapRows[0].segmentIndex, ...totals(lapRows, byT) })),
    session: { ...totals(rows, byT), normalizedPower: normalizedPower(ridingStretches(rows)) },
  };
}
