import type { SimClock } from "../SimulatedTrainer";
import { controlOpCodeNames, decodeControlPointResponse, encodeSetTargetPower, toHex } from "./codec";
import type { ControlPointResponse } from "./codec";

// FTMS Control Point client. The spec allows one procedure at a time (a write
// while one is in progress fails with "Procedure Already In Progress",
// FTMS 4.16.3), so requests run strictly in order: write, then wait for the
// matching 0x80 indication before the next write. Target power writes
// coalesce: a queued target that has not been written yet is replaced by a
// newer one.
//
// A procedure is complete only when its indication arrives (FTMS 4.16.4); a
// local timeout does not end it on the trainer, and a late indication carries
// only the request op code, so it could be mistaken for a newer command's
// response. After a timeout the client is therefore desynchronized: it fails
// everything queued, refuses new work, and asks its owner to rebuild the GATT
// session.

export type ControlOutcome =
  | { status: "response"; response: ControlPointResponse; latencyMs: number }
  | { status: "timeout" }
  // A newer target replaced this one before it was written.
  | { status: "superseded" }
  // The GATT write itself failed (for example indications not enabled).
  | { status: "writeFailed"; error: string }
  // The link dropped, or the session desynchronized, before a response.
  | { status: "linkLost" };

export interface ControlPointTransport {
  write(value: DataView): Promise<void>;
}

interface Job {
  opCode: number;
  value: DataView;
  resolve: (outcome: ControlOutcome) => void;
  isTarget: boolean;
}

interface InFlight {
  job: Job;
  sentAtMs: number;
  timer: number | null;
}

export class FtmsControlPoint {
  private queue: Job[] = [];
  private inFlight: InFlight | null = null;
  private isDesynchronized = false;

  constructor(
    private readonly transport: ControlPointTransport,
    private readonly clock: SimClock,
    private readonly timeoutMs = 1000,
    private readonly log: (level: "info" | "warn", message: string) => void = () => {},
    // Called once when a timeout leaves the procedure state unknown.
    private readonly onDesynchronized: () => void = () => {},
  ) {}

  get desynchronized(): boolean {
    return this.isDesynchronized;
  }

  send(value: DataView): Promise<ControlOutcome> {
    return this.enqueue(value, false);
  }

  setTargetPower(watts: number): Promise<ControlOutcome> {
    return this.enqueue(encodeSetTargetPower(watts), true);
  }

  // Feed every Control Point indication here.
  handleIndication(value: DataView): void {
    let response: ControlPointResponse;
    try {
      response = decodeControlPointResponse(value);
    } catch (error) {
      this.log("warn", `Ignoring malformed control point indication ${toHex(value)}: ${(error as Error).message}`);
      return;
    }
    const current = this.inFlight;
    if (this.isDesynchronized) {
      this.log("warn", `Ignoring late control point response for ${opName(response.requestOpCode)}: ${response.result}`);
      return;
    }
    if (!current || current.job.opCode !== response.requestOpCode) {
      this.log("warn", `Unexpected control point response for ${opName(response.requestOpCode)}: ${response.result}`);
      return;
    }
    this.finish({ status: "response", response, latencyMs: this.clock.now() - current.sentAtMs });
  }

  // The link dropped: nothing in flight or queued will be answered.
  abortAll(): void {
    const pending = [...(this.inFlight ? [this.inFlight.job] : []), ...this.queue];
    if (this.inFlight?.timer != null) this.clock.clearTimeout(this.inFlight.timer);
    this.inFlight = null;
    this.queue = [];
    for (const job of pending) job.resolve({ status: "linkLost" });
  }

  private enqueue(value: DataView, isTarget: boolean): Promise<ControlOutcome> {
    return new Promise((resolve) => {
      if (this.isDesynchronized) {
        resolve({ status: "linkLost" });
        return;
      }
      if (isTarget) {
        const index = this.queue.findIndex((job) => job.isTarget);
        if (index >= 0) {
          this.queue[index].resolve({ status: "superseded" });
          this.queue.splice(index, 1);
        }
      }
      this.queue.push({ opCode: value.getUint8(0), value, resolve, isTarget });
      this.pump();
    });
  }

  private pump(): void {
    if (this.inFlight || this.queue.length === 0) return;
    const job = this.queue.shift()!;
    const inFlight: InFlight = { job, sentAtMs: this.clock.now(), timer: null };
    this.inFlight = inFlight;
    inFlight.timer = this.clock.setTimeout(() => {
      if (this.inFlight !== inFlight) return;
      this.log("warn", `No response to ${opName(job.opCode)} within ${this.timeoutMs} ms; rebuilding the session.`);
      this.desynchronize();
    }, this.timeoutMs);
    this.transport.write(job.value).catch((error: unknown) => {
      if (this.inFlight !== inFlight) return;
      this.finish({ status: "writeFailed", error: error instanceof Error ? error.message : String(error) });
    });
  }

  private desynchronize(): void {
    const current = this.inFlight;
    this.isDesynchronized = true;
    this.inFlight = null;
    const queued = this.queue;
    this.queue = [];
    current?.job.resolve({ status: "timeout" });
    for (const job of queued) job.resolve({ status: "linkLost" });
    this.onDesynchronized();
  }

  private finish(outcome: ControlOutcome): void {
    const current = this.inFlight;
    if (!current) return;
    if (current.timer !== null) this.clock.clearTimeout(current.timer);
    this.inFlight = null;
    current.job.resolve(outcome);
    this.pump();
  }
}

export function opName(opCode: number): string {
  return controlOpCodeNames[opCode] ?? `op code 0x${opCode.toString(16).padStart(2, "0")}`;
}
