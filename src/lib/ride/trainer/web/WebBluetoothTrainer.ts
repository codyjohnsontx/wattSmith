import type { TrainerStatus } from "../../engine/types";
import type { SimClock } from "../SimulatedTrainer";
import { clampToPowerRange } from "../Trainer";
import type { PowerRange, TargetPowerResult, Trainer, TrainerCapabilities, TrainerEvents } from "../Trainer";
import { Characteristics, describeUuid, fullUuid, Services } from "./bluetooth";
import type { BluetoothDeviceLike, GattCharacteristic, GattServer, GattService } from "./bluetooth";
import {
  characteristicDecoders,
  crankCadenceRpm,
  encodeRequestControl,
  encodeSetIndoorBikeSimulation,
  encodeStartOrResume,
  flatRoadSimulation,
  toHex,
} from "./codec";
import type {
  CharacteristicName,
  CrankRevolutionData,
  CyclingPowerFeature,
  CyclingPowerMeasurement,
  FitnessMachineFeature,
  FitnessMachineStatus,
  IndoorBikeData,
} from "./codec";
import { FtmsControlPoint, opName } from "./controlPoint";
import type { ControlOutcome } from "./controlPoint";
import { Emitter } from "./emitter";
import { defaultReconnectPolicy, errorMessage, GattLink } from "./link";
import type { ReconnectPolicy } from "./link";
import { wahooFallbackEnabled, WahooControl } from "./wahoo";

// A smart trainer over Web Bluetooth, behind the same Trainer interface as the
// simulator. FTMS is the control path: Indoor Bike Data for power and cadence,
// the Control Point for targets, Fitness Machine Status for "another app took
// control". Cycling Power is read alongside as a second power source and the
// only one on trainers without FTMS.

export type ControlPath = "ftms" | "wahoo" | "none";

// none: no control point; requesting: Request Control in flight; granted:
// targets accepted; denied: the trainer refused; lost: another app took over.
export type ControlState = "none" | "requesting" | "granted" | "denied" | "lost";

export interface DiscoveredCharacteristic {
  uuid: string;
  label: string;
  properties: string[];
}

export interface DiscoveredService {
  uuid: string;
  label: string;
  characteristics: DiscoveredCharacteristic[];
}

export interface DeviceInformation {
  manufacturer?: string;
  model?: string;
  firmware?: string;
  hardware?: string;
  software?: string;
}

export interface TrainerDiagnostics {
  services: DiscoveredService[];
  deviceInformation: DeviceInformation;
  feature: FitnessMachineFeature | null;
  cyclingPowerFeature: CyclingPowerFeature | null;
  powerRange: PowerRange | null;
  hasFtms: boolean;
  hasCyclingPower: boolean;
  hasWahooCharacteristic: boolean;
  controlPath: ControlPath;
  controlState: ControlState;
  reconnectCount: number;
  // The first target result after the latest reconnect: proof that control
  // came back, not just the link. Null until a target is attempted.
  postReconnectTarget: { watts: number; result: TargetPowerResult } | null;
}

export type DiagnosticEvent =
  | { type: "log"; atMs: number; level: "info" | "warn" | "error"; message: string }
  | {
      type: "notification";
      atMs: number;
      characteristic: CharacteristicName | "wahooTrainer";
      hex: string;
      decoded?: unknown;
      error?: string;
      // Values the trainer layer derived from this notification.
      derived?: { cadenceRpm?: number };
    }
  // Something in `diagnostics` changed.
  | { type: "changed" };

export type WebTrainerEvents = TrainerEvents & { diagnostic: DiagnosticEvent };

export interface WebBluetoothTrainerOptions {
  clock: SimClock;
  wahooFallback: boolean;
  controlTimeoutMs: number;
  // With no trainer data for this long, restart notifications; for the longer
  // time, drop the link so the reconnect loop rebuilds it.
  staleResubscribeMs: number;
  staleReconnectMs: number;
  // CPS crank data with no new crank event for this long means 0 rpm.
  cadenceTimeoutMs: number;
  reconnect: ReconnectPolicy;
}

