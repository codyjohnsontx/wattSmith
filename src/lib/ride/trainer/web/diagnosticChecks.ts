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
  // The connection session the target was set in; a reconnect starts a new one.
  sessionId: number;
  result: TargetPowerResult | null;
  // Time from the write to the control point response.
  latencyMs: number | null;
  // First moment power entered the band and then stayed there.
  settledAtMs: number | null;
  inBandSinceMs: number | null;
  // First power reading after the write, which sets the step's direction.
  startWatts: number | null;
  // Furthest power went past the target in the step's direction.
  overshootWatts: number;
}

export interface LiveReading {
  atMs: number;
  powerWatts?: number;
  cadenceRpm?: number;
  // Notifications in the last RATE_WINDOW_MS.
  recentCount: number;
  // Mean power over the last AGREEMENT_WINDOW_MS.
  averagePowerWatts?: number;
}

export interface PowerSample {
  atMs: number;
  powerWatts?: number;
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
  // The current connection session (see TargetTest.sessionId).
  sessionId: number;
  gaveUp: boolean;
  lastReconnectMs: number | null;
  controlLostEvents: number;
  machineStatusEvents: number;
}

export const RATE_WINDOW_MS = 5000;
export const FRESH_MS = 2000;
// Cycling Power agrees with Indoor Bike Data when their averages over this
// window differ by at most POWER_AGREEMENT_WATTS or POWER_AGREEMENT_FRACTION of
// the Indoor Bike Data power, whichever is larger. Averaging keeps samples that
// arrive at different moments from flapping the result.
export const AGREEMENT_WINDOW_MS = 3000;
export const POWER_AGREEMENT_WATTS = 5;
export const POWER_AGREEMENT_FRACTION = 0.03;
// Power within this fraction of the target counts as following it...
export const SETTLE_BAND = 0.05;
// ...once it has stayed there this long.
export const SETTLE_HOLD_MS = 2000;
export const RESPONSE_LIMIT_MS = 1000;
// The plan expects about 3 s; allow some margin before calling it a fail.
export const SETTLE_LIMIT_MS = 6000;

// Adds one notification to a characteristic's recent history and summarizes it.
export function addRecentSample(
  history: PowerSample[],
  sample: PowerSample,
): { history: PowerSample[]; recentCount: number; averagePowerWatts?: number } {
  const recent = [...history.filter((h) => sample.atMs - h.atMs < RATE_WINDOW_MS), sample];
  const powers = recent.flatMap((h) =>
    h.powerWatts !== undefined && sample.atMs - h.atMs < AGREEMENT_WINDOW_MS ? [h.powerWatts] : [],
  );
  const averagePowerWatts = powers.length ? powers.reduce((sum, w) => sum + w, 0) / powers.length : undefined;
  return { history: recent, recentCount: recent.length, averagePowerWatts };
}

export function newTargetTest(watts: number, sentAtMs: number, sessionId = 0): TargetTest {
  return { watts, sentAtMs, sessionId, result: null, latencyMs: null, settledAtMs: null, inBandSinceMs: null, startWatts: null, overshootWatts: 0 };
}

// Folds one power reading into the latest target test. Overshoot is tracked
// only for the settling window, so a later sprint does not count. It is
// measured in the step's direction: above the target when stepping up, below
// it when stepping down, so the old power on a downward step does not count.
export function trackTargetPower(test: TargetTest, powerWatts: number, atMs: number): TargetTest {
  if (test.result?.status !== "applied" || atMs - test.sentAtMs > SETTLE_LIMIT_MS * 2) return test;
  const startWatts = test.startWatts ?? powerWatts;
  const past = startWatts <= test.watts ? powerWatts - test.watts : test.watts - powerWatts;
  const overshootWatts = Math.max(test.overshootWatts, past);
  if (test.settledAtMs !== null) return { ...test, startWatts, overshootWatts };
  const inBand = Math.abs(powerWatts - test.watts) <= Math.max(3, test.watts * SETTLE_BAND);
  const inBandSinceMs = inBand ? (test.inBandSinceMs ?? atMs) : null;
  const settledAtMs = inBandSinceMs !== null && atMs - inBandSinceMs >= SETTLE_HOLD_MS ? inBandSinceMs : null;
  return { ...test, inBandSinceMs, settledAtMs, startWatts, overshootWatts };
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
    const overshoot = Math.round(test.overshootWatts);
    const summary = `${latency}, settled in ${settle.toFixed(1)} s, overshoot ${overshoot} W`;
    return { state: settle * 1000 <= SETTLE_LIMIT_MS ? "pass" : "fail", summary };
  }
  if (nowMs - test.sentAtMs > SETTLE_LIMIT_MS * 2) {
    return { state: "fail", summary: `${latency}, power did not settle within ${(SETTLE_LIMIT_MS * 2) / 1000} s` };
  }
  return { state: "waiting", summary: `${latency}, keep pedaling steadily while power settles` };
}

const fresh = (reading: LiveReading | null, nowMs: number) => reading !== null && nowMs - reading.atMs <= FRESH_MS;

