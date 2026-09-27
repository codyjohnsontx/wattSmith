import { characteristicDecoders } from "./codec";
import type { CharacteristicName } from "./codec";
import type { DeviceInformation, DiagnosticEvent } from "./WebBluetoothTrainer";

// The byte capture the diagnostics page records ("Record 30 s of raw
// notifications") and codec.test.ts decodes once it is committed under
// src/lib/ride/trainer/web/fixtures/. Both sides use this module, so the file
// the owner downloads is exactly the file the tests read.

// Browsers may append " (1)" to a repeated download; that still matches.
export const CAPTURE_FILE_PATTERN = /^kickr-core-.+\.json$/;

export interface CaptureNotification {
  characteristic: CharacteristicName;
  hex: string;
  // Milliseconds since the recording started.
  tMs: number;
}

export interface CaptureFile {
  device: string | null;
  deviceInformation: DeviceInformation | null;
  recordedAt: string;
  userAgent: string;
  notifications: CaptureNotification[];
}

export function captureFileName(firmware: string | undefined): string {
  return `kickr-core-${(firmware || "unknown").replace(/[^0-9A-Za-z.-]+/g, "_")}.json`;
}

const isDecodable = (name: string): name is CharacteristicName => Object.hasOwn(characteristicDecoders, name);

export class CaptureRecorder {
  readonly notifications: CaptureNotification[] = [];

  constructor(readonly startedAtMs: number) {}

  // Keeps every notification a decoder exists for; proprietary payloads such
  // as the Wahoo characteristic's have no oracle to test against.
  add(event: Extract<DiagnosticEvent, { type: "notification" }>): void {
    if (!isDecodable(event.characteristic)) return;
    this.notifications.push({
      characteristic: event.characteristic,
      hex: event.hex,
      tMs: Math.round(event.atMs - this.startedAtMs),
    });
  }

  toFile(meta: Omit<CaptureFile, "notifications">): CaptureFile {
    return { ...meta, notifications: this.notifications };
  }
}

// Reads a committed capture, rejecting anything the recorder would not write.
export function parseCaptureFile(json: string): CaptureFile {
  const file = JSON.parse(json) as Partial<CaptureFile>;
  if (!Array.isArray(file.notifications) || file.notifications.length === 0) {
    throw new Error("Capture has no notifications.");
  }
  for (const [index, n] of file.notifications.entries()) {
    if (typeof n?.hex !== "string" || typeof n.tMs !== "number" || !isDecodable(String(n.characteristic))) {
      throw new Error(`Capture notification ${index} is malformed.`);
    }
  }
  return file as CaptureFile;
}