const WATCHDOG_INTERVAL_MS = 1000;

interface DataStream {
  label: string;
  characteristic: GattCharacteristic;
  lastAtMs: number;
  resubscribed: boolean;
}

const emptyDiagnostics = (): TrainerDiagnostics => ({
  services: [],
  deviceInformation: {},
  feature: null,
  cyclingPowerFeature: null,
  powerRange: null,
  hasFtms: false,
  hasCyclingPower: false,
  hasWahooCharacteristic: false,
  controlPath: "none",
  controlState: "none",
  reconnectCount: 0,
  postReconnectTarget: null,
});

const noCapabilities: TrainerCapabilities = {
  power: false,
  cadence: false,
  heartRate: false,
  targetPower: false,
  powerRange: null,
};

const deviceInformationFields: [keyof DeviceInformation, number][] = [
  ["manufacturer", Characteristics.manufacturerName],
  ["model", Characteristics.modelNumber],
  ["firmware", Characteristics.firmwareRevision],
  ["hardware", Characteristics.hardwareRevision],
  ["software", Characteristics.softwareRevision],
];

function propertyList(characteristic: GattCharacteristic): string[] {
  const p = characteristic.properties;
  return (["read", "write", "writeWithoutResponse", "notify", "indicate"] as const).filter((key) => p[key]);
}

export class WebBluetoothTrainer implements Trainer {
  readonly options: WebBluetoothTrainerOptions;
  private readonly emitter = new Emitter<WebTrainerEvents>();
  private readonly link: GattLink;

  private caps: TrainerCapabilities = noCapabilities;
  private info: TrainerDiagnostics = emptyDiagnostics();
  private characteristics = new Map<string, GattCharacteristic>();
  private cleanups: (() => void)[] = [];

  private control: FtmsControlPoint | null = null;
  private wahoo: WahooControl | null = null;
  private controlRequest: Promise<boolean> | null = null;
  private reclaimedAfterLoss = false;

  private ergEnabled = true;
  private lastTargetWatts: number | null = null;
  // Bumped by every target request, ERG change and disconnect. A target write
  // that awaited something (control, a retry) is dropped when a newer request
  // arrived meanwhile, so an older target can never follow a newer one.
  private targetGeneration = 0;
  private previousStatus: TrainerStatus = "disconnected";
  private awaitingPostReconnectTarget = false;
  private postReconnectTarget: TrainerDiagnostics["postReconnectTarget"] = null;
  // A target the trainer refused with "operation failed" (a stopped flywheel);
  // re-sent on the first sample with cadence.
  private retryWhenPedaling: number | null = null;

  private watchdog: number | null = null;
  // Notifying data characteristics on this connection, each with its own
  // silence clock (armed at connect, not at first data).
  private dataStreams = new Map<string, DataStream>();
  private lastIndoorBikeDataAtMs = -Infinity;
  private previousCrank: CrankRevolutionData | null = null;
  private lastCrankEventAtMs = -Infinity;
  private cyclingPowerCadence: number | undefined;
  private lastCadenceRpm: number | undefined;

  constructor(
    readonly device: BluetoothDeviceLike,
    options: Partial<WebBluetoothTrainerOptions> & { clock: SimClock },
  ) {
    this.options = {
      wahooFallback: wahooFallbackEnabled,
      controlTimeoutMs: 1000,
      staleResubscribeMs: 3000,
      staleReconnectMs: 10_000,
      cadenceTimeoutMs: 3000,
      reconnect: defaultReconnectPolicy,
      ...options,
    };
    this.link = new GattLink(
      device,
      this.options.clock,
      {
        setup: (server) => this.setup(server),
        onStatus: (status) => this.handleStatus(status),
        onLinkLost: () => this.teardownConnection(),
        onGaveUp: () => this.emitter.emit("disconnect", { reason: "link lost" }),
        log: (level, message) => this.log(level, message),
      },
      this.options.reconnect,
    );
  }

