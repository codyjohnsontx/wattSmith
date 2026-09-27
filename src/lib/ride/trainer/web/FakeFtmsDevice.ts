import type { SimClock } from "../SimulatedTrainer";
import { Characteristics, fullUuid, Services } from "./bluetooth";
import type {
  BluetoothDeviceLike,
  BluetoothUuid,
  CharacteristicProperties,
  GattCharacteristic,
  GattServer,
  GattService,
} from "./bluetooth";
import { ControlOpCode, ControlResultCode } from "./codec";

// A software FTMS trainer behind the Web Bluetooth interfaces: it speaks the
// same bytes a KICKR CORE does (Indoor Bike Data, Cycling Power Measurement,
// Control Point indications, Fitness Machine Status). Tests drive the whole
// Web Bluetooth layer with it, and /ride/devices?device=fake uses it to show
// the page without hardware. It is not a physiology model; the SimulatedTrainer
// is that.

export interface FakeFtmsOptions {
  name: string;
  cadenceRpm: number;
  notifyIntervalMs: number;
  responseDelayMs: number;
  connectDelayMs: number;
  ergTimeConstantMs: number;
  freeRideWatts: number;
  powerRange: { minWatts: number; maxWatts: number; incrementWatts: number };
  // Refuse Set Target Power with "operation failed" while cadence is 0, as a
  // KICKR CORE 2 does with a stopped flywheel.
  rejectTargetsWhenStopped: boolean;
  withFtms: boolean;
  withWahooCharacteristic: boolean;
}

export const defaultFakeFtmsOptions: FakeFtmsOptions = {
  name: "KICKR CORE FAKE",
  cadenceRpm: 90,
  notifyIntervalMs: 1000,
  responseDelayMs: 50,
  connectDelayMs: 100,
  ergTimeConstantMs: 1500,
  freeRideWatts: 120,
  powerRange: { minWatts: 0, maxWatts: 2000, incrementWatts: 1 },
  rejectTargetsWhenStopped: true,
  withFtms: true,
  withWahooCharacteristic: true,
};

const noProperties: CharacteristicProperties = {
  read: false,
  write: false,
  writeWithoutResponse: false,
  notify: false,
  indicate: false,
};

class FakeCharacteristic extends EventTarget implements GattCharacteristic {
  readonly uuid: string;
  value: DataView | null = null;
  notifying = false;

  constructor(
    uuid: BluetoothUuid,
    readonly properties: CharacteristicProperties,
    private readonly device: FakeFtmsDevice,
    private readonly onRead: () => number[] = () => [],
    private readonly onWrite: (bytes: number[]) => void = () => {},
  ) {
    super();
    this.uuid = fullUuid(uuid);
  }

  async readValue(): Promise<DataView> {
    this.device.assertConnected();
    this.value = new DataView(Uint8Array.from(this.onRead()).buffer);
    return this.value;
  }

  async writeValueWithResponse(value: DataView): Promise<void> {
    this.device.assertConnected();
    if (this.properties.indicate && !this.notifying) {
      throw new DOMException("Client Characteristic Configuration Descriptor Improperly Configured", "NotSupportedError");
    }
    this.onWrite(Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)));
  }

  async startNotifications(): Promise<GattCharacteristic> {
    this.device.assertConnected();
    this.notifying = true;
    return this;
  }

  async stopNotifications(): Promise<GattCharacteristic> {
    this.notifying = false;
    return this;
  }

  push(bytes: number[]): void {
    if (!this.notifying || !this.device.gatt.connected) return;
    this.value = new DataView(Uint8Array.from(bytes).buffer);
    this.dispatchEvent(new Event("characteristicvaluechanged"));
  }
}

class FakeService implements GattService {
  readonly uuid: string;
  constructor(
    uuid: BluetoothUuid,
    readonly characteristics: FakeCharacteristic[],
  ) {
    this.uuid = fullUuid(uuid);
  }

  async getCharacteristic(uuid: BluetoothUuid): Promise<GattCharacteristic> {
    const found = this.characteristics.find((c) => c.uuid === fullUuid(uuid));
    if (!found) throw new DOMException(`No characteristic ${fullUuid(uuid)}`, "NotFoundError");
    return found;
  }

  async getCharacteristics(): Promise<GattCharacteristic[]> {
    return this.characteristics;
  }
}

class FakeServer implements GattServer {
  connected = false;
  constructor(private readonly device: FakeFtmsDevice) {}

