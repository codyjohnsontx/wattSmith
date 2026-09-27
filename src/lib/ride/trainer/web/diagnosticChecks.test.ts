import { describe, expect, it } from "vitest";
import { addRecentSample, evaluateChecks, judgeTargetTest, newTargetTest, trackTargetPower } from "./diagnosticChecks";
import type { DiagnosticSnapshot, TargetTest } from "./diagnosticChecks";
import type { TrainerDiagnostics } from "./WebBluetoothTrainer";

const diagnostics: TrainerDiagnostics = {
  services: [{ uuid: "x", label: "fitnessMachine (0x1826)", characteristics: [] }],
  deviceInformation: { firmware: "4.2.0" },
  feature: {
    machineRaw: 0x4002,
    targetRaw: 0x2008,
    machine: { cadence: true, powerMeasurement: true } as never,
    target: { power: true } as never,
  },
  cyclingPowerFeature: null,
  powerRange: { minWatts: 0, maxWatts: 2000, incrementWatts: 1 },
  hasFtms: true,
  hasCyclingPower: true,
  hasWahooCharacteristic: true,
  controlPath: "ftms",
  controlState: "granted",
  reconnectCount: 0,
};

const base: DiagnosticSnapshot = {
  nowMs: 100_000,
  trainerStatus: "connected",
  deviceName: "KICKR CORE 1234",
  diagnostics,
  indoorBikeData: { atMs: 99_500, powerWatts: 152, cadenceRpm: 88, recentCount: 5, averagePowerWatts: 152 },
  cyclingPower: { atMs: 99_600, powerWatts: 150, cadenceRpm: 88, recentCount: 5, averagePowerWatts: 150 },
  heartRate: null,
  targetTests: [],
  gaveUp: false,
  lastReconnectMs: null,
  controlLostEvents: 0,
  machineStatusEvents: 0,
};

const step = (snapshot: DiagnosticSnapshot, n: number) => evaluateChecks(snapshot).find((c) => c.step === n)!;

// A test whose power trace is `watts[i]` at one sample per second after a
// response that arrived in 80 ms.
function followed(target: number, watts: number[]): TargetTest {
  let test: TargetTest = { ...newTargetTest(target, 0), result: { status: "applied", watts: target, clamped: false }, latencyMs: 80 };
  watts.forEach((w, i) => (test = trackTargetPower(test, w, (i + 1) * 1000)));
  return test;
}

describe("target tracking", () => {
  it("settles once power stays in the band and records overshoot", () => {
    const test = followed(150, [90, 130, 148, 156, 151, 150, 149]);
    expect(test.settledAtMs).toBe(3000);
    expect(test.peakWatts).toBe(156);
    expect(judgeTargetTest(test, 8000)).toEqual({ state: "pass", summary: "response 80 ms, settled in 3.0 s, overshoot 6 W" });
  });

  it("restarts the hold when power leaves the band", () => {
    const test = followed(250, [200, 245, 230, 248, 252, 250]);
    expect(test.settledAtMs).toBe(4000);
  });

  it("fails a rejected target, a slow response and a trainer that never follows", () => {
    const rejected = { ...newTargetTest(150, 0), result: { status: "rejected", reason: "controlNotPermitted" } } as TargetTest;
    expect(judgeTargetTest(rejected, 1000)).toEqual({ state: "fail", summary: "not applied: controlNotPermitted" });
    expect(judgeTargetTest({ ...followed(150, []), latencyMs: 1500 }, 2000).state).toBe("fail");
    const stuck = followed(250, Array(14).fill(180));
    expect(judgeTargetTest(stuck, 13_000).state).toBe("fail");
    expect(judgeTargetTest(followed(250, [180]), 2000).state).toBe("waiting");
  });
});