  get status(): TrainerStatus {
    return this.link.status;
  }

  // Target power is available only while control is held: a trainer another
  // app controls reports data but takes no targets.
  get capabilities(): TrainerCapabilities {
    if (this.info.controlPath !== "ftms" || this.info.controlState === "granted") return this.caps;
    return { ...this.caps, targetPower: false };
  }

  get diagnostics(): TrainerDiagnostics {
    return { ...this.info, reconnectCount: this.link.reconnectCount, postReconnectTarget: this.postReconnectTarget };
  }

  get name(): string {
    return this.device.name || "Unnamed trainer";
  }

  get targetWatts(): number | null {
    return this.lastTargetWatts;
  }

  on<K extends keyof WebTrainerEvents>(event: K, listener: (payload: WebTrainerEvents[K]) => void): () => void {
    return this.emitter.on(event, listener);
  }

  connect(): Promise<void> {
    return this.link.connect();
  }

  async disconnect(): Promise<void> {
    this.targetGeneration += 1;
    this.teardownConnection();
    await this.link.disconnect();
    this.emitter.emit("disconnect", { reason: "requested" });
  }

  // While ERG is off a target is remembered, not written: FTMS has no way to
  // hold a target outside ERG. Turning ERG back on sends it.
  async setErgEnabled(enabled: boolean): Promise<void> {
    this.ergEnabled = enabled;
    this.targetGeneration += 1;
    if (this.status !== "connected") return;
    if (enabled) {
      if (this.lastTargetWatts !== null) await this.setTargetPower(this.lastTargetWatts);
      return;
    }
    if (this.info.controlPath === "wahoo" && this.wahoo) {
      await this.wahoo.standardMode().catch((error: unknown) => this.log("warn", `Wahoo standard mode failed: ${errorMessage(error)}`));
      return;
    }
    if (this.control && this.info.feature?.target.indoorBikeSimulation) {
      if (!(await this.ensureControl())) return;
      const outcome = await this.control.send(encodeSetIndoorBikeSimulation(flatRoadSimulation));
      this.logOutcome("Set Indoor Bike Simulation (flat road, ERG off)", outcome);
      return;
    }
    this.log("warn", "This trainer has no simulation mode; ERG stays on until the next target.");
  }

  async setTargetPower(watts: number): Promise<TargetPowerResult> {
    const result = await this.applyTarget(watts);
    if (this.awaitingPostReconnectTarget && this.status === "connected" && result.status !== "superseded") {
      this.postReconnectTarget = { watts: this.lastTargetWatts ?? Math.round(watts), result };
      if (result.status === "applied") this.awaitingPostReconnectTarget = false;
      this.emitter.emit("diagnostic", { type: "changed" });
    }
    return result;
  }

  private async applyTarget(watts: number): Promise<TargetPowerResult> {
    if (this.status !== "connected") return { status: "rejected", reason: "notConnected" };
    if (this.info.controlPath === "none") return { status: "rejected", reason: "notSupported" };

    const target = clampToPowerRange(watts, this.info.powerRange);
    const clamped = target !== Math.round(watts);
    if (clamped) this.log("info", `Target ${Math.round(watts)} W clamped to ${target} W (supported range).`);
    this.lastTargetWatts = target;
    const generation = ++this.targetGeneration;
    this.retryWhenPedaling = null;
    if (!this.ergEnabled) return { status: "applied", watts: target, clamped };

    if (this.info.controlPath === "wahoo" && this.wahoo) {
      try {
        await this.wahoo.setErgWatts(target);
        return { status: "applied", watts: target, clamped };
      } catch (error) {
        this.log("warn", `Wahoo ERG write failed: ${errorMessage(error)}`);
        return { status: "rejected", reason: "operationFailed" };
      }
    }
    return this.writeFtmsTarget(target, clamped, generation, false);
  }

