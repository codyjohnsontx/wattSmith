import { describe, expect, it } from "vitest";
import type { TrainerStatus } from "../../engine/types";
import { ManualClock } from "../SimulatedTrainer";
import type { TrainerEvents } from "../Trainer";
import { FakeFtmsDevice } from "./FakeFtmsDevice";
import type { FakeFtmsOptions } from "./FakeFtmsDevice";
import { judgeTargetTest, newTargetTest } from "./diagnosticChecks";
import { backoffDelayMs } from "./link";
import { WebBluetoothTrainer } from "./WebBluetoothTrainer";
import type { DiagnosticEvent, WebBluetoothTrainerOptions } from "./WebBluetoothTrainer";

// Drives the whole Web Bluetooth layer (link, discovery, codec, control point,
// reconnect) against a fake trainer that speaks FTMS bytes.

async function settle(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
}

// Advances the manual clock in small steps, letting promises settle between.
async function run(clock: ManualClock, ms: number, stepMs = 10): Promise<void> {
  for (let elapsed = 0; elapsed < ms; elapsed += stepMs) {
    clock.advance(Math.min(stepMs, ms - elapsed));
    await settle();
  }
}

// Resolves a promise that needs the clock to move.
async function drive<T>(clock: ManualClock, promise: Promise<T>, maxMs = 5000): Promise<T> {
  let done = false;
  let value: T;
  let failure: unknown;
  let failed = false;
  promise.then(
    (v) => {
      done = true;
      value = v;
    },
    (error: unknown) => {
      done = true;
      failed = true;
      failure = error;
    },
  );
  for (let elapsed = 0; !done && elapsed < maxMs; elapsed += 10) {
    clock.advance(10);
    await settle();
  }
  if (!done) throw new Error(`Promise did not settle within ${maxMs} ms of simulated time`);
  if (failed) throw failure;
  return value!;
}

function setup(fakeOptions: Partial<FakeFtmsOptions> = {}, trainerOptions: Partial<WebBluetoothTrainerOptions> = {}) {
  const clock = new ManualClock(1000);
  const device = new FakeFtmsDevice(clock, fakeOptions);
  const trainer = new WebBluetoothTrainer(device, { clock, wahooFallback: false, ...trainerOptions });
  const samples: TrainerEvents["sample"][] = [];
  const statuses: TrainerStatus[] = [];
  const diagnostics: DiagnosticEvent[] = [];
  const disconnects: string[] = [];
  trainer.on("sample", (sample) => samples.push(sample));
  trainer.on("status", (status) => statuses.push(status));
  trainer.on("diagnostic", (event) => diagnostics.push(event));
  trainer.on("disconnect", ({ reason }) => disconnects.push(reason));
  const logs = () => diagnostics.flatMap((d) => (d.type === "log" ? [d.message] : []));
  return { clock, device, trainer, samples, statuses, diagnostics, disconnects, logs };
}

async function connected(fakeOptions: Partial<FakeFtmsOptions> = {}, trainerOptions: Partial<WebBluetoothTrainerOptions> = {}) {
  const harness = setup(fakeOptions, trainerOptions);
  await drive(harness.clock, harness.trainer.connect());
  return harness;
}

