import type { TrainerStatus } from "../engine/types";
import { clampToPowerRange, TrainerEmitter } from "./Trainer";
import type {
  PowerRange,
  TargetPowerResult,
  Trainer,
  TrainerCapabilities,
  TrainerEvents,
  TrainerListener,
} from "./Trainer";

// A deterministic software trainer. Time comes from an injected clock, so tests
// run an hour-long ride in milliseconds with ManualClock while a demo page can
// pass a real-time clock. Randomness comes from a seeded PRNG.

export interface SimClock {
  now(): number;
  setTimeout(callback: () => void, ms: number): number;
  clearTimeout(handle: number): void;
}

// A clock that only moves when told to; timers fire in due order.
export class ManualClock implements SimClock {
  private current: number;
  private nextHandle = 1;
  private timers = new Map<number, { at: number; callback: () => void }>();

  constructor(startMs = 0) {
    this.current = startMs;
  }

  now(): number {
    return this.current;
  }

  setTimeout(callback: () => void, ms: number): number {
    const handle = this.nextHandle++;
    this.timers.set(handle, { at: this.current + Math.max(0, ms), callback });
    return handle;
  }

  clearTimeout(handle: number): void {
    this.timers.delete(handle);
  }

  advance(ms: number): void {
    const target = this.current + ms;
    for (;;) {
      let dueHandle: number | null = null;
      let dueAt = Infinity;
      for (const [handle, timer] of this.timers) {
        if (timer.at <= target && timer.at < dueAt) {
          dueAt = timer.at;
          dueHandle = handle;
        }
      }
      if (dueHandle === null) break;
      const timer = this.timers.get(dueHandle)!;
      this.timers.delete(dueHandle);
      this.current = timer.at;
      timer.callback();
    }
    this.current = target;
  }
}

export interface SimulatedTrainerOptions {
  seed: number;
  riderFtp: number;
  cadenceSetpoint: number;
  restHeartRate: number;
  maxHeartRate: number;
  heartRateTimeConstantS: number;
  ergTimeConstantS: number;
  // Uniform power noise as a fraction of power.
  powerNoise: number;
  // Overshoot on a step increase, as a fraction of the step, capped.
  overshootFraction: number;
  maxOvershootWatts: number;
  // Power at the cadence set point with ERG off.
  freeRideWatts: number;
  powerRange: PowerRange;
  sampleIntervalMs: number;
  controlTimeoutMs: number;
}

export const defaultSimulatedTrainerOptions: SimulatedTrainerOptions = {
  seed: 1,
  riderFtp: 250,
  cadenceSetpoint: 88,
  restHeartRate: 60,
  maxHeartRate: 185,
  heartRateTimeConstantS: 30,
  ergTimeConstantS: 2,
  powerNoise: 0.03,
  overshootFraction: 0.1,
  maxOvershootWatts: 15,
  freeRideWatts: 150,
  powerRange: { minWatts: 0, maxWatts: 2000, incrementWatts: 1 },
  sampleIntervalMs: 1000,
  controlTimeoutMs: 1000,
};

// mulberry32: small, fast, and identical on every platform.
function createRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const OVERSHOOT_PEAK_S = 3;

interface QueuedWrite {
  watts: number;
  resolve: (result: TargetPowerResult) => void;
}

export class SimulatedTrainer implements Trainer {
  readonly options: SimulatedTrainerOptions;
  private readonly clock: SimClock;
  private readonly emitter = new TrainerEmitter();
  private readonly random: () => number;

  private currentStatus: TrainerStatus = "disconnected";
  private caps: TrainerCapabilities;
  private connectedAtMs = 0;
  private sampleTimer: number | null = null;
  private reconnectTimer: number | null = null;

  // Rider and flywheel model.
  private cadence: number;
  private cadenceSetpoint: number;
  private basePower = 0;
  private overshootWatts = 0;
  private secondsSinceStep = Infinity;
  private heartRate: number;
  private ergEnabled = true;
  private appliedTarget: number | null = null;

  // Control point: one outstanding write, newest queued write wins.
  private writeInFlight = false;
  private queuedWrite: QueuedWrite | null = null;
  // Bumped on every link loss; responses from an older link are dropped.
  private linkGeneration = 0;

  // Failure injection.
  private dropAtMs: number | null = null;
  private dropDownForMs: number | null = null;
  private responseDelayMs = 0;
  private rejectAboveWatts: number | null = null;
  private cadenceOmitted = false;
  private heartRateOmitted = false;