  // Requests FTMS control (the diagnostics page's "Request control" and Retry
  // buttons, and the automatic reclaim after another app took control). Once
  // granted, the latest requested target is sent: the trainer holds nothing
  // Wattsmith asked for while another app had control.
  async requestControl(): Promise<boolean> {
    const granted = await this.acquireControl();
    if (granted && this.status === "connected" && this.ergEnabled && this.lastTargetWatts !== null) {
      void this.setTargetPower(this.lastTargetWatts);
    }
    return granted;
  }

  // Reads a characteristic discovered on the current connection, for the
  // diagnostics page. Returns its value as hex.
  async readCharacteristic(uuid: string): Promise<string> {
    const characteristic = this.characteristics.get(uuid.toLowerCase());
    if (!characteristic) throw new Error(`${describeUuid(uuid)} is not available on this connection.`);
    return toHex(await characteristic.readValue());
  }

  // Connection setup --------------------------------------------------------------

  private async setup(server: GattServer): Promise<void> {
    this.teardownConnection();
    const info = emptyDiagnostics();
    const services = await server.getPrimaryServices().catch(() => [] as GattService[]);

    for (const service of services) {
      const characteristics = await service.getCharacteristics().catch(() => [] as GattCharacteristic[]);
      for (const characteristic of characteristics) this.characteristics.set(characteristic.uuid.toLowerCase(), characteristic);
      info.services.push({
        uuid: service.uuid,
        label: describeUuid(service.uuid),
        characteristics: characteristics.map((c) => ({ uuid: c.uuid, label: describeUuid(c.uuid), properties: propertyList(c) })),
      });
    }
    const has = (uuid: number | string) => info.services.some((s) => s.uuid.toLowerCase() === fullUuid(uuid));
    const find = (uuid: number | string) => this.characteristics.get(fullUuid(uuid));
    info.hasFtms = has(Services.fitnessMachine);
    info.hasCyclingPower = has(Services.cyclingPower);
    info.hasWahooCharacteristic = find(Characteristics.wahooTrainer) !== undefined;
    this.log("info", `Services: ${info.services.map((s) => s.label).join(", ") || "none"}`);

    for (const [field, uuid] of deviceInformationFields) {
      const characteristic = find(uuid);
      if (!characteristic) continue;
      try {
        info.deviceInformation[field] = new TextDecoder().decode(await characteristic.readValue()).replace(/\0+$/, "");
      } catch {
        // Device information is best effort.
      }
    }

    info.feature = await this.readDecoded(find(Characteristics.fitnessMachineFeature), "fitnessMachineFeature");
    info.powerRange = await this.readDecoded(find(Characteristics.supportedPowerRange), "supportedPowerRange");
    info.cyclingPowerFeature = await this.readDecoded(find(Characteristics.cyclingPowerFeature), "cyclingPowerFeature");

    const indoorBikeData = find(Characteristics.indoorBikeData);
    const status = find(Characteristics.fitnessMachineStatus);
    const controlPoint = find(Characteristics.fitnessMachineControlPoint);
    const powerMeasurement = find(Characteristics.cyclingPowerMeasurement);
    const wahooCharacteristic = find(Characteristics.wahooTrainer);

    if (indoorBikeData) {
      await this.subscribe(indoorBikeData, "indoorBikeData", (decoded) => this.handleIndoorBikeData(decoded as IndoorBikeData));
      this.dataStreams.set("indoorBikeData", { label: "Indoor Bike Data", characteristic: indoorBikeData, lastAtMs: this.options.clock.now(), resubscribed: false });
    }
    if (status) {
      await this.subscribe(status, "fitnessMachineStatus", (decoded) => this.handleMachineStatus(decoded as FitnessMachineStatus));
    }
    if (powerMeasurement) {
      await this.subscribe(powerMeasurement, "cyclingPowerMeasurement", (decoded) =>
        this.handlePowerMeasurement(decoded as CyclingPowerMeasurement),
      );
      this.dataStreams.set("cyclingPowerMeasurement", {
        label: "Cycling Power",
        characteristic: powerMeasurement,
        lastAtMs: this.options.clock.now(),
        resubscribed: false,
      });
    }

    if (controlPoint) {
      const control = new FtmsControlPoint(
        { write: (value) => controlPoint.writeValueWithResponse(value) },
        this.options.clock,
        this.options.controlTimeoutMs,
        (level, message) => this.log(level, message),
        () => this.link.forceReconnect("the control point stopped answering"),
      );
      await this.subscribe(controlPoint, "controlPointResponse", (_decoded, view) => control.handleIndication(view));
      this.control = control;
      info.controlPath = "ftms";
    } else if (wahooCharacteristic && this.options.wahooFallback) {
      await this.subscribeRaw(wahooCharacteristic, "wahooTrainer");
      this.wahoo = new WahooControl((value) => wahooCharacteristic.writeValueWithResponse(value));
      await this.wahoo.unlock();
      info.controlPath = "wahoo";
      this.log("warn", "No FTMS control point: using the unsupported Wahoo fallback.");
    } else {
      this.log("warn", "This trainer exposes no control point: power and cadence only, no ERG.");
    }

    const feature = info.feature?.machine;
    this.info = info;
    this.caps = {
      power: (indoorBikeData !== undefined && (feature?.powerMeasurement ?? true)) || powerMeasurement !== undefined,
      cadence:
        (indoorBikeData !== undefined && (feature?.cadence ?? false)) ||
        (info.cyclingPowerFeature?.crankRevolutionData ?? false),
      heartRate: indoorBikeData !== undefined && (feature?.heartRateMeasurement ?? false),
      targetPower: info.controlPath === "wahoo" || (info.controlPath === "ftms" && (info.feature?.target.power ?? true)),
      powerRange: info.powerRange,
    };
    this.emitter.emit("diagnostic", { type: "changed" });

    // Targets sent before Request Control succeeds are ignored, so take
    // control as part of connecting. A denial (another app has control) still
    // connects, for data; a control point that never answers fails the attempt.
    if (this.control) {
      const granted = await this.acquireControl();
      if (this.control.desynchronized) {
        throw new Error(server.connected ? "The control point did not answer Request Control." : "The link dropped during setup");
      }
      if (!granted) this.log("error", "Another app has control of the trainer. Close it, then press Retry.");
    }
  }