function powerAgreement(d: TrainerDiagnostics | null, ibd: LiveReading, cps: LiveReading | null, nowMs: number): TargetVerdict {
  if (d && !d.hasCyclingPower) return { state: "fail", summary: "Cycling Power not available" };
  if (!fresh(cps, nowMs) || cps?.averagePowerWatts === undefined || ibd.averagePowerWatts === undefined) {
    return { state: "waiting", summary: "waiting for Cycling Power" };
  }
  const gap = Math.abs(cps.averagePowerWatts - ibd.averagePowerWatts);
  const limit = Math.max(POWER_AGREEMENT_WATTS, ibd.averagePowerWatts * POWER_AGREEMENT_FRACTION);
  return {
    state: gap <= limit ? "pass" : "fail",
    summary: `Cycling Power ${Math.round(cps.averagePowerWatts)} W vs ${Math.round(ibd.averagePowerWatts)} W over ${AGREEMENT_WINDOW_MS / 1000} s (${Math.round(gap)} W apart, limit ${Math.round(limit)} W)`,
  };
}

export function evaluateChecks(s: DiagnosticSnapshot): CheckResult[] {
  const d = s.diagnostics;
  const connected = s.trainerStatus === "connected";
  const results: CheckResult[] = [];

  results.push({
    step: 1,
    title: "Connect the trainer",
    state: connected || s.trainerStatus === "reconnecting" ? "pass" : "waiting",
    detail: !s.deviceName
      ? "Press Connect trainer and pick the KICKR in the chooser."
      : connected
        ? `Connected to "${s.deviceName}"`
        : `Picked "${s.deviceName}"; the link is ${s.trainerStatus ?? "disconnected"}.`,
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
    const agreement = powerAgreement(d, ibd, cps, s.nowMs);
    results.push({
      step: 4,
      title: "Live power and cadence",
      state: rateHz < 0.8 || agreement.state === "fail" ? "fail" : agreement.state,
      detail: `${ibd.powerWatts} W at ${Math.round(ibd.cadenceRpm)} rpm, ${rateHz.toFixed(1)} updates/s; ${agreement.summary}`,
    });
  }

  results.push(evaluateTargetOrder(s));

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

  results.push(evaluateReconnect(s));

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

// Step 5: a passing 150 W test followed by a later passing 250 W test, both in
// one connection session. A proven pair stays proven after a later reconnect.
function evaluateTargetOrder(s: DiagnosticSnapshot): CheckResult {
  const title = "Trainer follows 150 W then 250 W";
  const passes = (test: TargetTest) => judgeTargetTest(test, s.nowMs).state === "pass";
  for (const first of s.targetTests) {
    if (first.watts !== 150 || !passes(first)) continue;
    const second = s.targetTests.find(
      (test) => test.watts === 250 && test.sessionId === first.sessionId && test.sentAtMs > first.sentAtMs && passes(test),
    );
    if (second) {
      const summary = (test: TargetTest) => judgeTargetTest(test, s.nowMs).summary;
      return { step: 5, title, state: "pass", detail: `150 W: ${summary(first)} | then 250 W: ${summary(second)}` };
    }
  }

  const current = s.targetTests.filter((test) => test.sessionId === s.sessionId);
  const latest = (watts: number) => [...current].reverse().find((test) => test.watts === watts);
  const verdicts = [150, 250].map((watts) => {
    const test = latest(watts);
    return { watts, test, verdict: test ? judgeTargetTest(test, s.nowMs) : null };
  });
  const detail = verdicts.map((v) => `${v.watts} W: ${v.verdict ? `${v.verdict.state}, ${v.verdict.summary}` : "not set yet"}`);
  const [low, high] = verdicts;
  if (high.verdict?.state === "pass" && (!low.test || low.test.sentAtMs > high.test!.sentAtMs || low.verdict?.state !== "pass")) {
    detail.push("Set 150 W first, then 250 W");
  }
  const state: CheckState = verdicts.some((v) => v.verdict?.state === "fail") ? "fail" : "waiting";
  return { step: 5, title, state, detail: detail.join(" | ") };
}

// Step 8: the link came back without the chooser AND a Set Target Power
// succeeded afterwards, so control came back too, not just the link.
function evaluateReconnect(s: DiagnosticSnapshot): CheckResult {
  const title = "Unplug and reconnect";
  const d = s.diagnostics;
  if (s.gaveUp) {
    return { step: 8, title, state: "fail", detail: "Gave up after 60 s without the trainer. Plug it back in and press Reconnect." };
  }
  if (s.trainerStatus === "reconnecting") {
    return { step: 8, title, state: "waiting", detail: "Reconnecting: plug the trainer back in." };
  }
  if (!d || d.reconnectCount === 0 || s.trainerStatus !== "connected") {
    return { step: 8, title, state: "manual", detail: "Set 150 W, then unplug the trainer for 10 s and plug it back in." };
  }
  const recovered = `Recovered ${d.reconnectCount} time(s) without the chooser${
    s.lastReconnectMs !== null ? `, last in ${(s.lastReconnectMs / 1000).toFixed(1)} s` : ""
  }`;
  const target = d.postReconnectTarget;
  if (!target) {
    return { step: 8, title, state: "waiting", detail: `${recovered}. Set a target to prove control came back too.` };
  }
  if (target.result.status === "applied") {
    return { step: 8, title, state: "pass", detail: `${recovered}; ${target.watts} W accepted after reconnecting.` };
  }
  const reason = target.result.status === "rejected" ? target.result.reason : target.result.status;
  return { step: 8, title, state: "fail", detail: `${recovered}, but Set Target Power ${target.watts} W after reconnecting failed: ${reason}.` };
}
