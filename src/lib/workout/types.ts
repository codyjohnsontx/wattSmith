export type WorkoutStepType =
  | "warmup"
  | "cooldown"
  | "steady"
  | "repeat"
  | "recovery";

export interface Workout {
  id: string;
  name: string;
  description: string;
  ftp: number;
  blocks: WorkoutStep[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkoutStep {
  id: string;
  type: WorkoutStepType;
  label: string;
  durationSeconds?: number;
  targetPercentFTP?: number;
  startPercentFTP?: number;
  endPercentFTP?: number;
  repeatCount?: number;
  children?: WorkoutStep[];
}

export interface FlattenedSegment {
  id: string;
  parentStepId: string;
  label: string;
  type: Exclude<WorkoutStepType, "repeat">;
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
  startPercentFTP: number;
  endPercentFTP: number;
  startWatts: number;
  endWatts: number;
}

export interface ZoneSummary {
  id: string;
  label: string;
  range: string;
  seconds: number;
}

export interface WorkoutSummary {
  totalDurationSeconds: number;
  warmupSeconds: number;
  workSeconds: number;
  recoverySeconds: number;
  cooldownSeconds: number;
  averageWatts: number;
  highestWatts: number;
  aboveThresholdSeconds: number;
  zones: ZoneSummary[];
}