  private async readDecoded<N extends CharacteristicName>(
    characteristic: GattCharacteristic | undefined,
    name: N,
  ): Promise<ReturnType<(typeof characteristicDecoders)[N]> | null> {
    if (!characteristic) return null;
    try {
      const view = await characteristic.readValue();
      const decoded = characteristicDecoders[name](view) as ReturnType<(typeof characteristicDecoders)[N]>;
      this.emitter.emit("diagnostic", { type: "notification", atMs: this.options.clock.now(), characteristic: name, hex: toHex(view), decoded });
      return decoded;
    } catch (error) {
      this.log("warn", `Could not read ${name}: ${errorMessage(error)}`);
      return null;
    }
  }

  private async subscribe(
    characteristic: GattCharacteristic,
    name: CharacteristicName,
    handle: (decoded: unknown, view: DataView) => void,
  ): Promise<void> {
    const listener = () => {
      const view = characteristic.value;
      if (!view) return;
      const atMs = this.options.clock.now();
      let decoded: unknown;
      try {
        decoded = characteristicDecoders[name](view);
      } catch (error) {
        this.emitter.emit("diagnostic", { type: "notification", atMs, characteristic: name, hex: toHex(view), error: errorMessage(error) });
        return;
      }
      const derived = name === "cyclingPowerMeasurement" ? this.deriveCadence(decoded as CyclingPowerMeasurement, atMs) : undefined;
      this.emitter.emit("diagnostic", { type: "notification", atMs, characteristic: name, hex: toHex(view), decoded, derived });
      handle(decoded, view);
    };
    characteristic.addEventListener("characteristicvaluechanged", listener);
    this.cleanups.push(() => characteristic.removeEventListener("characteristicvaluechanged", listener));
    await characteristic.startNotifications();
  }

