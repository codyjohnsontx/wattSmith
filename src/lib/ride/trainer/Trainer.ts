import type { TrainerSample, TrainerStatus } from "../engine/types";

// The contract every trainer implements: the simulator, the Web Bluetooth
// trainer, and later a native one. The engine never sees this interface; a
// driver forwards trainer events into the reducer and the reducer's
// `trainerCommands` back into these methods.

export interface PowerRange {
  minWatts: number;
  maxWatts: number;
  incrementWatts: number;
}

export interface TrainerCapabilities {
  power: boolean;
  cadence: boolean;
  heartRate: boolean;
  targetPower: boolean;
  powerRange: PowerRange | null;
}

export type TargetPowerRejection =
  | "notConnected"
  | "notSupported"
  | "invalidParameter"
  | "operationFailed"
  | "controlNotPermitted";

export type TargetPowerResult =
  | { status: "applied"; watts: number; clamped: boolean }
  // A newer target replaced this one before it was written.
  | { status: "superseded" }
  // No control point response within the timeout; the next write may proceed.
  | { status: "timeout" }
  | { status: "rejected"; reason: TargetPowerRejection };

export interface TrainerEvents {
  sample: TrainerSample & { timestampMs: number };
  status: TrainerStatus;
  disconnect: { reason: string };
}

export type TrainerListener<K extends keyof TrainerEvents> = (payload: TrainerEvents[K]) => void;

export interface Trainer {
  readonly status: TrainerStatus;
  readonly capabilities: TrainerCapabilities;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  setTargetPower(watts: number): Promise<TargetPowerResult>;
  setErgEnabled(enabled: boolean): Promise<void>;
  // Returns an unsubscribe function.
  on<K extends keyof TrainerEvents>(event: K, listener: TrainerListener<K>): () => void;
}

export class TrainerEmitter {
  private listeners: { [K in keyof TrainerEvents]: Set<TrainerListener<K>> } = {
    sample: new Set(),
    status: new Set(),
    disconnect: new Set(),
  };

  on<K extends keyof TrainerEvents>(event: K, listener: TrainerListener<K>): () => void {
    const set = this.listeners[event] as Set<TrainerListener<K>>;
    set.add(listener);
    return () => set.delete(listener);
  }

  emit<K extends keyof TrainerEvents>(event: K, payload: TrainerEvents[K]): void {
    for (const listener of this.listeners[event] as Set<TrainerListener<K>>) listener(payload);
  }
}

// Clamps a target to what the trainer reports it can hold.
export function clampToPowerRange(watts: number, range: PowerRange | null): number {
  if (!range) return Math.round(watts);
  const step = Math.max(1, range.incrementWatts);
  const stepped = range.minWatts + Math.round((watts - range.minWatts) / step) * step;
  return Math.min(range.maxWatts, Math.max(range.minWatts, stepped));
}
