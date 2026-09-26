import { targetAt } from "./targets";
import type { RideState } from "./types";

// Decides when to write a target. ERG control itself happens in the trainer
// firmware; the engine only limits how often and when it writes:
// - a change of at least ergMinDeltaWatts, no sooner than ergMinIntervalMs
//   after the previous write (ramps become ~1 W steps, not per-frame spam);
// - an unchanged target is re-sent every ergResendMs as a cheap guard;
// - boundaries switch at the boundary, or ergLeadTimeMs early.
export function ergCommandPolicy(state: RideState, nowMs: number): { setTargetWatts?: number } {
  if (state.status !== "riding" || !state.ergEnabled || state.trainerStatus !== "connected") {
    return {};
  }

  const { options, erg } = state;
  const current = targetAt(state.timeline, state.elapsedMs, state.ftpBiasPercent);
  if (!current || !current.segment.ergEnabled) return {};

  const leadTarget =
    options.ergLeadTimeMs > 0
      ? targetAt(state.timeline, state.elapsedMs + options.ergLeadTimeMs, state.ftpBiasPercent)
      : null;
  const desired =
    leadTarget && leadTarget.segment.index !== current.segment.index && leadTarget.segment.ergEnabled
      ? leadTarget.watts
      : current.watts;

  if (erg.lastSentWatts === null || erg.lastSentAtMs === null) {
    return { setTargetWatts: desired };
  }

  const sinceLast = nowMs - erg.lastSentAtMs;
  const changed = Math.abs(desired - erg.lastSentWatts) >= options.ergMinDeltaWatts;
  if (changed && sinceLast >= options.ergMinIntervalMs) {
    return { setTargetWatts: desired };
  }
  if (sinceLast >= options.ergResendMs) {
    return { setTargetWatts: desired };
  }

  return {};
}