  private async subscribeRaw(characteristic: GattCharacteristic, name: "wahooTrainer"): Promise<void> {
    const listener = () => {
      const view = characteristic.value;
      if (view) this.emitter.emit("diagnostic", { type: "notification", atMs: this.options.clock.now(), characteristic: name, hex: toHex(view) });
    };
    characteristic.addEventListener("characteristicvaluechanged", listener);
    this.cleanups.push(() => characteristic.removeEventListener("characteristicvaluechanged", listener));
    await characteristic.startNotifications().catch((error: unknown) => this.log("warn", `Wahoo notifications: ${errorMessage(error)}`));
  }

  // Drops everything tied to one GATT connection.
  private teardownConnection(): void {
    this.stopWatchdog();
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups = [];
    this.characteristics.clear();
    this.control?.abortAll();
    this.control = null;
    this.wahoo = null;
    this.controlRequest = null;
    this.reclaimedAfterLoss = false;
    this.dataStreams.clear();
    this.previousCrank = null;
    this.cyclingPowerCadence = undefined;
    this.lastCadenceRpm = undefined;
    if (this.info.controlState !== "none") {
      this.info = { ...this.info, controlState: "none" };
      this.emitter.emit("diagnostic", { type: "changed" });
    }
  }

  private handleStatus(status: TrainerStatus): void {
    const previous = this.previousStatus;
    this.previousStatus = status;
    if (status === "reconnecting") {
      this.awaitingPostReconnectTarget = true;
      this.postReconnectTarget = null;
    }
    this.emitter.emit("status", status);
    this.emitter.emit("diagnostic", { type: "changed" });
    if (status !== "connected") return;
    if (previous !== "reconnecting") this.awaitingPostReconnectTarget = false;
    // Silence is measured from now: setup may have taken a while.
    const now = this.options.clock.now();
    for (const stream of this.dataStreams.values()) stream.lastAtMs = now;
    this.startWatchdog();
    // After a reconnect the trainer has forgotten the target.
    if (this.lastTargetWatts !== null && this.ergEnabled) void this.setTargetPower(this.lastTargetWatts);
    else if (!this.ergEnabled) void this.setErgEnabled(false);
  }

  // Control ---------------------------------------------------------------------

  private setControlState(controlState: ControlState): void {
    if (this.info.controlState === controlState) return;
    this.info = { ...this.info, controlState };
    this.emitter.emit("diagnostic", { type: "changed" });
  }

  // One Request Control at a time; concurrent callers share it.
  private acquireControl(): Promise<boolean> {
    if (!this.control) return Promise.resolve(false);
    this.controlRequest ??= this.doRequestControl().finally(() => {
      this.controlRequest = null;
    });
    return this.controlRequest;
  }

  private async doRequestControl(): Promise<boolean> {
    const control = this.control;
    if (!control) return false;
    this.setControlState("requesting");
    const outcome = await control.send(encodeRequestControl());
    this.logOutcome("Request Control", outcome);
    if (control !== this.control) return false;
    const granted = outcome.status === "response" && outcome.response.result === "success";
    this.setControlState(granted ? "granted" : "denied");
    if (!granted) return false;
    // "Operation failed" here means the session is already running.
    this.logOutcome("Start or Resume", await control.send(encodeStartOrResume()));
    return true;
  }

  // Waits for a Request Control already in flight, or asks for control when
  // none was asked for on this connection. After a denial or a loss it does not
  // ask again by itself: the rider closes the other app and presses Retry.
  private async ensureControl(): Promise<boolean> {
    if (this.controlRequest) return this.controlRequest;
    const state = this.info.controlState;
    if (state === "granted") return true;
    if (state === "denied" || state === "lost") return false;
    return this.acquireControl();
  }

