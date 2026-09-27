import { describe, expect, it } from "vitest";
import { ManualClock } from "../SimulatedTrainer";
import { fullUuid, Services } from "./bluetooth";
import type { GattCharacteristic, GattServer, GattService } from "./bluetooth";
import { fromHex } from "./codec";
import { WebHeartRateMonitor } from "./WebHeartRateMonitor";
import type { HeartRateEvents } from "./WebHeartRateMonitor";

class FakeStrap extends EventTarget {
  readonly id = "strap";
  readonly name = "TICKR FAKE";
  readonly measurement = Object.assign(new EventTarget(), {
    uuid: fullUuid(0x2a37),
    properties: { read: false, write: false, writeWithoutResponse: false, notify: true, indicate: false },
    value: null as DataView | null,
    readValue: async () => new DataView(new ArrayBuffer(0)),
    writeValueWithResponse: async () => {},
    startNotifications: async () => this.measurement as GattCharacteristic,
    stopNotifications: async () => this.measurement as GattCharacteristic,
  });
  poweredOn = true;
  readonly gatt: GattServer = {
    connected: false,
    connect: async () => {
      if (!this.poweredOn) throw new Error("Connection attempt failed.");
      (this.gatt as { connected: boolean }).connected = true;
      return this.gatt;
    },
    disconnect: () => this.drop(),
    getPrimaryService: async (uuid) => {
      if (fullUuid(uuid) !== fullUuid(Services.heartRate)) throw new Error("not found");
      return this.service;
    },
    getPrimaryServices: async () => [this.service],
  };
  readonly service: GattService = {
    uuid: fullUuid(Services.heartRate),
    getCharacteristic: async () => this.measurement,
    getCharacteristics: async () => [this.measurement],
  };

  send(hex: string): void {
    this.measurement.value = fromHex(hex);
    this.measurement.dispatchEvent(new Event("characteristicvaluechanged"));
  }

  drop(): void {
    if (!this.gatt.connected) return;
    (this.gatt as { connected: boolean }).connected = false;
    this.dispatchEvent(new Event("gattserverdisconnected"));
  }
}

async function settle(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
}

describe("WebHeartRateMonitor", () => {
  it("emits heart rate samples and skips readings without skin contact", async () => {
    const clock = new ManualClock();
    const strap = new FakeStrap();
    const monitor = new WebHeartRateMonitor(strap, clock);
    const samples: HeartRateEvents["sample"][] = [];
    monitor.on("sample", (sample) => samples.push(sample));
    await monitor.connect();
    strap.send("16 8c 00 04");
    strap.send("04 8c");
    expect(samples).toEqual([
      { timestampMs: 0, source: "heartRateMonitor", heartRate: 140, rrIntervalsMs: [1000], sensorContact: true },
    ]);
  });

  it("reconnects in the background after a dropout", async () => {
    const clock = new ManualClock();
    const strap = new FakeStrap();
    const monitor = new WebHeartRateMonitor(strap, clock);
    const statuses: string[] = [];
    monitor.on("status", (status) => statuses.push(status));
    await monitor.connect();
    strap.poweredOn = false;
    strap.drop();
    expect(monitor.status).toBe("reconnecting");
    clock.advance(600);
    await settle();
    strap.poweredOn = true;
    clock.advance(1100);
    await settle();
    expect(monitor.status).toBe("connected");
    expect(statuses).toEqual(["connecting", "connected", "reconnecting", "connected"]);
  });
});