  connect(): Promise<GattServer> {
    return new Promise((resolve, reject) => {
      this.device.clock.setTimeout(() => {
        if (!this.device.poweredOn) {
          reject(new DOMException("Connection attempt failed.", "NetworkError"));
          return;
        }
        this.connected = true;
        this.device.onConnected();
        resolve(this);
      }, this.device.options.connectDelayMs);
    });
  }

  disconnect(): void {
    if (!this.connected) return;
    this.connected = false;
    this.device.onDisconnected();
  }

  async getPrimaryService(uuid: BluetoothUuid): Promise<GattService> {
    this.device.assertConnected();
    const found = this.device.services.find((s) => s.uuid === fullUuid(uuid));
    if (!found) throw new DOMException(`No service ${fullUuid(uuid)}`, "NotFoundError");
    return found;
  }

  async getPrimaryServices(): Promise<GattService[]> {
    this.device.assertConnected();
    return this.device.services;
  }
}

const le16 = (value: number) => [value & 0xff, (value >> 8) & 0xff];

export class FakeFtmsDevice extends EventTarget implements BluetoothDeviceLike {
  readonly id = "fake-ftms-trainer";
  readonly options: FakeFtmsOptions;
  readonly gatt: FakeServer;
  readonly services: FakeService[];
  poweredOn = true;
  // Stops notifications while staying connected (the "connected but silent" case).
  silent = false;

  cadenceRpm: number;
  targetWatts: number | null = null;
  ergMode = false;
  hasControl = false;
  readonly writes: number[][] = [];
  private power = 0;
  private crankRevolutions = 0;
  private crankEventTime1024 = 0;
  private crankFraction = 0;
  private timer: number | null = null;

  private readonly indoorBikeData: FakeCharacteristic;
  private readonly controlPoint: FakeCharacteristic;
  private readonly machineStatus: FakeCharacteristic;
  private readonly powerMeasurement: FakeCharacteristic;

  constructor(
    readonly clock: SimClock,
    options: Partial<FakeFtmsOptions> = {},
  ) {
    super();
    this.options = { ...defaultFakeFtmsOptions, ...options };
    this.cadenceRpm = this.options.cadenceRpm;
    this.gatt = new FakeServer(this);

    const readOnly = { ...noProperties, read: true };
    const notify = { ...noProperties, notify: true };
    const { powerRange } = this.options;
    this.indoorBikeData = new FakeCharacteristic(Characteristics.indoorBikeData, notify, this);
    this.machineStatus = new FakeCharacteristic(Characteristics.fitnessMachineStatus, notify, this);
    this.controlPoint = new FakeCharacteristic(
      Characteristics.fitnessMachineControlPoint,
      { ...noProperties, write: true, indicate: true },
      this,
      undefined,
      (bytes) => this.handleControlWrite(bytes),
    );
    this.powerMeasurement = new FakeCharacteristic(Characteristics.cyclingPowerMeasurement, notify, this);

    const ftms = new FakeService(Services.fitnessMachine, [
      // Cadence (bit 1) and power measurement (bit 14); power target (bit 3)
      // and indoor bike simulation (bit 13).
      new FakeCharacteristic(Characteristics.fitnessMachineFeature, readOnly, this, () => [0x02, 0x40, 0, 0, 0x08, 0x20, 0, 0]),
      this.indoorBikeData,
      new FakeCharacteristic(Characteristics.supportedPowerRange, readOnly, this, () => [
        ...le16(powerRange.minWatts),
        ...le16(powerRange.maxWatts),
        ...le16(powerRange.incrementWatts),
      ]),
      this.controlPoint,
      this.machineStatus,
    ]);
    const cps = new FakeService(Services.cyclingPower, [
      this.powerMeasurement,
      // Wheel and crank revolution data supported.
      new FakeCharacteristic(Characteristics.cyclingPowerFeature, readOnly, this, () => [0x0c, 0, 0, 0]),
      ...(this.options.withWahooCharacteristic
        ? [new FakeCharacteristic(Characteristics.wahooTrainer, { ...noProperties, write: true, notify: true }, this, undefined, (bytes) => this.writes.push(bytes))]
        : []),
    ]);
    const info = new FakeService(Services.deviceInformation, [
      new FakeCharacteristic(Characteristics.manufacturerName, readOnly, this, () => [...new TextEncoder().encode("Wattsmith")]),
      new FakeCharacteristic(Characteristics.firmwareRevision, readOnly, this, () => [...new TextEncoder().encode("fake-1.0")]),
    ]);
    this.services = this.options.withFtms ? [ftms, cps, info] : [cps, info];
  }

