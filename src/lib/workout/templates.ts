import { defaultWorkout } from "./defaultWorkout";
import { createId } from "./math";
import type {
  Workout,
  WorkoutCategory,
  WorkoutRationale,
  WorkoutStep,
  WorkoutTemplate,
} from "./types";

const now = "2026-06-22T00:00:00.000Z";
const defaultFtp = 164;

function step(stepDefinition: WorkoutStep): WorkoutStep {
  return stepDefinition;
}

function citedRationale(
  summary: string,
  {
    cautions = [],
    sourceIds = ["coggan-power-zones", "seiler-2010-intensity-distribution"],
    whyItWorks,
    whoShouldModify,
  }: {
    cautions?: string[];
    sourceIds?: string[];
    whyItWorks?: string;
    whoShouldModify?: string;
  } = {},
): WorkoutRationale {
  return { summary, sourceIds, cautions, whyItWorks, whoShouldModify };
}

const recoveryRationale = citedRationale(
  "Very easy endurance riding keeps intensity low and gives the rider a structured option for active recovery.",
  {
    cautions: ["Keep this truly easy; it should not feel like training stress."],
    whyItWorks:
      "Riding well below aerobic threshold promotes blood flow and easy movement without adding measurable training stress, which is what lets recovery actually happen instead of being delayed. Capping power in the 45-55% range is the entire point: the session is a delivery vehicle for easy pedaling, not fitness.",
    whoShouldModify:
      "Anyone who finishes feeling worked has ridden too hard and should shorten it or drop the target further. Riders with heavy legs can cut it to 20 minutes; it should never be lengthened into a real endurance ride.",
  },
);

const enduranceRationale = citedRationale(
  "Endurance work builds volume at sustainable intensity and keeps the main target below threshold.",
  {
    whyItWorks:
      "Sustained riding in the 65-75% band develops aerobic capacity and fat metabolism at an intensity you can repeat often without deep fatigue, which is how aerobic volume compounds over weeks. The brief controlled finish nudges the top of the aerobic range without tipping into threshold work.",
    whoShouldModify:
      "Time-crunched riders can shorten the steady block; riders building base can extend it past 90 minutes at the same target. Newer riders should hold the lower end of the range and skip the finishing effort if it starts to feel like work.",
  },
);

const tempoRationale = citedRationale(
  "Tempo work adds moderate aerobic pressure while staying clearly below threshold.",
  {
    whyItWorks:
      "Tempo intervals apply steady aerobic pressure just below threshold, building sustainable power and muscular endurance while staying recoverable enough to fit into most weeks. The short recoveries keep the efforts honest without letting the session drift into threshold territory.",
    whoShouldModify:
      "Riders wanting more load can lengthen the intervals to 10-12 minutes or add a fourth rep; those short on time or freshness can drop to two intervals. If the target range feels close to threshold, settle toward the lower end.",
  },
);

const sweetSpotRationale = citedRationale(
  "Sweet spot intervals sit near threshold but remain slightly lower so riders can accumulate controlled work.",
  {
    cautions: ["If cadence or form falls apart, reduce the target range."],
    whyItWorks:
      "Sweet spot sits just below FTP, high enough to drive meaningful adaptation but low enough to accumulate real volume without the recovery cost of threshold work, which makes it an efficient way to build sustainable power. The 4-minute recoveries keep each interval repeatable at quality.",
    whoShouldModify:
      "Build toward four intervals or 12-15 minute blocks as fitness allows, and pull back to two intervals when fatigued. Riders whose cadence or form decays mid-interval should lower the target range rather than push through.",
  },
);

const thresholdRationale = citedRationale(
  "Threshold intervals target sustainable high aerobic power around FTP.",
  {
    cautions: ["This should feel hard but controlled, not like repeated maximal efforts."],
    whyItWorks:
      "Repeated efforts right around FTP grow sustainable power at the intensity that most defines it, and breaking the work into 6-minute reps banks more total time at threshold than one continuous effort would allow at the same quality. The short recoveries keep the aerobic system loaded between reps.",
    whoShouldModify:
      "As threshold improves, extend the reps toward 8-10 minutes or add a fifth; when tired, reduce to three reps or trim the target toward the lower bound. Keep it controlled so it never becomes a set of maximal efforts.",
  },
);

const anaerobicRationale = citedRationale(
  "Short efforts above VO2 range create high-intensity repeatability practice while the long recoveries keep the session from becoming threshold work.",
  {
    sourceIds: ["buchheit-laursen-2013-hiit-part-2", "coggan-power-zones"],
    cautions: ["Skip or reduce this if you are carrying fatigue from recent hard sessions."],
    whyItWorks:
      "Brief efforts above VO2 intensity develop anaerobic power and the ability to repeat hard surges, while the long 2.5-minute recoveries clear fatigue between reps so each one stays genuinely high quality instead of sliding into threshold work. Repeatability, not single-effort peak power, is the target.",
    whoShouldModify:
      "Reduce the rep count or intensity when carrying fatigue, since quality collapses fast on anaerobic work; experienced riders can shorten the recoveries or add reps to raise the challenge. Newer riders should start with 6-8 reps and full recoveries.",
  },
);