describe("WebBluetoothTrainer connect", () => {
  it("discovers services, reads feature and range, and takes control", async () => {
    const { device, trainer, statuses } = await connected();
    expect(statuses).toEqual(["connecting", "connected"]);
    expect(trainer.capabilities).toEqual({
      power: true,
      cadence: true,
      heartRate: false,
      targetPower: true,
      powerRange: { minWatts: 0, maxWatts: 2000, incrementWatts: 1 },
    });
    const info = trainer.diagnostics;
    expect(info.hasFtms).toBe(true);
    expect(info.hasCyclingPower).toBe(true);
    expect(info.hasWahooCharacteristic).toBe(true);
    expect(info.controlPath).toBe("ftms");
    expect(info.controlState).toBe("granted");
    expect(info.deviceInformation).toEqual({ manufacturer: "Wattsmith", firmware: "fake-1.0" });
    expect(info.services.map((s) => s.label)).toEqual([
      "fitnessMachine (0x1826)",
      "cyclingPower (0x1818)",
      "deviceInformation (0x180A)",
    ]);
    // Request Control, then Start or Resume, before any target.
    expect(device.writes).toEqual([[0x00], [0x07]]);
  });

  it("emits power and cadence from Indoor Bike Data only while it flows", async () => {
    const { clock, samples } = await connected();
    await run(clock, 3000);
    expect(samples).toHaveLength(3);
    expect(samples.every((s) => s.source === "trainer" && s.cadence === 90)).toBe(true);
  });

  it("fails cleanly when the trainer is off", async () => {
    const { clock, device, trainer, statuses } = setup();
    device.powerOff();
    await expect(drive(clock, trainer.connect())).rejects.toThrow(/Connection attempt failed/);
    expect(statuses).toEqual(["connecting", "disconnected"]);
  });

  it("fails the connect when the link drops during Request Control", async () => {
    const { clock, device, trainer, statuses } = setup();
    const connecting = trainer.connect();
    await run(clock, 120);
    device.powerOff();
    await expect(drive(clock, connecting)).rejects.toThrow(/dropped during setup/);
    expect(trainer.status).toBe("disconnected");
    expect(statuses).toEqual(["connecting", "disconnected"]);
  });

  it("offers no control on a power-meter-only trainer", async () => {
    const { trainer, samples, clock } = await connected({ withFtms: false });
    expect(trainer.diagnostics.controlPath).toBe("none");
    expect(trainer.capabilities.targetPower).toBe(false);
    expect(await trainer.setTargetPower(200)).toEqual({ status: "rejected", reason: "notSupported" });
    await run(clock, 3000);
    // Cycling Power becomes the sample source, cadence from crank revolutions.
    expect(samples.length).toBeGreaterThanOrEqual(2);
    expect(samples.at(-1)!.cadence).toBe(90);
  });

  it("uses the Wahoo fallback only when the flag is on and FTMS is missing", async () => {
    const { device, trainer } = await connected({ withFtms: false }, { wahooFallback: true });
    expect(trainer.diagnostics.controlPath).toBe("wahoo");
    expect(device.writes).toEqual([[0x20, 0xee, 0xfc]]);
    expect(await trainer.setTargetPower(250)).toEqual({ status: "applied", watts: 250, clamped: false });
    expect(device.writes.at(-1)).toEqual([0x42, 0xfa, 0x00]);
  });
});