  constructor(clock: SimClock, options: Partial<SimulatedTrainerOptions> = {}) {
    this.clock = clock;
    this.options = { ...defaultSimulatedTrainerOptions, ...options };
    this.random = createRandom(this.options.seed);
    this.cadence = this.options.cadenceSetpoint;
    this.cadenceSetpoint = this.options.cadenceSetpoint;
    this.heartRate = this.options.restHeartRate;
    this.caps = {
      power: true,
      cadence: true,
      heartRate: true,
      targetPower: true,
      powerRange: { ...this.options.powerRange },
    };
  }

  get status(): TrainerStatus {
    return this.currentStatus;
  }

  get capabilities(): TrainerCapabilities {
    return this.caps;
  }

  get targetWatts(): number | null {
    return this.appliedTarget;
  }

  on<K extends keyof TrainerEvents>(event: K, listener: TrainerListener<K>): () => void {
    return this.emitter.on(event, listener);
  }

  async connect(): Promise<void> {
    if (this.currentStatus === "connected") return;
    this.setStatus("connecting");
    this.connectedAtMs = this.clock.now();
    this.setStatus("connected");
    this.scheduleSample();
  }

  async disconnect(): Promise<void> {
    this.stopTimers();
    this.loseLink();
    this.setStatus("disconnected");
    this.emitter.emit("disconnect", { reason: "requested" });
  }

  async setErgEnabled(enabled: boolean): Promise<void> {
    this.ergEnabled = enabled;
  }

  setTargetPower(watts: number): Promise<TargetPowerResult> {
    return new Promise((resolve) => {
      if (this.currentStatus !== "connected") {
        resolve({ status: "rejected", reason: "notConnected" });
        return;
      }
      if (this.writeInFlight) {
        this.queuedWrite?.resolve({ status: "superseded" });
        this.queuedWrite = { watts, resolve };
        return;
      }
      this.write(Math.round(watts), resolve);
    });
  }

  // Rider behavior: 0 stops pedaling.
  setCadence(rpm: number): void {
    this.cadenceSetpoint = rpm;
    if (rpm === 0) this.cadence = 0;
  }

  // Failure injection ---------------------------------------------------------

  // Drops the link `seconds` after connect. With `downForMs` the trainer
  // reconnects on its own (as the Bluetooth layer's backoff does); without it
  // the link stays down.
  dropConnectionAt(seconds: number, downForMs?: number): void {
    this.dropAtMs = seconds * 1000;
    this.dropDownForMs = downForMs ?? null;
  }

  delayControlResponse(ms: number): void {
    this.responseDelayMs = ms;
  }

  // The control point answers "invalid parameter" above `watts`, and the
  // supported power range the trainer reports shrinks to match.
  rejectTargetsAbove(watts: number): void {
    this.rejectAboveWatts = watts;
    this.caps = {
      ...this.caps,
      powerRange: { ...this.options.powerRange, maxWatts: Math.min(this.options.powerRange.maxWatts, watts) },
    };
  }

  omitCadence(omit = true): void {
    this.cadenceOmitted = omit;
    this.caps = { ...this.caps, cadence: !omit };
  }

  omitHeartRate(omit = true): void {
    this.heartRateOmitted = omit;
    this.caps = { ...this.caps, heartRate: !omit };
  }

  // Internals -----------------------------------------------------------------

  private setStatus(status: TrainerStatus): void {
    if (status === this.currentStatus) return;
    this.currentStatus = status;
    this.emitter.emit("status", status);
  }

  private stopTimers(): void {
    if (this.sampleTimer !== null) this.clock.clearTimeout(this.sampleTimer);
    if (this.reconnectTimer !== null) this.clock.clearTimeout(this.reconnectTimer);
    this.sampleTimer = null;
    this.reconnectTimer = null;
  }

  private scheduleSample(): void {
    this.sampleTimer = this.clock.setTimeout(() => this.step(), this.options.sampleIntervalMs);
  }

  private step(): void {
    this.sampleTimer = null;
    if (this.dropAtMs !== null && this.clock.now() - this.connectedAtMs >= this.dropAtMs) {
      this.drop();
      return;
    }

    this.updateModel(this.options.sampleIntervalMs / 1000);
    this.emitter.emit("sample", {
      timestampMs: this.clock.now(),
      source: "simulator",
      power: Math.round(this.currentPower()),
      cadence: this.cadenceOmitted ? undefined : Math.round(this.cadence),
      heartRate: this.heartRateOmitted ? undefined : Math.round(this.heartRate),
    });
    this.scheduleSample();
  }

