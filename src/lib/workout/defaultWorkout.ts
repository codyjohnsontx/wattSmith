import type { Workout, WorkoutStep } from "./types";

const now = "2026-06-22T00:00:00.000Z";

function createThirtyFifteenSet(id: string, label: string): WorkoutStep {
  return {
    id,
    type: "repeat",
    label,
    repeatCount: 6,
    children: [
      {
        id: `${id}-on`,
        type: "steady",
        label: "30 sec VO2 on",
        durationSeconds: 30,
        targetPercentFTP: 120,
      },
      {
        id: `${id}-off`,
        type: "recovery",
        label: "15 sec float",
        durationSeconds: 15,
        targetPercentFTP: 50,
      },
    ],
  };
}

export const defaultWorkout: Workout = {
  id: "vo2-30-15-intro-3x6",
  name: "VO2 30/15 Intro — 3x6",
  description:
    "Three compact sets of 30-second VO2 efforts with 15-second floats, framed by a progressive warmup and cooldown.",
  ftp: 164,
  createdAt: now,
  updatedAt: now,
  blocks: [
    {
      id: "warmup",
      type: "warmup",
      label: "Warmup ramp",
      durationSeconds: 12 * 60,
      startPercentFTP: 45,
      endPercentFTP: 75,
    },
    createThirtyFifteenSet("set-1", "Set 1: 6 x 30/15"),
    {
      id: "recovery-1",
      type: "recovery",
      label: "Set recovery",
      durationSeconds: 5 * 60,
      targetPercentFTP: 45,
    },
    createThirtyFifteenSet("set-2", "Set 2: 6 x 30/15"),
    {
      id: "recovery-2",
      type: "recovery",
      label: "Set recovery",
      durationSeconds: 5 * 60,
      targetPercentFTP: 45,
    },
    createThirtyFifteenSet("set-3", "Set 3: 6 x 30/15"),
    {
      id: "cooldown",
      type: "cooldown",
      label: "Cooldown ramp",
      durationSeconds: 8 * 60,
      startPercentFTP: 60,
      endPercentFTP: 35,
    },
  ],
};

export function cloneDefaultWorkout(): Workout {
  const timestamp = new Date().toISOString();
  return {
    ...structuredClone(defaultWorkout),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