  private async writeFtmsTarget(
    watts: number,
    clamped: boolean,
    generation: number,
    isRetry: boolean,
  ): Promise<TargetPowerResult> {
    const control = this.control;
    if (!control) return { status: "rejected", reason: "notConnected" };
    const granted = await this.ensureControl();
    if (generation !== this.targetGeneration) return { status: "superseded" };
    if (!granted) return { status: "rejected", reason: "controlNotPermitted" };

    const outcome = await control.setTargetPower(watts);
    this.logOutcome(`Set Target Power ${watts} W`, outcome);
    switch (outcome.status) {
      case "superseded":
        return { status: "superseded" };
      case "timeout":
        return { status: "timeout" };
      case "linkLost":
        return { status: "rejected", reason: "notConnected" };
      case "writeFailed":
        return { status: "rejected", reason: "operationFailed" };
    }
    switch (outcome.response.result) {
      case "success":
        this.retryWhenPedaling = null;
        return { status: "applied", watts, clamped };
      case "controlNotPermitted":
        this.setControlState("lost");
        if (!isRetry && (await this.acquireControl())) return this.writeFtmsTarget(watts, clamped, generation, true);
        if (generation !== this.targetGeneration) return { status: "superseded" };
        return { status: "rejected", reason: "controlNotPermitted" };
      case "operationFailed":
        // A KICKR refuses targets while the flywheel is stopped: retry once the
        // rider pedals, but not in a loop when it fails while pedaling.
        if (!this.lastCadenceRpm) this.retryWhenPedaling = watts;
        return { status: "rejected", reason: "operationFailed" };
      case "invalidParameter":
        return { status: "rejected", reason: "invalidParameter" };
      case "opCodeNotSupported":
        return { status: "rejected", reason: "notSupported" };
      default:
        return { status: "rejected", reason: "operationFailed" };
    }
  }

  private handleMachineStatus(status: FitnessMachineStatus): void {
    switch (status.type) {
      case "controlPermissionLost":
        this.setControlState("lost");
        if (this.reclaimedAfterLoss) {
          this.log("error", "Another app took control of the trainer. Close it, then press Request control.");
          return;
        }
        this.reclaimedAfterLoss = true;
        this.log("warn", "Trainer reports control permission lost; requesting control again once.");
        void this.requestControl();
        return;
      case "targetPowerChanged":
        this.log("info", `Trainer confirms target power ${status.watts} W.`);
        return;
      case "stoppedOrPausedByUser":
        this.log("warn", `Trainer reports the session was ${status.action === "pause" ? "paused" : "stopped"} on the device.`);
        return;
      default:
        this.log("info", `Fitness Machine Status: ${status.type}`);
    }
  }

  private logOutcome(label: string, outcome: ControlOutcome): void {
    if (outcome.status === "response") {
      const { result } = outcome.response;
      this.log(
        result === "success" ? "info" : "warn",
        `${label}: ${result} (${Math.round(outcome.latencyMs)} ms, ${opName(outcome.response.requestOpCode)})`,
      );
    } else if (outcome.status !== "superseded") {
      this.log("warn", `${label}: ${outcome.status}${outcome.status === "writeFailed" ? ` (${outcome.error})` : ""}`);
    }
  }

  // Data ------------------------------------------------------------------------

  private markData(stream: string, atMs: number): void {
    const entry = this.dataStreams.get(stream);
    if (!entry) return;
    entry.lastAtMs = atMs;
    entry.resubscribed = false;
  }

  private handleIndoorBikeData(data: IndoorBikeData): void {
    const atMs = this.options.clock.now();
    this.markData("indoorBikeData", atMs);
    this.lastIndoorBikeDataAtMs = atMs;
    this.emitSample(atMs, data.powerWatts, data.cadenceRpm, data.heartRateBpm);
  }

  private deriveCadence(data: CyclingPowerMeasurement, atMs: number): { cadenceRpm?: number } {
    if (!data.crank) return {};
    if (this.previousCrank) {
      const rpm = crankCadenceRpm(this.previousCrank, data.crank);
      if (rpm !== null) {
        this.cyclingPowerCadence = rpm;
        this.lastCrankEventAtMs = atMs;
      } else if (atMs - this.lastCrankEventAtMs > this.options.cadenceTimeoutMs) {
        this.cyclingPowerCadence = 0;
      }
    } else {
      this.lastCrankEventAtMs = atMs;
    }
    this.previousCrank = data.crank;
    return this.cyclingPowerCadence === undefined ? {} : { cadenceRpm: this.cyclingPowerCadence };
  }