  private loseLink(): void {
    this.linkGeneration += 1;
    this.writeInFlight = false;
    this.queuedWrite?.resolve({ status: "rejected", reason: "notConnected" });
    this.queuedWrite = null;
  }

  private drop(): void {
    this.dropAtMs = null;
    this.loseLink();

    if (this.dropDownForMs === null) {
      this.setStatus("disconnected");
      this.emitter.emit("disconnect", { reason: "link lost" });
      return;
    }

    this.setStatus("reconnecting");
    this.reconnectTimer = this.clock.setTimeout(() => {
      this.reconnectTimer = null;
      this.connectedAtMs = this.clock.now();
      this.setStatus("connected");
      this.scheduleSample();
    }, this.dropDownForMs);
  }

  private currentPower(): number {
    if (this.cadence <= 0) return 0;
    const noise = 1 + (this.random() * 2 - 1) * this.options.powerNoise;
    // A bump that peaks OVERSHOOT_PEAK_S after a step increase, then fades.
    const s = this.secondsSinceStep / OVERSHOOT_PEAK_S;
    const bump = Number.isFinite(s) ? this.overshootWatts * s * Math.exp(1 - s) : 0;
    return Math.max(0, (this.basePower + bump) * noise);
  }

  private updateModel(dt: number): void {
    const { options } = this;

    if (this.cadenceSetpoint > 0) {
      const drift = (this.random() * 2 - 1) * 1.5;
      this.cadence += (this.cadenceSetpoint - this.cadence) * 0.2 + drift;
    } else {
      this.cadence = 0;
    }

    const goal =
      this.ergEnabled && this.appliedTarget !== null
        ? this.appliedTarget
        : options.freeRideWatts * (this.cadence / options.cadenceSetpoint) ** 2;
    this.basePower += (goal - this.basePower) * (1 - Math.exp(-dt / options.ergTimeConstantS));
    this.secondsSinceStep += dt;

    const power = this.cadence > 0 ? this.basePower : 0;
    const intensity = Math.min(1.2, Math.max(0, power / options.riderFtp));
    const hrGoal = Math.min(
      options.maxHeartRate,
      options.restHeartRate + (options.maxHeartRate - options.restHeartRate) * intensity ** 0.9,
    );
    this.heartRate += (hrGoal - this.heartRate) * (1 - Math.exp(-dt / options.heartRateTimeConstantS));
  }

  private applyTarget(watts: number): void {
    const step = watts - (this.appliedTarget ?? this.basePower);
    if (step > 0) {
      this.overshootWatts = Math.min(this.options.maxOvershootWatts, step * this.options.overshootFraction);
      this.secondsSinceStep = 0;
    }
    this.appliedTarget = watts;
  }

  // Models the FTMS control point: the response arrives after the injected
  // delay; a missing response times out; "invalid parameter" triggers one
  // retry clamped to the reported supported power range.
  private write(watts: number, resolve: (result: TargetPowerResult) => void, isRetry = false): void {
    this.writeInFlight = true;
    const generation = this.linkGeneration;
    let settled = false;

    const settle = (result: TargetPowerResult) => {
      if (settled) return;
      settled = true;
      this.clock.clearTimeout(timeout);
      resolve(result);
      if (generation !== this.linkGeneration) return;
      this.writeInFlight = false;
      const queued = this.queuedWrite;
      this.queuedWrite = null;
      if (queued && this.currentStatus === "connected") this.write(Math.round(queued.watts), queued.resolve);
    };

    const timeout = this.clock.setTimeout(() => settle({ status: "timeout" }), this.options.controlTimeoutMs);

    const respond = () => {
      if (this.currentStatus !== "connected" || generation !== this.linkGeneration) {
        settle({ status: "rejected", reason: "notConnected" });
        return;
      }
      if (this.rejectAboveWatts !== null && watts > this.rejectAboveWatts) {
        const clamped = clampToPowerRange(watts, this.caps.powerRange);
        if (isRetry || settled || clamped === watts) {
          settle({ status: "rejected", reason: "invalidParameter" });
          return;
        }
        this.clock.clearTimeout(timeout);
        settled = true;
        this.write(clamped, resolve, true);
        return;
      }
      // A late response still changes the trainer, like real hardware.
      this.applyTarget(watts);
      settle({ status: "applied", watts, clamped: isRetry });
    };

    if (this.responseDelayMs <= 0) {
      respond();
    } else {
      this.clock.setTimeout(respond, this.responseDelayMs);
    }
  }
}