describe("WebBluetoothTrainer targets", () => {
  it("sets 150 W then 250 W and the trainer follows", async () => {
    const { clock, device, trainer, samples } = await connected();
    expect(await drive(clock, trainer.setTargetPower(150))).toEqual({ status: "applied", watts: 150, clamped: false });
    await run(clock, 6000);
    expect(Math.abs(samples.at(-1)!.power! - 150)).toBeLessThanOrEqual(3);
    expect(await drive(clock, trainer.setTargetPower(250))).toEqual({ status: "applied", watts: 250, clamped: false });
    await run(clock, 6000);
    expect(Math.abs(samples.at(-1)!.power! - 250)).toBeLessThanOrEqual(3);
    expect(device.writes.slice(2)).toEqual([
      [0x05, 0x96, 0x00],
      [0x05, 0xfa, 0x00],
    ]);
  });

  it("clamps to the supported power range", async () => {
    const { clock, device, trainer } = await connected({ powerRange: { minWatts: 20, maxWatts: 1500, incrementWatts: 5 } });
    expect(await drive(clock, trainer.setTargetPower(1800))).toEqual({ status: "applied", watts: 1500, clamped: true });
    expect(await drive(clock, trainer.setTargetPower(152))).toEqual({ status: "applied", watts: 150, clamped: true });
    expect(device.targetWatts).toBe(150);
  });

  it("keeps one write in flight and lets the newest queued target win", async () => {
    const { clock, device, trainer } = await connected({ responseDelayMs: 300 });
    const first = trainer.setTargetPower(100);
    await settle();
    const second = trainer.setTargetPower(120);
    const third = trainer.setTargetPower(140);
    const results = await drive(clock, Promise.all([first, second, third]));
    expect(results.map((r) => r.status)).toEqual(["applied", "superseded", "applied"]);
    expect(device.writes.slice(2)).toEqual([
      [0x05, 0x64, 0x00],
      [0x05, 0x8c, 0x00],
    ]);
  });

  it("times out a write that gets no indication within 5 s", async () => {
    const { clock, device, trainer, logs } = await connected();
    device.options.responseDelayMs = 6000;
    expect(await drive(clock, trainer.setTargetPower(150), 10_000)).toEqual({ status: "timeout" });
    expect(logs()).toEqual(
      expect.arrayContaining([
        "No response to Set Target Power within 1000 ms; still waiting.",
        "No response to Set Target Power within 5000 ms; rebuilding the session.",
      ]),
    );
  });

  it("retries a target refused with a stopped flywheel once the rider pedals", async () => {
    const { clock, device, trainer, logs } = await connected();
    device.cadenceRpm = 0;
    await run(clock, 1000);
    expect(await drive(clock, trainer.setTargetPower(200))).toEqual({ status: "rejected", reason: "operationFailed" });
    device.cadenceRpm = 90;
    await run(clock, 2000);
    expect(device.targetWatts).toBe(200);
    expect(logs()).toContain("Pedaling again: re-sending 200 W.");
  });

  it("remembers the target while ERG is off and sends a flat road instead", async () => {
    const { clock, device, trainer } = await connected();
    await drive(clock, trainer.setTargetPower(200));
    await drive(clock, trainer.setErgEnabled(false));
    expect(device.writes.at(-1)).toEqual([0x11, 0x00, 0x00, 0x00, 0x00, 0x28, 0x33]);
    expect(device.ergMode).toBe(false);
    expect(await drive(clock, trainer.setTargetPower(220))).toEqual({ status: "applied", watts: 220, clamped: false });
    expect(device.targetWatts).toBe(200);
    await drive(clock, trainer.setErgEnabled(true));
    expect(device.targetWatts).toBe(220);
    expect(device.ergMode).toBe(true);
  });
});

describe("WebBluetoothTrainer control loss", () => {
  it("reclaims control once, then reports another app", async () => {
    const { clock, device, trainer, logs } = await connected();
    await drive(clock, trainer.setTargetPower(180));
    device.takeControlAway();
    await run(clock, 500);
    expect(trainer.diagnostics.controlState).toBe("granted");
    expect(device.targetWatts).toBe(180);

    device.takeControlAway();
    await run(clock, 500);
    expect(trainer.diagnostics.controlState).toBe("lost");
    expect(logs()).toContain("Another app took control of the trainer. Close it, then press Request control.");
    expect(await drive(clock, trainer.requestControl())).toBe(true);
    expect(trainer.diagnostics.controlState).toBe("granted");
  });

  it("requests control again when a target is refused as not permitted", async () => {
    const { clock, device, trainer } = await connected();
    device.hasControl = false;
    expect(await drive(clock, trainer.setTargetPower(160))).toEqual({ status: "applied", watts: 160, clamped: false });
    expect(device.writes.slice(2)).toEqual([[0x05, 0xa0, 0x00], [0x00], [0x07], [0x05, 0xa0, 0x00]]);
    expect(device.targetWatts).toBe(160);
  });
});

