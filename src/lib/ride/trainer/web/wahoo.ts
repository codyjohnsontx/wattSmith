import { encodeWahooSetErg, encodeWahooStandardMode, encodeWahooUnlock } from "./codec";

// Fallback control through Wahoo's proprietary trainer characteristic, for
// KICKR firmware without FTMS. Off by default (NEXT_PUBLIC_WATTSMITH_WAHOO_FALLBACK=1
// at build time turns it on) and unsupported: FTMS is the supported path, and
// this adapter is exercised only by the hardware test script.
//
// Wahoo's control writes must be sequential (a write sent before the previous
// one completes often fails), so every write waits for the previous one.

export const wahooFallbackEnabled = process.env.NEXT_PUBLIC_WATTSMITH_WAHOO_FALLBACK === "1";

export class WahooControl {
  private chain: Promise<void> = Promise.resolve();

  constructor(private readonly write: (value: DataView) => Promise<void>) {}

  unlock(): Promise<void> {
    return this.enqueue(encodeWahooUnlock());
  }

  setErgWatts(watts: number): Promise<void> {
    return this.enqueue(encodeWahooSetErg(watts));
  }

  // Leaves ERG mode.
  standardMode(): Promise<void> {
    return this.enqueue(encodeWahooStandardMode());
  }

  private enqueue(value: DataView): Promise<void> {
    const next = this.chain.then(() => this.write(value));
    this.chain = next.catch(() => {});
    return next;
  }
}
