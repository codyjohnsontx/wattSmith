import type { TrainerSample, TrainerStatus } from "../../engine/types";
import type { SimClock } from "../SimulatedTrainer";
import { Characteristics, Services } from "./bluetooth";
import type { BluetoothDeviceLike, GattCharacteristic, GattServer } from "./bluetooth";
import { decodeHeartRateMeasurement, toHex } from "./codec";
import type { HeartRateMeasurement } from "./codec";
import { Emitter } from "./emitter";
import { defaultReconnectPolicy, errorMessage, GattLink } from "./link";
import type { ReconnectPolicy } from "./link";
import type { DiagnosticEvent } from "./WebBluetoothTrainer";

// A heart rate strap. Web Bluetooth picks one device per chooser, so the strap
// is connected separately from the trainer. Its dropouts never pause a ride;
// the link reconnects in the background like the trainer's.

export interface HeartRateEvents {
  sample: TrainerSample & { timestampMs: number; rrIntervalsMs: number[]; sensorContact?: boolean };
  status: TrainerStatus;
  diagnostic: DiagnosticEvent;
}

export class WebHeartRateMonitor {
  private readonly emitter = new Emitter<HeartRateEvents>();
  private readonly link: GattLink;
  private cleanup: (() => void) | null = null;

  constructor(
    readonly device: BluetoothDeviceLike,
    private readonly clock: SimClock,
    reconnect: ReconnectPolicy = defaultReconnectPolicy,
  ) {
    this.link = new GattLink(
      device,
      clock,
      {
        setup: (server) => this.setup(server),
        onStatus: (status) => this.emitter.emit("status", status),
        onLinkLost: () => this.teardown(),
        onGaveUp: () => {},
        log: (level, message) => this.log(level, message),
      },
      reconnect,
    );
  }

  get status(): TrainerStatus {
    return this.link.status;
  }

  get name(): string {
    return this.device.name || "Unnamed heart rate monitor";
  }

  get reconnectCount(): number {
    return this.link.reconnectCount;
  }

  on<K extends keyof HeartRateEvents>(event: K, listener: (payload: HeartRateEvents[K]) => void): () => void {
    return this.emitter.on(event, listener);
  }

  connect(): Promise<void> {
    return this.link.connect();
  }

  async disconnect(): Promise<void> {
    this.teardown();
    await this.link.disconnect();
  }

  private async setup(server: GattServer): Promise<void> {
    this.teardown();
    const service = await server.getPrimaryService(Services.heartRate);
    const characteristic: GattCharacteristic = await service.getCharacteristic(Characteristics.heartRateMeasurement);
    const listener = () => {
      const view = characteristic.value;
      if (!view) return;
      const atMs = this.clock.now();
      let decoded: HeartRateMeasurement;
      try {
        decoded = decodeHeartRateMeasurement(view);
      } catch (error) {
        this.emitter.emit("diagnostic", {
          type: "notification",
          atMs,
          characteristic: "heartRateMeasurement",
          hex: toHex(view),
          error: errorMessage(error),
        });
        return;
      }
      this.emitter.emit("diagnostic", { type: "notification", atMs, characteristic: "heartRateMeasurement", hex: toHex(view), decoded });
      // A strap reporting "no skin contact" sends a meaningless value.
      if (decoded.sensorContact === false) return;
      this.emitter.emit("sample", {
        timestampMs: atMs,
        source: "heartRateMonitor",
        heartRate: decoded.heartRateBpm,
        rrIntervalsMs: decoded.rrIntervalsMs,
        sensorContact: decoded.sensorContact,
      });
    };
    characteristic.addEventListener("characteristicvaluechanged", listener);
    this.cleanup = () => characteristic.removeEventListener("characteristicvaluechanged", listener);
    await characteristic.startNotifications();
  }

  private teardown(): void {
    this.cleanup?.();
    this.cleanup = null;
  }

  private log(level: "info" | "warn" | "error", message: string): void {
    this.emitter.emit("diagnostic", { type: "log", atMs: this.clock.now(), level, message });
  }
}
