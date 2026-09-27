import type { TrainerStatus } from "../../engine/types";
import type { TargetPowerResult } from "../Trainer";
import type { TrainerDiagnostics } from "./WebBluetoothTrainer";

// Pass/fail evaluation for the hardware test script (docs/hardware-testing.md,
// steps 1-10) from what the diagnostics page has observed. Pure, so the rules
// are tested and the page only renders them.

export type CheckState = "pass" | "fail" | "waiting" | "manual";

export interface CheckResult {
  step: number;
  title: string;
  state: CheckState;
  detail: string;
}

// One "Set N W" press and how the trainer followed it.
export interface TargetTest {
  watts: number;
  sentAtMs: number;
  result: TargetPowerResult | null;
  // Time from the write to the control point response.
  latencyMs: number | null;
  // First moment power entered the band and then stayed there.
  settledAtMs: number | null;
  inBandSinceMs: number | null;
  peakWatts: number | null;
}

export interface LiveReading {
  atMs: number;
  powerWatts?: number;
  cadenceRpm?: number;
  // Notifications in the last RATE_WINDOW_MS.
  recentCount: number;
}

export interface DiagnosticSnapshot {
  nowMs: number;
  trainerStatus: TrainerStatus | null;
  deviceName: string | null;
  diagnostics: TrainerDiagnostics | null;
  indoorBikeData: LiveReading | null;
  cyclingPower: LiveReading | null;
  heartRate: { status: TrainerStatus; connectedAtMs: number | null; firstSampleAtMs: number | null; bpm: number | null } | null;
  targetTests: TargetTest[];
  gaveUp: boolean;
  lastReconnectMs: number | null;
  controlLostEvents: number;
  machineStatusEvents: number;
}

export const RATE_WINDOW_MS = 5000;
export const FRESH_MS = 2000;
// Power within this fraction of the target counts as following it...
export const SETTLE_BAND = 0.05;
// ...once it has stayed there this long.
export const SETTLE_HOLD_MS = 2000;
export const RESPONSE_LIMIT_MS = 1000;
// The plan expects about 3 s; allow some margin before calling it a fail.
export const SETTLE_LIMIT_MS = 6000;

export function newTargetTest(watts: number, sentAtMs: number): TargetTest {
  return { watts, sentAtMs, result: null, latencyMs: null, settledAtMs: null, inBandSinceMs: null, peakWatts: null };
}

// Folds one power reading into the latest target test. Overshoot is tracked
// only for the settling window, so a later sprint does not count.
export function trackTargetPower(test: TargetTest, powerWatts: number, atMs: number): TargetTest {
  if (test.result?.status !== "applied" || atMs - test.sentAtMs > SETTLE_LIMIT_MS * 2) return test;
  const peakWatts = Math.max(test.peakWatts ?? powerWatts, powerWatts);
  if (test.settledAtMs !== null) return { ...test, peakWatts };
  const inBand = Math.abs(powerWatts - test.watts) <= Math.max(3, test.watts * SETTLE_BAND);
  const inBandSinceMs = inBand ? (test.inBandSinceMs ?? atMs) : null;
  const settledAtMs = inBandSinceMs !== null && atMs - inBandSinceMs >= SETTLE_HOLD_MS ? inBandSinceMs : null;
  return { ...test, inBandSinceMs, settledAtMs, peakWatts };
}

export type TargetVerdict = { state: CheckState; summary: string };

export function judgeTargetTest(test: TargetTest, nowMs: number): TargetVerdict {
  const { result } = test;
  if (!result) return { state: "waiting", summary: "waiting for the control point response" };
  if (result.status !== "applied") {
    const reason = result.status === "rejected" ? result.reason : result.status;
    return { state: "fail", summary: `not applied: ${reason}` };
  }
  const latency = test.latencyMs === null ? "" : `response ${Math.round(test.latencyMs)} ms`;
  if (test.latencyMs !== null && test.latencyMs > RESPONSE_LIMIT_MS) {
    return { state: "fail", summary: `${latency}, over the ${RESPONSE_LIMIT_MS} ms limit` };
  }
  if (test.settledAtMs !== null) {
    const settle = (test.settledAtMs - test.sentAtMs) / 1000;
    const overshoot = test.peakWatts !== null ? Math.max(0, Math.round(test.peakWatts - test.watts)) : 0;
    const summary = `${latency}, settled in ${settle.toFixed(1)} s, overshoot ${overshoot} W`;
    return { state: settle * 1000 <= SETTLE_LIMIT_MS ? "pass" : "fail", summary };
  }
  if (nowMs - test.sentAtMs > SETTLE_LIMIT_MS * 2) {
    return { state: "fail", summary: `${latency}, power did not settle within ${(SETTLE_LIMIT_MS * 2) / 1000} s` };
  }
  return { state: "waiting", summary: `${latency}, keep pedaling steadily while power settles` };
}

const fresh = (reading: LiveReading | null, nowMs: number) => reading !== null && nowMs - reading.atMs <= FRESH_MS;