  get name(): string {
    return this.options.name;
  }

  assertConnected(): void {
    if (!this.gatt.connected) throw new DOMException("GATT Server is disconnected.", "NetworkError");
  }

  // The trainer loses power: the link drops and connects fail until powerOn().
  powerOff(): void {
    this.poweredOn = false;
    if (this.gatt.connected) {
      this.gatt.connected = false;
      this.onDisconnected();
    }
  }

  powerOn(): void {
    this.poweredOn = true;
  }

  // Another app takes control (Fitness Machine Status 0xFF).
  takeControlAway(): void {
    this.hasControl = false;
    this.machineStatus.push([0xff]);
  }

  onConnected(): void {
    this.hasControl = false;
    this.scheduleNotify();
  }

  onDisconnected(): void {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
    for (const service of this.services) for (const c of service.characteristics) c.notifying = false;
    this.hasControl = false;
    this.dispatchEvent(new Event("gattserverdisconnected"));
  }

  private scheduleNotify(): void {
    this.timer = this.clock.setTimeout(() => {
      this.timer = null;
      if (!this.gatt.connected) return;
      this.step(this.options.notifyIntervalMs);
      this.scheduleNotify();
    }, this.options.notifyIntervalMs);
  }

  private step(ms: number): void {
    const goal =
      this.cadenceRpm <= 0
        ? 0
        : this.ergMode && this.targetWatts !== null
          ? this.targetWatts
          : this.options.freeRideWatts * (this.cadenceRpm / this.options.cadenceRpm) ** 2;
    this.power += (goal - this.power) * (1 - Math.exp(-ms / this.options.ergTimeConstantMs));

    if (this.cadenceRpm > 0) {
      this.crankFraction += (this.cadenceRpm / 60) * (ms / 1000);
      const whole = Math.floor(this.crankFraction);
      if (whole > 0) {
        this.crankFraction -= whole;
        this.crankRevolutions = (this.crankRevolutions + whole) & 0xffff;
        this.crankEventTime1024 = (this.crankEventTime1024 + Math.round((whole * 60 * 1024) / this.cadenceRpm)) & 0xffff;
      }
    }
    if (this.silent) return;

    const watts = Math.round(this.power);
    const speed = Math.round((this.cadenceRpm / 90) * 3000);
    // Flags 0x0044: speed (bit 0 clear), instantaneous cadence, instantaneous power.
    this.indoorBikeData.push([0x44, 0x00, ...le16(speed), ...le16(Math.round(this.cadenceRpm * 2)), ...le16(watts)]);
    // Flags 0x0020: crank revolution data.
    this.powerMeasurement.push([0x20, 0x00, ...le16(watts), ...le16(this.crankRevolutions), ...le16(this.crankEventTime1024)]);
  }

  private respond(opCode: number, result: number): void {
    this.clock.setTimeout(() => this.controlPoint.push([ControlOpCode.responseCode, opCode, result]), this.options.responseDelayMs);
  }

  private handleControlWrite(bytes: number[]): void {
    this.writes.push(bytes);
    const [opCode] = bytes;
    if (opCode === ControlOpCode.requestControl) {
      this.hasControl = true;
      this.respond(opCode, ControlResultCode.success);
      return;
    }
    if (!this.hasControl) {
      this.respond(opCode, ControlResultCode.controlNotPermitted);
      return;
    }
    switch (opCode) {
      case ControlOpCode.startOrResume:
      case ControlOpCode.reset:
        this.respond(opCode, ControlResultCode.success);
        return;
      case ControlOpCode.setTargetPower: {
        const watts = new DataView(Uint8Array.from(bytes).buffer).getInt16(1, true);
        const { minWatts, maxWatts } = this.options.powerRange;
        if (bytes.length !== 3 || watts < minWatts || watts > maxWatts) {
          this.respond(opCode, ControlResultCode.invalidParameter);
          return;
        }
        if (this.options.rejectTargetsWhenStopped && this.cadenceRpm <= 0) {
          this.respond(opCode, ControlResultCode.operationFailed);
          return;
        }
        this.targetWatts = watts;
        this.ergMode = true;
        this.respond(opCode, ControlResultCode.success);
        this.machineStatus.push([0x08, ...le16(watts)]);
        return;
      }
      case ControlOpCode.setIndoorBikeSimulation:
        this.ergMode = false;
        this.respond(opCode, ControlResultCode.success);
        return;
      default:
        this.respond(opCode, ControlResultCode.opCodeNotSupported);
    }
  }
}