describe("evaluateChecks", () => {
  it("passes the automatic steps on a healthy FTMS trainer", () => {
    const snapshot: DiagnosticSnapshot = {
      ...base,
      targetTests: [followed(150, [140, 150, 150, 150]), followed(250, [240, 250, 250, 250])],
    };
    const states = Object.fromEntries(evaluateChecks(snapshot).map((c) => [c.step, c.state]));
    expect(states).toEqual({ 1: "pass", 2: "pass", 3: "pass", 4: "pass", 5: "pass", 6: "manual", 7: "manual", 8: "manual", 9: "waiting", 10: "manual" });
    expect(step(snapshot, 4).detail).toBe("152 W at 88 rpm, 1.0 updates/s; Cycling Power 150 W vs 152 W over 3 s (2 W apart, limit 5 W)");
    expect(step(snapshot, 10).detail).toContain("Firmware: 4.2.0");
  });

  it("fails services and feature on a trainer without FTMS", () => {
    const snapshot = { ...base, diagnostics: { ...diagnostics, hasFtms: false, feature: null } };
    expect(step(snapshot, 2).state).toBe("fail");
    expect(step(snapshot, 3)).toMatchObject({ state: "fail", detail: expect.stringContaining("not readable") });
  });

  it("waits for live data and fails a slow notification rate", () => {
    expect(step({ ...base, indoorBikeData: null }, 4).state).toBe("waiting");
    expect(step({ ...base, indoorBikeData: { ...base.indoorBikeData!, atMs: 90_000 } }, 4).state).toBe("waiting");
    expect(step({ ...base, indoorBikeData: { ...base.indoorBikeData!, recentCount: 2 } }, 4).state).toBe("fail");
  });

  it("passes step 4 only when Cycling Power agrees within 5 W or 3 percent", () => {
    const withPower = (ibdWatts: number, cpsWatts: number): DiagnosticSnapshot => ({
      ...base,
      indoorBikeData: { ...base.indoorBikeData!, averagePowerWatts: ibdWatts },
      cyclingPower: { ...base.cyclingPower!, averagePowerWatts: cpsWatts },
    });
    expect(step(withPower(152, 157), 4).state).toBe("pass");
    expect(step(withPower(300, 309), 4).state).toBe("pass");
    expect(step(withPower(152, 160), 4)).toMatchObject({ state: "fail", detail: expect.stringContaining("8 W apart, limit 5 W") });
    expect(step(withPower(300, 310), 4).state).toBe("fail");
    expect(step({ ...withPower(152, 150), indoorBikeData: { ...base.indoorBikeData!, recentCount: 2 } }, 4).state).toBe("fail");
  });

  it("never passes step 4 without Cycling Power", () => {
    const noCps = { ...base, diagnostics: { ...diagnostics, hasCyclingPower: false }, cyclingPower: null };
    expect(step(noCps, 4)).toMatchObject({ state: "fail", detail: expect.stringContaining("Cycling Power not available") });
    expect(step({ ...base, cyclingPower: null }, 4)).toMatchObject({ state: "waiting", detail: expect.stringContaining("waiting for Cycling Power") });
    expect(step({ ...base, cyclingPower: { ...base.cyclingPower!, atMs: 90_000 } }, 4).state).toBe("waiting");
  });

  it("averages power over 3 s and counts notifications over 5 s", () => {
    let history: { atMs: number; powerWatts?: number }[] = [];
    let summary: ReturnType<typeof addRecentSample> | undefined;
    for (const [atMs, powerWatts] of [[0, 400], [1000, 100], [2000, 200], [3000, 300], [4000, undefined]] as const) {
      summary = addRecentSample(history, { atMs, powerWatts });
      history = summary.history;
    }
    expect(summary!.recentCount).toBe(5);
    expect(summary!.averagePowerWatts).toBe(250);
    expect(addRecentSample(history, { atMs: 9000 }).recentCount).toBe(1);
    expect(addRecentSample(history, { atMs: 9000 }).averagePowerWatts).toBeUndefined();
  });

  it("passes the connect step once connected, including while reconnecting", () => {
    expect(step(base, 1).state).toBe("pass");
    expect(step({ ...base, trainerStatus: "reconnecting" }, 1).state).toBe("pass");
    expect(step({ ...base, trainerStatus: "connecting" }, 1).state).toBe("waiting");
    expect(step({ ...base, trainerStatus: "disconnected" }, 1).state).toBe("waiting");
  });

  it("tracks the reconnect step", () => {
    expect(step({ ...base, trainerStatus: "reconnecting" }, 8).state).toBe("waiting");
    const recovered = { ...base, diagnostics: { ...diagnostics, reconnectCount: 1 }, lastReconnectMs: 12_400 };
    expect(step(recovered, 8)).toEqual({
      step: 8,
      title: "Unplug and reconnect",
      state: "pass",
      detail: "Recovered 1 time(s) without the chooser, last in 12.4 s.",
    });
    expect(step({ ...base, trainerStatus: "disconnected", gaveUp: true }, 8).state).toBe("fail");
  });

  it("judges the heart rate strap on time to first reading", () => {
    const hr = { status: "connected" as const, connectedAtMs: 90_000, firstSampleAtMs: 91_500, bpm: 120 };
    expect(step({ ...base, heartRate: hr }, 9).state).toBe("pass");
    expect(step({ ...base, heartRate: { ...hr, firstSampleAtMs: null } }, 9).state).toBe("fail");
    expect(step({ ...base, heartRate: { ...hr, connectedAtMs: 98_000, firstSampleAtMs: null } }, 9).state).toBe("waiting");
  });
});
