import { describe, expect, it } from "vitest";
import type { TrainerStatus } from "../../engine/types";
import { ManualClock } from "../SimulatedTrainer";
import type { TrainerEvents } from "../Trainer";
import { FakeFtmsDevice } from "./FakeFtmsDevice";
import type { FakeFtmsOptions } from "./FakeFtmsDevice";
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
    const second = trainer.setTargetPower(120);
    const third = trainer.setTargetPower(140);
    const results = await drive(clock, Promise.all([first, second, third]));
    expect(results.map((r) => r.status)).toEqual(["applied", "superseded", "applied"]);
    expect(device.writes.slice(2)).toEqual([
      [0x05, 0x64, 0x00],
      [0x05, 0x8c, 0x00],
    ]);
  });

  it("times out a write that gets no indication", async () => {
    const { clock, device, trainer } = await connected();
    device.options.responseDelayMs = 5000;
    expect(await drive(clock, trainer.setTargetPower(150))).toEqual({ status: "timeout" });
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
