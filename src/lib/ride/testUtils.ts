import type { Workout } from "@/lib/workout/types";
import { buildTimeline } from "./engine/timeline";
import { createRideState, reduce } from "./engine/reducer";
import type { EngineOptions, RideEvent, RideSegment, RideState } from "./engine/types";
import type { TargetPowerResult } from "./trainer/Trainer";
import { ManualClock, SimulatedTrainer } from "./trainer/SimulatedTrainer";
import type { SimulatedTrainerOptions } from "./trainer/SimulatedTrainer";

// Test-only driver: wires a SimulatedTrainer to the reducer the way the ride
// page will, on a ManualClock so whole rides run instantly.

export interface TargetWrite {
  atMs: number;
  watts: number;
  result?: TargetPowerResult;
}

export function createRideHarness({
  workout,
  ftp,
  mapTimeline = (timeline) => timeline,
  engineOptions,
  trainerOptions,
  tickMs = 250,
}: {
  workout: Workout;
  ftp: number;
  // Adjusts the built timeline, e.g. to mark free-ride segments.
  mapTimeline?: (timeline: RideSegment[]) => RideSegment[];
  engineOptions?: Partial<EngineOptions>;
  trainerOptions?: Partial<SimulatedTrainerOptions>;
  tickMs?: number;
}) {
  const clock = new ManualClock();
  const trainer = new SimulatedTrainer(clock, { riderFtp: ftp, ...trainerOptions });
  const writes: TargetWrite[] = [];
  let state: RideState = createRideState({ timeline: mapTimeline(buildTimeline(workout, ftp)), ftp, options: engineOptions });

  const dispatch = (event: RideEvent) => {
    state = reduce(state, event);
    for (const command of state.trainerCommands) {
      if (command.type === "setTargetPower") {
        const write: TargetWrite = { atMs: clock.now(), watts: command.watts };
        writes.push(write);
        void trainer.setTargetPower(command.watts).then((result) => {
          write.result = result;
        });
      } else {
        void trainer.setErgEnabled(command.enabled);
      }
    }
  };

  trainer.on("sample", (sample) =>
    dispatch({
      type: "sample",
      nowMs: sample.timestampMs,
      source: sample.source,
      power: sample.power,
      cadence: sample.cadence,
      heartRate: sample.heartRate,
    }),
  );
  trainer.on("status", (status) => dispatch({ type: "trainerStatus", nowMs: clock.now(), status }));

  const scheduleTick = () => {
    clock.setTimeout(() => {
      dispatch({ type: "tick", nowMs: clock.now() });
      scheduleTick();
    }, tickMs);
  };

  return {
    clock,
    trainer,
    writes,
    dispatch,
    get state() {
      return state;
    },
    async start() {
      await trainer.connect();
      dispatch({ type: "command", nowMs: clock.now(), command: "start" });
      scheduleTick();
    },
    command(command: Extract<RideEvent, { type: "command" }>["command"]) {
      dispatch({ type: "command", nowMs: clock.now(), command });
    },
    advance(ms: number) {
      clock.advance(ms);
    },
  };
}

// Flushes pending promise callbacks (trainer write results).
export async function flushPromises(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}
