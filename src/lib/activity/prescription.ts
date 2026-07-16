import type { PeakEffort } from "@/lib/activity/types";
import { createId, percentToWatts } from "@/lib/workout/math";
import type { Workout, WorkoutCategory, WorkoutStep } from "@/lib/workout/types";
import { zoneForPercent } from "@/lib/workout/zones";

const TARGET_FRACTION_OF_OBSERVED_PEAK = 0.95;

interface PeakDemandStructure {
  repeatCount: number;
  recoverySeconds: number | null;
}

export interface PeakDemandMapping {
  findingLabel: string;
  observedWatts: number;
  observedPercentFtp: number;
  targetWatts: number;
  targetPercentFtp: number;
  workIntervalSeconds: number;
  repeatCount: number;
  recoverySeconds: number | null;
}

export interface ActivityPrescriptionOrigin extends PeakDemandMapping {
  sourcePath: string;
  sourceType: "strava" | "synthetic-demo";
}

export interface ActivityPrescriptionDraft {
  version: 1;
  workout: Workout;
  origin: ActivityPrescriptionOrigin;
}

const structureByDuration: Record<number, PeakDemandStructure> = {
  5: { repeatCount: 6, recoverySeconds: 120 },
  30: { repeatCount: 6, recoverySeconds: 120 },
  60: { repeatCount: 5, recoverySeconds: 180 },
  300: { repeatCount: 3, recoverySeconds: 300 },
  1200: { repeatCount: 1, recoverySeconds: null },
};

function categoryForPercent(percent: number): WorkoutCategory {
  return zoneForPercent(percent).id as WorkoutCategory;
}

function createWorkBlock(mapping: PeakDemandMapping): WorkoutStep {
  const work: WorkoutStep = {
    id: createId("demand-work"),
    type: "steady",
    label: `${mapping.findingLabel} demand`,
    targetMode: "single",
    durationSeconds: mapping.workIntervalSeconds,
    targetPercentFTP: mapping.targetPercentFtp,
  };

  if (mapping.repeatCount === 1 || mapping.recoverySeconds === null) return work;

  return {
    id: createId("demand-set"),
    type: "repeat",
    label: `${mapping.repeatCount} × ${mapping.findingLabel} demand`,
    repeatCount: mapping.repeatCount,
    children: [
      work,
      {
        id: createId("demand-recovery"),
        type: "recovery",
        label: "Recovery",
        targetMode: "single",
        durationSeconds: mapping.recoverySeconds,
        targetPercentFTP: 50,
      },
    ],
  };
}

export function mapPeakDemand(effort: PeakEffort, ftp: number): PeakDemandMapping | null {
  if (effort.watts === null || ftp <= 0) return null;
  const structure = structureByDuration[effort.durationSeconds];
  if (!structure) return null;

  const targetWatts = Math.round(effort.watts * TARGET_FRACTION_OF_OBSERVED_PEAK);
  const targetPercentFtp = Math.max(1, Math.round((targetWatts / ftp) * 100));

  return {
    findingLabel: `${effort.label} peak`,
    observedWatts: effort.watts,
    observedPercentFtp: Math.round((effort.watts / ftp) * 100),
    targetWatts: percentToWatts(ftp, targetPercentFtp),
    targetPercentFtp,
    workIntervalSeconds: effort.durationSeconds,
    repeatCount: structure.repeatCount,
    recoverySeconds: structure.recoverySeconds,
  };
}

export function createPeakDemandPrescription({
  effort,
  ftp,
  sourcePath,
  sourceType,
}: {
  effort: PeakEffort;
  ftp: number;
  sourcePath: string;
  sourceType: ActivityPrescriptionOrigin["sourceType"];
}): ActivityPrescriptionDraft | null {
  const mapping = mapPeakDemand(effort, ftp);
  if (!mapping) return null;

  const timestamp = new Date().toISOString();
  const structure = mapping.repeatCount === 1
    ? `one ${effort.label} interval`
    : `${mapping.repeatCount} × ${effort.label}`;
  const workout: Workout = {
    id: createId("workout"),
    name: `${effort.label} demand rehearsal`,
    description: `A rider-selected ${structure} session at ${mapping.targetPercentFtp}% FTP. Every generated input remains editable.`,
    category: categoryForPercent(mapping.targetPercentFtp),
    ftp,
    blocks: [
      {
        id: createId("demand-warmup"),
        type: "warmup",
        label: "Progressive warmup",
        targetMode: "ramp",
        durationSeconds: 12 * 60,
        startPercentFTP: 45,
        endPercentFTP: 75,
      },
      createWorkBlock(mapping),
      {
        id: createId("demand-cooldown"),
        type: "cooldown",
        label: "Cooldown",
        targetMode: "ramp",
        durationSeconds: 8 * 60,
        startPercentFTP: 60,
        endPercentFTP: 35,
      },
    ],
    cues: [],
    rationale: {
      summary: `Rehearse the selected ${effort.label} race demand at 95% of the observed peak rather than treating one ride as a diagnosis.`,
      sourceIds: ["wattsmith-selected-activity-demand"],
      cautions: [
        "This structure describes a selected ride demand; it does not diagnose a rider weakness.",
        "Adjust the target or repeat count for current fatigue and training context.",
      ],
      whyItWorks: `The target is transparently set at 95% of the selected peak, converted to ${mapping.targetPercentFtp}% FTP for the builder.`,
      whoShouldModify: "Reduce repeats or intensity when the generated session would compromise repeat quality.",
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  return {
    version: 1,
    workout,
    origin: { ...mapping, sourcePath, sourceType },
  };
}