describe("WebBluetoothTrainer reconnect", () => {
  it("backs off 0.5, 1, 2, 4 s and caps at 5 s", () => {
    expect([0, 1, 2, 3, 4, 5].map((n) => backoffDelayMs(n))).toEqual([500, 1000, 2000, 4000, 5000, 5000]);
  });

  it("shows reconnecting when the trainer loses power and recovers without a chooser", async () => {
    const { clock, device, trainer, statuses, samples } = await connected();
    await drive(clock, trainer.setTargetPower(150));
    device.powerOff();
    await run(clock, 10);
    expect(trainer.status).toBe("reconnecting");
    expect(await trainer.setTargetPower(200)).toEqual({ status: "rejected", reason: "notConnected" });

    await run(clock, 10_000);
    expect(trainer.status).toBe("reconnecting");
    device.powerOn();
    await run(clock, 6000);
    expect(trainer.status).toBe("connected");
    expect(statuses).toEqual(["connecting", "connected", "reconnecting", "connected"]);
    expect(trainer.diagnostics.reconnectCount).toBe(1);
    expect(trainer.diagnostics.controlState).toBe("granted");
    // The last target is sent again after control is regained.
    await run(clock, 1000);
    expect(device.targetWatts).toBe(150);
    const countBefore = samples.length;
    await run(clock, 3000);
    expect(samples.length).toBeGreaterThan(countBefore);
  });

  it("keeps reconnecting when the link drops again during setup", async () => {
    const { clock, device, trainer } = await connected();
    device.powerOff();
    device.powerOn();
    await run(clock, 620);
    device.powerOff();
    await run(clock, 2000);
    expect(trainer.status).toBe("reconnecting");
    device.powerOn();
    await run(clock, 6000);
    expect(trainer.status).toBe("connected");
    expect(trainer.diagnostics.controlState).toBe("granted");
  });

  it("gives up after 60 s and reports a disconnect", async () => {
    const { clock, device, trainer, disconnects } = await connected();
    device.powerOff();
    await run(clock, 61_000, 100);
    expect(trainer.status).toBe("disconnected");
    expect(disconnects).toEqual(["link lost"]);
    // The same device object reconnects on demand once power is back.
    device.powerOn();
    await drive(clock, trainer.connect());
    expect(trainer.status).toBe("connected");
  });

  it("restarts notifications after 3 s of silence and reconnects after 10 s", async () => {
    const { clock, device, trainer, logs } = await connected();
    await run(clock, 2000);
    device.silent = true;
    await run(clock, 4000);
    expect(logs().some((m) => m.startsWith("No trainer data for 3 s; restarting notifications."))).toBe(true);
    expect(trainer.status).toBe("connected");
    await run(clock, 7000);
    expect(logs().some((m) => m.startsWith("Forcing a reconnect: no trainer data for 10 s"))).toBe(true);
    device.silent = false;
    await run(clock, 3000);
    expect(trainer.status).toBe("connected");
    expect(trainer.diagnostics.reconnectCount).toBe(1);
  });

  it("does not reconnect after a requested disconnect", async () => {
    const { clock, trainer, statuses, disconnects } = await connected();
    await trainer.disconnect();
    await run(clock, 5000);
    expect(statuses).toEqual(["connecting", "connected", "disconnected"]);
    expect(disconnects).toEqual(["requested"]);
  });
});