function baseWorkout(
  id: string,
  name: string,
  category: WorkoutCategory,
  description: string,
  blocks: WorkoutStep[],
  rationale: WorkoutRationale,
): Workout {
  return {
    id,
    name,
    category,
    description,
    ftp: defaultFtp,
    blocks,
    rationale,
    createdAt: now,
    updatedAt: now,
  };
}

export const workoutCategories: WorkoutCategory[] = [
  "recovery",
  "endurance",
  "tempo",
  "sweet-spot",
  "threshold",
  "vo2",
  "anaerobic",
];

export const workoutTemplates: WorkoutTemplate[] = [
  {
    id: "template-vo2-30-15-intro",
    name: defaultWorkout.name,
    category: "vo2",
    description: defaultWorkout.description,
    defaultWorkout,
    rationale: defaultWorkout.rationale!,
  },
  {
    id: "template-recovery-spin",
    name: "Recovery Spin - 35",
    category: "recovery",
    description: "A low-stress aerobic spin for freshening the legs without adding meaningful load.",
    rationale: recoveryRationale,
    defaultWorkout: baseWorkout(
      "recovery-spin-35",
      "Recovery Spin - 35",
      "recovery",
      "A low-stress aerobic spin for freshening the legs without adding meaningful load.",
      [
        step({
          id: "warmup",
          type: "warmup",
          label: "Easy roll-in",
          targetMode: "ramp",
          durationSeconds: 5 * 60,
          startPercentFTP: 35,
          endPercentFTP: 50,
        }),
        step({
          id: "steady",
          type: "steady",
          label: "Relaxed aerobic spin",
          targetMode: "range",
          durationSeconds: 25 * 60,
          minPercentFTP: 45,
          maxPercentFTP: 55,
        }),
        step({
          id: "cooldown",
          type: "cooldown",
          label: "Cool down",
          targetMode: "ramp",
          durationSeconds: 5 * 60,
          startPercentFTP: 50,
          endPercentFTP: 35,
        }),
      ],
      recoveryRationale,
    ),
  },
  {
    id: "template-endurance-60",
    name: "Endurance Builder - 60",
    category: "endurance",
    description: "A simple endurance ride with a steady aerobic target and a short progressive finish.",
    rationale: enduranceRationale,
    defaultWorkout: baseWorkout(
      "endurance-builder-60",
      "Endurance Builder - 60",
      "endurance",
      "A simple endurance ride with a steady aerobic target and a short progressive finish.",
      [
        step({
          id: "warmup",
          type: "warmup",
          label: "Warmup ramp",
          targetMode: "ramp",
          durationSeconds: 10 * 60,
          startPercentFTP: 45,
          endPercentFTP: 65,
        }),
        step({
          id: "endurance",
          type: "steady",
          label: "Endurance range",
          targetMode: "range",
          durationSeconds: 40 * 60,
          minPercentFTP: 65,
          maxPercentFTP: 75,
        }),
        step({
          id: "finish",
          type: "steady",
          label: "Controlled finish",
          targetMode: "single",
          durationSeconds: 5 * 60,
          targetPercentFTP: 78,
        }),
        step({
          id: "cooldown",
          type: "cooldown",
          label: "Cool down",
          targetMode: "ramp",
          durationSeconds: 5 * 60,
          startPercentFTP: 60,
          endPercentFTP: 40,
        }),
      ],
      enduranceRationale,
    ),
  },
  {
    id: "template-tempo-3x8",
    name: "Tempo Control - 3x8",
    category: "tempo",
    description: "Three tempo intervals with short recoveries for controlled sub-threshold pressure.",
    rationale: tempoRationale,
    defaultWorkout: baseWorkout(
      "tempo-control-3x8",
      "Tempo Control - 3x8",
      "tempo",
      "Three tempo intervals with short recoveries for controlled sub-threshold pressure.",
      [
        step({
          id: "warmup",
          type: "warmup",
          label: "Warmup",
          targetMode: "ramp",
          durationSeconds: 10 * 60,
          startPercentFTP: 45,
          endPercentFTP: 75,
        }),
        step({
          id: "tempo-repeat",
          type: "repeat",
          label: "3 x 8 min tempo",
          repeatCount: 3,
          children: [
            step({
              id: "tempo-on",
              type: "steady",
              label: "Tempo",
              targetMode: "range",
              durationSeconds: 8 * 60,
              minPercentFTP: 80,
              maxPercentFTP: 86,
            }),
            step({
              id: "tempo-off",
              type: "recovery",
              label: "Easy recovery",
              targetMode: "single",
              durationSeconds: 3 * 60,
              targetPercentFTP: 50,
            }),
          ],
        }),
        step({
          id: "cooldown",
          type: "cooldown",
          label: "Cool down",
          targetMode: "ramp",
          durationSeconds: 8 * 60,
          startPercentFTP: 60,
          endPercentFTP: 35,
        }),
      ],
      tempoRationale,
    ),
  },
  {
    id: "template-sweet-spot-3x10",
    name: "Sweet Spot Base - 3x10",
    category: "sweet-spot",
    description: "A classic sweet spot session with enough recovery to keep the efforts repeatable.",
    rationale: sweetSpotRationale,
    defaultWorkout: baseWorkout(
      "sweet-spot-base-3x10",
      "Sweet Spot Base - 3x10",
      "sweet-spot",
      "A classic sweet spot session with enough recovery to keep the efforts repeatable.",
      [
        step({
          id: "warmup",
          type: "warmup",
          label: "Warmup",
          targetMode: "ramp",
          durationSeconds: 12 * 60,
          startPercentFTP: 45,
          endPercentFTP: 80,
        }),
        step({
          id: "ss-repeat",
          type: "repeat",
          label: "3 x 10 min sweet spot",
          repeatCount: 3,
          children: [
            step({
              id: "ss-on",
              type: "steady",
              label: "Sweet spot",
              targetMode: "range",
              durationSeconds: 10 * 60,
              minPercentFTP: 88,
              maxPercentFTP: 94,
            }),
            step({
              id: "ss-off",
              type: "recovery",
              label: "Recovery",
              targetMode: "single",
              durationSeconds: 4 * 60,
              targetPercentFTP: 50,
            }),
          ],
        }),
        step({
          id: "cooldown",
          type: "cooldown",
          label: "Cool down",
          targetMode: "ramp",
          durationSeconds: 8 * 60,
          startPercentFTP: 60,
          endPercentFTP: 35,
        }),
      ],
      sweetSpotRationale,
    ),
  },
  {
    id: "template-threshold-4x6",
    name: "Threshold Builder - 4x6",
    category: "threshold",
    description: "Repeatable threshold intervals for time near FTP without a long continuous test effort.",
    rationale: thresholdRationale,
    defaultWorkout: baseWorkout(
      "threshold-builder-4x6",
      "Threshold Builder - 4x6",
      "threshold",
      "Repeatable threshold intervals for time near FTP without a long continuous test effort.",
      [
        step({
          id: "warmup",
          type: "warmup",
          label: "Warmup",
          targetMode: "ramp",
          durationSeconds: 12 * 60,
          startPercentFTP: 45,
          endPercentFTP: 85,
        }),
        step({
          id: "threshold-repeat",
          type: "repeat",
          label: "4 x 6 min threshold",
          repeatCount: 4,
          children: [
            step({
              id: "threshold-on",
              type: "steady",
              label: "Threshold",
              targetMode: "range",
              durationSeconds: 6 * 60,
              minPercentFTP: 98,
              maxPercentFTP: 102,
            }),
            step({
              id: "threshold-off",
              type: "recovery",
              label: "Recovery",
              targetMode: "single",
              durationSeconds: 3 * 60,
              targetPercentFTP: 50,
            }),
          ],
        }),
        step({
          id: "cooldown",
          type: "cooldown",
          label: "Cool down",
          targetMode: "ramp",
          durationSeconds: 8 * 60,
          startPercentFTP: 60,
          endPercentFTP: 35,
        }),
      ],
      thresholdRationale,
    ),
  },
  {
    id: "template-anaerobic-12x30",
    name: "Anaerobic Pop - 12x30",
    category: "anaerobic",
    description: "Short high-power efforts with generous recovery for repeatable anaerobic work.",
    rationale: anaerobicRationale,
    defaultWorkout: baseWorkout(
      "anaerobic-pop-12x30",
      "Anaerobic Pop - 12x30",
      "anaerobic",
      "Short high-power efforts with generous recovery for repeatable anaerobic work.",
      [
        step({
          id: "warmup",
          type: "warmup",
          label: "Warmup",
          targetMode: "ramp",
          durationSeconds: 15 * 60,
          startPercentFTP: 45,
          endPercentFTP: 85,
        }),
        step({
          id: "anaerobic-repeat",
          type: "repeat",
          label: "12 x 30 sec",
          repeatCount: 12,
          children: [
            step({
              id: "anaerobic-on",
              type: "steady",
              label: "Hard surge",
              targetMode: "single",
              durationSeconds: 30,
              targetPercentFTP: 130,
            }),
            step({
              id: "anaerobic-off",
              type: "recovery",
              label: "Easy spin",
              targetMode: "single",
              durationSeconds: 150,
              targetPercentFTP: 45,
            }),
          ],
        }),
        step({
          id: "cooldown",
          type: "cooldown",
          label: "Cool down",
          targetMode: "ramp",
          durationSeconds: 8 * 60,
          startPercentFTP: 60,
          endPercentFTP: 35,
        }),
      ],
      anaerobicRationale,
    ),
  },
];

export function cloneTemplateWorkout(template: WorkoutTemplate, ftp?: number): Workout {
  const timestamp = new Date().toISOString();
  return {
    ...structuredClone(template.defaultWorkout),
    id: `${template.defaultWorkout.id}-${createId("clone")}`,
    ftp: ftp ?? template.defaultWorkout.ftp,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
