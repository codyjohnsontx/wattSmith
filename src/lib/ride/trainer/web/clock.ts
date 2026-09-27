import type { SimClock } from "../SimulatedTrainer";

// Real time for the browser. performance.now() is monotonic, so a wall-clock
// change mid-ride cannot move timestamps backwards.
export const browserClock: SimClock = {
  now: () => performance.now(),
  setTimeout: (callback, ms) => window.setTimeout(callback, ms),
  clearTimeout: (handle) => window.clearTimeout(handle),
};