  // Cycling Power feeds the ride only when Indoor Bike Data is absent or silent,
  // so one trainer never counts as two power sources.
  private handlePowerMeasurement(data: CyclingPowerMeasurement): void {
    const atMs = this.options.clock.now();
    this.markData("cyclingPowerMeasurement", atMs);
    if (atMs - this.lastIndoorBikeDataAtMs <= this.options.staleResubscribeMs) return;
    this.emitSample(atMs, data.powerWatts, data.crank ? this.cyclingPowerCadence : undefined, undefined);
  }

  private emitSample(atMs: number, power?: number, cadence?: number, heartRate?: number): void {
    if (power === undefined && cadence === undefined && heartRate === undefined) return;
    if (cadence !== undefined) this.lastCadenceRpm = cadence;
    this.emitter.emit("sample", {
      timestampMs: atMs,
      source: "trainer",
      power: power === undefined ? undefined : Math.max(0, Math.round(power)),
      cadence: cadence === undefined ? undefined : Math.round(cadence),
      heartRate,
    });
    if (this.retryWhenPedaling !== null && cadence !== undefined && cadence > 0 && this.ergEnabled) {
      const watts = this.retryWhenPedaling;
      this.retryWhenPedaling = null;
      this.log("info", `Pedaling again: re-sending ${watts} W.`);
      void this.setTargetPower(watts);
    }
  }

  // Watchdog: a connected but silent trainer ------------------------------------

  private startWatchdog(): void {
    if (this.watchdog !== null) return;
    this.watchdog = this.options.clock.setTimeout(() => {
      this.watchdog = null;
      this.checkSilence();
      if (this.status === "connected") this.startWatchdog();
    }, WATCHDOG_INTERVAL_MS);
  }

  private stopWatchdog(): void {
    if (this.watchdog !== null) this.options.clock.clearTimeout(this.watchdog);
    this.watchdog = null;
  }

  // Every notifying data characteristic is expected to notify: a stream
  // silent for staleResubscribeMs gets its notifications restarted, and when
  // all of them have been silent for staleReconnectMs the link is rebuilt. One
  // stream stopping while another flows only restarts that stream.
  private checkSilence(): void {
    if (this.status !== "connected" || this.dataStreams.size === 0) return;
    const now = this.options.clock.now();
    const streams = [...this.dataStreams.values()];
    const newestAgeMs = Math.min(...streams.map((stream) => now - stream.lastAtMs));
    if (newestAgeMs >= this.options.staleReconnectMs) {
      this.link.forceReconnect(`no trainer data for ${Math.round(newestAgeMs / 1000)} s`);
      return;
    }
    const silent = streams.filter((stream) => now - stream.lastAtMs >= this.options.staleResubscribeMs);
    const due = silent.filter((stream) => !stream.resubscribed);
    if (due.length === 0) return;
    if (silent.length === streams.length) {
      this.log("warn", `No trainer data for ${Math.round(newestAgeMs / 1000)} s; restarting notifications.`);
    } else {
      for (const stream of due) {
        this.log("warn", `No ${stream.label} for ${Math.round((now - stream.lastAtMs) / 1000)} s; restarting its notifications.`);
      }
    }
    for (const stream of due) {
      stream.resubscribed = true;
      stream.characteristic
        .stopNotifications()
        .then(() => stream.characteristic.startNotifications())
        .catch((error: unknown) => this.log("warn", `Restarting ${stream.label} notifications failed: ${errorMessage(error)}`));
    }
  }

  private log(level: "info" | "warn" | "error", message: string): void {
    this.emitter.emit("diagnostic", { type: "log", atMs: this.options.clock.now(), level, message });
  }
}
