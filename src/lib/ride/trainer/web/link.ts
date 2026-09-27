import type { TrainerStatus } from "../../engine/types";
import type { SimClock } from "../SimulatedTrainer";
import type { BluetoothDeviceLike, GattServer } from "./bluetooth";

// One GATT connection with automatic reconnect. The BluetoothDevice object
// stays valid after a drop, so `gatt.connect()` reconnects without a chooser
// for as long as the page is not reloaded.

export interface ReconnectPolicy {
  // Delay before attempt n (0-based): initial * 2^n, capped.
  initialDelayMs: number;
  maxDelayMs: number;
  // Stop retrying once this much time has passed since the drop.
  giveUpAfterMs: number;
  // A connect attempt that has not settled by now counts as failed.
  attemptTimeoutMs: number;
}

export const defaultReconnectPolicy: ReconnectPolicy = {
  initialDelayMs: 500,
  maxDelayMs: 5000,
  giveUpAfterMs: 60_000,
  attemptTimeoutMs: 10_000,
};

// 500, 1000, 2000, 4000, 5000, 5000, ...
export function backoffDelayMs(attempt: number, policy: ReconnectPolicy = defaultReconnectPolicy): number {
  return Math.min(policy.maxDelayMs, policy.initialDelayMs * 2 ** attempt);
}

export interface GattLinkHooks {
  // Discovers services and subscribes. Runs on every connect and reconnect;
  // throwing fails the attempt.
  setup(server: GattServer): Promise<void>;
  onStatus(status: TrainerStatus): void;
  // The link dropped unexpectedly; drop per-connection state.
  onLinkLost(): void;
  // Automatic reconnect failed for giveUpAfterMs.
  onGaveUp(): void;
  log(level: "info" | "warn" | "error", message: string): void;
}

class AttemptTimeout extends Error {}

export class GattLink {
  private currentStatus: TrainerStatus = "disconnected";
  // Bumped whenever the link is torn down; late work from an older link checks it.
  private generation = 0;
  private wantConnected = false;
  private reconnectTimer: number | null = null;
  private lostAtMs = 0;
  private attempt = 0;
  private connecting = false;
  reconnectCount = 0;

  constructor(
    readonly device: BluetoothDeviceLike,
    private readonly clock: SimClock,
    private readonly hooks: GattLinkHooks,
    private readonly policy: ReconnectPolicy = defaultReconnectPolicy,
  ) {
    device.addEventListener("gattserverdisconnected", () => this.handleDisconnected());
  }

  get status(): TrainerStatus {
    return this.currentStatus;
  }

  get linkGeneration(): number {
    return this.generation;
  }

  // Connects (or takes over from a running reconnect loop and tries now).
  async connect(): Promise<void> {
    if (this.currentStatus === "connected") return;
    this.wantConnected = true;
    this.cancelReconnectTimer();
    this.setStatus("connecting");
    try {
      await this.attemptConnect();
    } catch (error) {
      this.wantConnected = false;
      this.setStatus("disconnected");
      throw error;
    }
    this.setStatus("connected");
  }

  async disconnect(): Promise<void> {
    this.wantConnected = false;
    this.cancelReconnectTimer();
    this.generation += 1;
    this.device.gatt?.disconnect();
    this.setStatus("disconnected");
  }

  // Drops the link on purpose so the reconnect loop rebuilds it (used when a
  // connected trainer goes silent).
  forceReconnect(reason: string): void {
    if (this.currentStatus !== "connected") return;
    this.hooks.log("warn", `Forcing a reconnect: ${reason}`);
    const server = this.device.gatt;
    if (server?.connected) {
      server.disconnect();
      // Chrome fires gattserverdisconnected for a local disconnect too; the
      // handler below ignores it if it already ran.
    }
    this.handleDisconnected();
  }

  private setStatus(status: TrainerStatus): void {
    if (status === this.currentStatus) return;
    this.currentStatus = status;
    this.hooks.onStatus(status);
  }

  private cancelReconnectTimer(): void {
    if (this.reconnectTimer !== null) this.clock.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private async attemptConnect(): Promise<void> {
    const server = this.device.gatt;
    if (!server) throw new Error("This device has no GATT server.");
    const generation = ++this.generation;
    this.connecting = true;
    try {
      await this.withTimeout(
        (async () => {
          const connected = await server.connect();
          if (generation !== this.generation) throw new Error("Superseded connect attempt");
          await this.hooks.setup(connected);
          if (generation !== this.generation) throw new Error("Superseded connect attempt");
          if (!connected.connected) throw new Error("The link dropped during setup");
        })(),
      );
    } catch (error) {
      // Cancel a half-open connection so the next attempt starts clean.
      if (generation === this.generation) {
        this.generation += 1;
        server.disconnect();
      }
      throw error;
    } finally {
      this.connecting = false;
    }
  }

  private withTimeout<T>(work: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = this.clock.setTimeout(
        () => reject(new AttemptTimeout(`No connection after ${this.policy.attemptTimeoutMs} ms`)),
        this.policy.attemptTimeoutMs,
      );
      work.then(
        (value) => {
          this.clock.clearTimeout(timer);
          resolve(value);
        },
        (error: unknown) => {
          this.clock.clearTimeout(timer);
          reject(error);
        },
      );
    });
  }

  private handleDisconnected(): void {
    // Our own attempts and requested disconnects end up here too.
    if (!this.wantConnected || this.connecting) return;
    if (this.currentStatus !== "connected") return;
    this.generation += 1;
    this.lostAtMs = this.clock.now();
    this.attempt = 0;
    this.reconnectCount += 1;
    this.hooks.log("warn", "Link lost; reconnecting.");
    this.hooks.onLinkLost();
    this.setStatus("reconnecting");
    this.scheduleAttempt();
  }

  private scheduleAttempt(): void {
    const delay = backoffDelayMs(this.attempt, this.policy);
    const elapsed = this.clock.now() - this.lostAtMs;
    if (elapsed + delay > this.policy.giveUpAfterMs) {
      this.wantConnected = false;
      this.hooks.log("error", `Gave up reconnecting after ${Math.round(elapsed / 1000)} s.`);
      this.setStatus("disconnected");
      this.hooks.onGaveUp();
      return;
    }
    this.reconnectTimer = this.clock.setTimeout(() => {
      this.reconnectTimer = null;
      void this.reconnectAttempt();
    }, delay);
  }

  private async reconnectAttempt(): Promise<void> {
    if (!this.wantConnected || this.currentStatus !== "reconnecting") return;
    const attempt = ++this.attempt;
    try {
      await this.attemptConnect();
    } catch (error) {
      if (!this.wantConnected || this.currentStatus !== "reconnecting") return;
      this.hooks.log("info", `Reconnect attempt ${attempt} failed: ${errorMessage(error)}`);
      this.scheduleAttempt();
      return;
    }
    if (!this.wantConnected || this.currentStatus !== "reconnecting") return;
    this.hooks.log("info", `Reconnected after ${attempt} attempt(s).`);
    this.setStatus("connected");
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