export function evaluateChecks(s: DiagnosticSnapshot): CheckResult[] {
  const d = s.diagnostics;
  const connected = s.trainerStatus === "connected";
  const results: CheckResult[] = [];

  results.push({
    step: 1,
    title: "Connect the trainer",
    state: connected ? "pass" : "waiting",
    detail: s.deviceName ? `Picked "${s.deviceName}"` : "Press Connect trainer and pick the KICKR in the chooser.",
  });

  if (!d || d.services.length === 0) {
    results.push({ step: 2, title: "Services found", state: "waiting", detail: "Connect first." });
    results.push({ step: 3, title: "Feature and power range", state: "waiting", detail: "Connect first." });
  } else {
    const wahoo = d.hasWahooCharacteristic ? "Wahoo characteristic a026e005 present" : "Wahoo characteristic not exposed";
    results.push({
      step: 2,
      title: "Services found",
      state: d.hasFtms && d.hasCyclingPower ? "pass" : "fail",
      detail: `Fitness Machine ${d.hasFtms ? "yes" : "NO"}, Cycling Power ${d.hasCyclingPower ? "yes" : "NO"}; ${wahoo}.`,
    });
    const range = d.powerRange;
    const feature = d.feature;
    const featureOk = feature !== null && feature.machine.powerMeasurement && feature.machine.cadence && feature.target.power;
    results.push({
      step: 3,
      title: "Feature and power range",
      state: feature && range ? (featureOk ? "pass" : "fail") : "fail",
      detail: [
        feature
          ? `power ${feature.machine.powerMeasurement ? "yes" : "no"}, cadence ${feature.machine.cadence ? "yes" : "no"}, power target ${feature.target.power ? "yes" : "no"}`
          : "Fitness Machine Feature not readable",
        range ? `range ${range.minWatts}-${range.maxWatts} W in ${range.incrementWatts} W steps` : "Supported Power Range not readable",
      ].join("; "),
    });
  }

  const ibd = s.indoorBikeData;
  const cps = s.cyclingPower;
  if (!connected) {
    results.push({ step: 4, title: "Live power and cadence", state: "waiting", detail: "Connect, then pedal." });
  } else if (!fresh(ibd, s.nowMs) || ibd?.powerWatts === undefined || ibd.cadenceRpm === undefined) {
    results.push({ step: 4, title: "Live power and cadence", state: "waiting", detail: "Pedal: waiting for Indoor Bike Data with power and cadence." });
  } else {
    const rateHz = ibd.recentCount / (RATE_WINDOW_MS / 1000);
    const agreement =
      fresh(cps, s.nowMs) && cps?.powerWatts !== undefined
        ? `; Cycling Power ${cps.powerWatts} W (${Math.abs(cps.powerWatts - ibd.powerWatts)} W apart)`
        : "; no Cycling Power reading";
    results.push({
      step: 4,
      title: "Live power and cadence",
      state: rateHz >= 0.8 ? "pass" : "fail",
      detail: `${ibd.powerWatts} W at ${Math.round(ibd.cadenceRpm)} rpm, ${rateHz.toFixed(1)} updates/s${agreement}`,
    });
  }

  const byWatts = (watts: number) => [...s.targetTests].reverse().find((t) => t.watts === watts);
  const followed = [150, 250].map((watts) => {
    const test = byWatts(watts);
    return { watts, verdict: test ? judgeTargetTest(test, s.nowMs) : null };
  });
  const step5State: CheckState = followed.some((f) => f.verdict?.state === "fail")
    ? "fail"
    : followed.every((f) => f.verdict?.state === "pass")
      ? "pass"
      : "waiting";
  results.push({
    step: 5,
    title: "Trainer follows 150 W then 250 W",
    state: step5State,
    detail: followed.map((f) => `${f.watts} W: ${f.verdict ? `${f.verdict.state}, ${f.verdict.summary}` : "not set yet"}`).join(" | "),
  });

  results.push({
    step: 6,
    title: "ERG holds after a 15 s stop",
    state: "manual",
    detail: "Stop pedaling 15 s at 150 W, then pedal. Note whether resistance returns at 150 W without pressing anything.",
  });

  results.push({
    step: 7,
    title: "Idle 60 s",
    state: "manual",
    detail: `Wait 60 s without pedaling. Fitness Machine Status events so far: ${s.machineStatusEvents}; the link is ${s.trainerStatus ?? "not connected"}.`,
  });

  results.push({
    step: 8,
    title: "Unplug and reconnect",
    state: s.gaveUp ? "fail" : d && d.reconnectCount > 0 && connected ? "pass" : s.trainerStatus === "reconnecting" ? "waiting" : "manual",
    detail: s.gaveUp
      ? "Gave up after 60 s without the trainer. Plug it back in and press Reconnect."
      : d && d.reconnectCount > 0 && connected
        ? `Recovered ${d.reconnectCount} time(s) without the chooser${s.lastReconnectMs !== null ? `, last in ${(s.lastReconnectMs / 1000).toFixed(1)} s` : ""}.`
        : s.trainerStatus === "reconnecting"
          ? "Reconnecting: plug the trainer back in."
          : "Unplug the trainer for 10 s, then plug it back in.",
  });

  const hr = s.heartRate;
  results.push({
    step: 9,
    title: "Heart rate strap",
    state: !hr
      ? "waiting"
      : hr.firstSampleAtMs !== null && hr.connectedAtMs !== null
        ? hr.firstSampleAtMs - hr.connectedAtMs <= 5000
          ? "pass"
          : "fail"
        : hr.connectedAtMs !== null && s.nowMs - hr.connectedAtMs > 5000
          ? "fail"
          : "waiting",
    detail: !hr
      ? "Press Connect heart rate."
      : hr.firstSampleAtMs !== null && hr.connectedAtMs !== null
        ? `First reading ${((hr.firstSampleAtMs - hr.connectedAtMs) / 1000).toFixed(1)} s after connecting; now ${hr.bpm ?? "-"} bpm (${hr.status}).`
        : `Strap ${hr.status}; waiting for the first reading.`,
  });

  results.push({
    step: 10,
    title: "Wahoo app alongside",
    state: "manual",
    detail: `Open the Wahoo app while connected. Control lost events: ${s.controlLostEvents}. Firmware: ${d?.deviceInformation.firmware ?? "unknown"}.`,
  });

  return results;
}
