export type WorkoutStepType =
  | "warmup"
  | "cooldown"
  | "steady"
  | "repeat"
  | "recovery";

export type TargetMode = "single" | "range" | "ramp";

export type WorkoutCategory =
  | "recovery"
  | "endurance"
  | "tempo"
  | "sweet-spot"
  | "threshold"
  | "vo2"
  | "anaerobic";

export type ExportRangeStrategy = "low" | "midpoint" | "high";

export interface Workout {
  id: string;
  name: string;
  description: string;
  category?: WorkoutCategory;
  ftp: number;
  blocks: WorkoutStep[];
  cues?: WorkoutCue[];
  rationale?: WorkoutRationale;
  createdAt: string;
  updatedAt: string;
}

export interface WorkoutStep {
  id: string;
  type: WorkoutStepType;
  label: string;
  durationSeconds?: number;
  targetMode?: TargetMode;
  targetPercentFTP?: number;
  startPercentFTP?: number;
  endPercentFTP?: number;
  minPercentFTP?: number;
  maxPercentFTP?: number;
  repeatCount?: number;
  children?: WorkoutStep[];
  cues?: WorkoutCue[];
}

export interface WorkoutCue {
  id: string;
  atSeconds: number;
  text: string;
  durationSeconds: number;
}

export interface WorkoutRationale {
  summary: string;
  sourceIds: string[];
  cautions: string[];
}

export interface WorkoutTemplate {
  id: string;
  name: string;
  category: WorkoutCategory;
  description: string;
  defaultWorkout: Workout;
  rationale: WorkoutRationale;
}

export interface AthleteProfile {
  id: string;
  ftp: number;
  experienceLevel: "new" | "recreational" | "serious" | "competitive" | "elite";
  weeklyHours: number;
  availableDays: string[];
  primaryGoal: string;
  targetEventDate?: string;
  preferredWorkoutDurationMinutes: number;
  constraints: string[];
  updatedAt: string;
}

export interface ExternalActivity {
  id: string;
  provider: "strava" | "garmin" | "trainingpeaks";
  startedAt: string;
  durationSeconds: number;
  averagePower?: number;
  normalizedPower?: number;
  intensityFactor?: number;
  trainingStressScore?: number;
  perceivedExertion?: number;
}

export interface IntegrationConnection {
  provider: "strava" | "garmin" | "trainingpeaks";
  status: "not_connected" | "connected" | "expired";
  connectedAt?: string;
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
  minPercentFTP?: number;
  maxPercentFTP?: number;
  targetMode: TargetMode;
  startWatts: number;
  endWatts: number;
  minWatts?: number;
  maxWatts?: number;
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
  aboveVo2Seconds: number;
  intervalCount: number;
  longestWorkSeconds: number;
  estimatedKilojoules: number;
  intensityFactor: number;
  trainingStressScore: number;
  normalizedPowerEstimate: number;
  dominantZone: ZoneSummary;
  zones: ZoneSummary[];
}

export interface WorkoutValidationIssue {
  id: string;
  severity: "error" | "warning";
  message: string;
  stepId?: string;
}
