// The slice of the Web Bluetooth API the trainer layer uses. TypeScript's DOM
// library does not ship Web Bluetooth types, and declaring only what is used
// lets tests drive the layer with plain fakes.

export type BluetoothUuid = number | string;

export interface CharacteristicProperties {
  read: boolean;
  write: boolean;
  writeWithoutResponse: boolean;
  notify: boolean;
  indicate: boolean;
}

export interface GattCharacteristic extends EventTarget {
  readonly uuid: string;
  readonly properties: CharacteristicProperties;
  readonly value?: DataView | null;
  readValue(): Promise<DataView>;
  writeValueWithResponse(value: DataView): Promise<void>;
  startNotifications(): Promise<GattCharacteristic>;
  stopNotifications(): Promise<GattCharacteristic>;
}

export interface GattService {
  readonly uuid: string;
  getCharacteristic(uuid: BluetoothUuid): Promise<GattCharacteristic>;
  getCharacteristics(): Promise<GattCharacteristic[]>;
}

export interface GattServer {
  readonly connected: boolean;
  connect(): Promise<GattServer>;
  disconnect(): void;
  getPrimaryService(uuid: BluetoothUuid): Promise<GattService>;
  getPrimaryServices(): Promise<GattService[]>;
}

export interface BluetoothDeviceLike extends EventTarget {
  readonly id: string;
  readonly name?: string | null;
  readonly gatt?: GattServer | null;
}

export interface RequestDeviceOptions {
  filters: { services: BluetoothUuid[] }[];
  optionalServices?: BluetoothUuid[];
}

export interface BluetoothLike {
  requestDevice(options: RequestDeviceOptions): Promise<BluetoothDeviceLike>;
  getAvailability?(): Promise<boolean>;
}

// Assigned numbers (Bluetooth SIG assigned_numbers/uuids) --------------------

export const Services = {
  fitnessMachine: 0x1826,
  cyclingPower: 0x1818,
  cyclingSpeedAndCadence: 0x1816,
  heartRate: 0x180d,
  deviceInformation: 0x180a,
  // Wahoo's proprietary service; its trainer characteristic lives under CPS.
  wahoo: "a026ee01-0a7d-4ab3-97fa-f1500f9feb8b",
} as const;

export const Characteristics = {
  fitnessMachineFeature: 0x2acc,
  indoorBikeData: 0x2ad2,
  supportedPowerRange: 0x2ad8,
  fitnessMachineControlPoint: 0x2ad9,
  fitnessMachineStatus: 0x2ada,
  cyclingPowerMeasurement: 0x2a63,
  cyclingPowerFeature: 0x2a65,
  heartRateMeasurement: 0x2a37,
  manufacturerName: 0x2a29,
  modelNumber: 0x2a24,
  firmwareRevision: 0x2a26,
  hardwareRevision: 0x2a27,
  softwareRevision: 0x2a28,
  wahooTrainer: "a026e005-0a7d-4ab3-97fa-f1500f9feb8b",
} as const;

// Web Bluetooth reports every UUID in its full 128-bit lowercase form.
export function fullUuid(uuid: BluetoothUuid): string {
  if (typeof uuid === "string") return uuid.toLowerCase();
  return `0000${uuid.toString(16).padStart(4, "0")}-0000-1000-8000-00805f9b34fb`;
}

const knownNames = new Map<string, string>([
  ...Object.entries(Services).map(([name, uuid]) => [fullUuid(uuid), name] as [string, string]),
  ...Object.entries(Characteristics).map(([name, uuid]) => [fullUuid(uuid), name] as [string, string]),
]);

// "fitnessMachine (0x1826)" for known UUIDs, the raw UUID otherwise.
export function describeUuid(uuid: string): string {
  const full = uuid.toLowerCase();
  const name = knownNames.get(full);
  const short = /^0000([0-9a-f]{4})-0000-1000-8000-00805f9b34fb$/.exec(full)?.[1];
  const id = short ? `0x${short.toUpperCase()}` : full;
  return name ? `${name} (${id})` : id;
}

// Browser support ---------------------------------------------------------------

export type WebBluetoothSupport =
  | { supported: true; bluetooth: BluetoothLike }
  | { supported: false; reason: "insecureContext" | "noApi" | "noAdapter" };

interface BluetoothHost {
  isSecureContext?: boolean;
  navigator?: { bluetooth?: BluetoothLike };
}

// Web Bluetooth exists only in Chromium browsers (Chrome, Edge, Opera) and only
// on HTTPS or localhost. Firefox and Safari, including every iOS browser, lack it.
export async function checkWebBluetoothSupport(host: BluetoothHost): Promise<WebBluetoothSupport> {
  if (host.isSecureContext === false) return { supported: false, reason: "insecureContext" };
  const bluetooth = host.navigator?.bluetooth;
  if (!bluetooth) return { supported: false, reason: "noApi" };
  if (bluetooth.getAvailability) {
    try {
      if (!(await bluetooth.getAvailability())) return { supported: false, reason: "noAdapter" };
    } catch {
      // Availability is advisory; the chooser reports the real error.
    }
  }
  return { supported: true, bluetooth };
}

// Device choosers ---------------------------------------------------------------
// Both must run inside a click handler: Chrome requires a user gesture.

// Filtering on FTMS or CPS lists trainers without FTMS too; capability
// detection decides what each can do. Services outside the filters are only
// reachable when listed in optionalServices.
export const trainerRequestOptions: RequestDeviceOptions = {
  filters: [{ services: [Services.fitnessMachine] }, { services: [Services.cyclingPower] }],
  optionalServices: [
    Services.fitnessMachine,
    Services.cyclingPower,
    Services.cyclingSpeedAndCadence,
    Services.heartRate,
    Services.deviceInformation,
    Services.wahoo,
  ],
};

export const heartRateRequestOptions: RequestDeviceOptions = {
  filters: [{ services: [Services.heartRate] }],
  optionalServices: [Services.deviceInformation],
};

export function requestTrainerDevice(bluetooth: BluetoothLike): Promise<BluetoothDeviceLike> {
  return bluetooth.requestDevice(trainerRequestOptions);
}

export function requestHeartRateDevice(bluetooth: BluetoothLike): Promise<BluetoothDeviceLike> {
  return bluetooth.requestDevice(heartRateRequestOptions);
}

// The chooser rejects with NotFoundError when the rider cancels it.
export function isChooserCancelled(error: unknown): boolean {
  return error instanceof Error && error.name === "NotFoundError";
}