// Reproductions from the second-opinion review of PR 20 (Codex, findings 1-4).
describe("WebBluetoothTrainer review reproductions", () => {
  it("never writes an older target after a newer release target (finding 1)", async () => {
    const { clock, device, trainer } = await connected();
    device.options.responseDelayMs = 300;
    device.hasControl = false;
    const old = trainer.setTargetPower(250);
    // The 250 W write is refused and Request Control is on its way.
    await run(clock, 350);
    expect(device.writes.slice(2)).toEqual([[0x05, 0xfa, 0x00], [0x00]]);
    const release = trainer.setTargetPower(50);
    const [oldResult, releaseResult] = await drive(clock, Promise.all([old, release]));
    expect(oldResult).toEqual({ status: "superseded" });
    expect(releaseResult).toEqual({ status: "applied", watts: 50, clamped: false });
    expect(device.writes.slice(2)).toEqual([[0x05, 0xfa, 0x00], [0x00], [0x07], [0x05, 0x32, 0x00]]);
    expect(device.targetWatts).toBe(50);
  });

  it("sends nothing after ERG is turned off while control is being reacquired (finding 1)", async () => {
    const { clock, device, trainer } = await connected();
    device.options.responseDelayMs = 300;
    device.hasControl = false;
    const old = trainer.setTargetPower(250);
    await run(clock, 350);
    const off = trainer.setErgEnabled(false);
    expect(await drive(clock, old)).toEqual({ status: "superseded" });
    await drive(clock, off);
    expect(device.writes.filter((w) => w[0] === 0x05)).toEqual([[0x05, 0xfa, 0x00]]);
  });

  it("keeps ERG through a 1.5 s Set Target Power and judges it over the limit", async () => {
    const { clock, device, trainer, statuses } = await connected();
    device.options.responseDelayMs = 1500;
    const sentAtMs = clock.now();
    const first = trainer.setTargetPower(150);
    await settle();
    const second = trainer.setTargetPower(200);
    const third = trainer.setTargetPower(250);
    const firstResult = await drive(clock, first);
    const latencyMs = clock.now() - sentAtMs;
    expect(firstResult).toEqual({ status: "applied", watts: 150, clamped: false });
    expect(judgeTargetTest({ ...newTargetTest(150, sentAtMs), result: firstResult, latencyMs }, clock.now())).toEqual({
      state: "fail",
      summary: `response ${latencyMs} ms, over the 1000 ms limit`,
    });
    expect(await drive(clock, Promise.all([second, third]))).toEqual([{ status: "superseded" }, { status: "applied", watts: 250, clamped: false }]);
    expect(device.writes.slice(2)).toEqual([
      [0x05, 0x96, 0x00],
      [0x05, 0xfa, 0x00],
    ]);
    expect(device.rejectedWrites).toEqual([]);
    expect(statuses).toEqual(["connecting", "connected"]);
    expect(trainer.diagnostics.controlState).toBe("granted");
  });

  it("does not start a procedure while an unanswered one is still in progress (finding 2)", async () => {
    const { clock, device, trainer, statuses } = await connected();
    device.options.responseDelayMs = 6000;
    const first = trainer.setTargetPower(150);
    await settle();
    const second = trainer.setTargetPower(250);
    const [firstResult, secondResult] = await drive(clock, Promise.all([first, second]), 10_000);
    expect(firstResult).toEqual({ status: "timeout" });
    // The 150 W indication after the deadline must never count as the 250 W response.
    expect(secondResult).toEqual({ status: "rejected", reason: "notConnected" });
    expect(device.rejectedWrites).toEqual([]);
    expect(device.writes.slice(2)).toEqual([[0x05, 0x96, 0x00]]);

    // The session is rebuilt, then the latest target is sent.
    device.options.responseDelayMs = 50;
    await run(clock, 5000);
    expect(statuses.slice(-2)).toEqual(["reconnecting", "connected"]);
    expect(device.targetWatts).toBe(250);
    expect(device.rejectedWrites).toEqual([]);
  });

  it("resubscribes and reconnects a trainer silent from the first notification (finding 3)", async () => {
    const { clock, device, trainer, logs } = setup();
    device.silent = true;
    await drive(clock, trainer.connect());
    await run(clock, 4000);
    expect(logs().some((m) => m.startsWith("No trainer data for 3 s; restarting notifications."))).toBe(true);
    await run(clock, 7000);
    expect(logs().some((m) => m.startsWith("Forcing a reconnect: no trainer data for 10 s"))).toBe(true);
    device.silent = false;
    await run(clock, 3000);
    expect(trainer.status).toBe("connected");
    expect(trainer.diagnostics.reconnectCount).toBe(1);
  });

  it("restarts only Indoor Bike Data when Cycling Power keeps flowing (finding 3)", async () => {
    const { clock, device, trainer, samples, logs } = await connected();
    await run(clock, 2000);
    device.silentIndoorBikeData = true;
    const before = samples.length;
    await run(clock, 12_000);
    expect(logs()).toContain("No Indoor Bike Data for 3 s; restarting its notifications.");
    expect(trainer.status).toBe("connected");
    expect(trainer.diagnostics.reconnectCount).toBe(0);
    // Cycling Power takes over as the sample source.
    expect(samples.length).toBeGreaterThan(before + 5);
  });

  it("surfaces an initial Request Control denial and sends the latest target once control returns (finding 4)", async () => {
    const { clock, device, trainer } = setup();
    device.controlHeldElsewhere = true;
    await drive(clock, trainer.connect());
    expect(trainer.status).toBe("connected");
    expect(trainer.diagnostics.controlState).toBe("denied");
    expect(trainer.capabilities.targetPower).toBe(false);
    expect(await drive(clock, trainer.setTargetPower(150))).toEqual({ status: "rejected", reason: "controlNotPermitted" });
    expect(device.writes).toEqual([[0x00]]);

    device.controlHeldElsewhere = false;
    expect(await drive(clock, trainer.requestControl())).toBe(true);
    await run(clock, 500);
    expect(trainer.capabilities.targetPower).toBe(true);
    expect(device.targetWatts).toBe(150);
  });

  it("connects when the trainer answers Request Control in 1.2 s", async () => {
    const { clock, device, trainer, statuses } = setup({ responseDelayMs: 1200 });
    await drive(clock, trainer.connect());
    expect(statuses).toEqual(["connecting", "connected"]);
    expect(trainer.diagnostics.controlState).toBe("granted");
    expect(device.writes).toEqual([[0x00], [0x07]]);
  });

  it("fails the connect when the control point never answers Request Control (finding 2)", async () => {
    const { clock, device, trainer, statuses } = setup({ responseDelayMs: 60_000 });
    await expect(drive(clock, trainer.connect(), 20_000)).rejects.toThrow("The control point did not answer Request Control.");
    expect(statuses).toEqual(["connecting", "disconnected"]);
    expect(device.writes).toEqual([[0x00]]);
  });

  it("does not keep a target refused with a stopped flywheel once a newer target was set", async () => {
    const { clock, device, trainer } = await connected();
    device.cadenceRpm = 0;
    await run(clock, 1000);
    device.options.responseDelayMs = 300;
    const old = trainer.setTargetPower(250);
    await settle();
    const newer = trainer.setTargetPower(150);
    device.hasControl = false;
    device.controlHeldElsewhere = true;
    expect(await drive(clock, Promise.all([old, newer]))).toEqual([
      { status: "rejected", reason: "operationFailed" },
      { status: "rejected", reason: "controlNotPermitted" },
    ]);
    device.controlHeldElsewhere = false;
    device.cadenceRpm = 90;
    await run(clock, 2000);
    expect(await drive(clock, trainer.requestControl())).toBe(true);
    await run(clock, 500);
    expect(trainer.targetWatts).toBe(150);
    expect(device.targetWatts).toBe(150);
  });

  it("does not count a target remembered with ERG off as accepted after a reconnect", async () => {
    const { clock, device, trainer } = await connected();
    await drive(clock, trainer.setTargetPower(150));
    await drive(clock, trainer.setErgEnabled(false));
    device.powerOff();
    await run(clock, 1000);
    device.powerOn();
    await run(clock, 6000);
    expect(trainer.status).toBe("connected");
    await drive(clock, trainer.setTargetPower(160));
    expect(trainer.diagnostics.postReconnectTarget).toBeNull();
    await drive(clock, trainer.setErgEnabled(true));
    expect(device.targetWatts).toBe(160);
    expect(trainer.diagnostics.postReconnectTarget).toEqual({ watts: 160, result: { status: "applied", watts: 160, clamped: false } });
  });

  it("records the first target result after a reconnect", async () => {
    const { clock, device, trainer } = await connected();
    await drive(clock, trainer.setTargetPower(150));
    expect(trainer.diagnostics.postReconnectTarget).toBeNull();
    device.powerOff();
    await run(clock, 1000);
    device.powerOn();
    await run(clock, 6000);
    expect(trainer.diagnostics.postReconnectTarget).toEqual({ watts: 150, result: { status: "applied", watts: 150, clamped: false } });
  });
});
