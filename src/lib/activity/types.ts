export interface ActivitySummary {
  id: string;
  name: string;
  sportType: string;
  startedAt: string;
  movingTimeSeconds: number;
  elapsedTimeSeconds: number;
  distanceMeters: number;
  elevationGainMeters: number;
  trainer: boolean;
  averagePower: number | null;
  weightedAveragePower: number | null;
  maximumPower: number | null;
  devicePower: boolean;
  averageHeartRate: number | null;
  maximumHeartRate: number | null;
  averageCadence: number | null;
  kilojoules: number | null;
}

export interface ActivityPage {
  activities: ActivitySummary[];
  page: number;
  hasMore: boolean;
  cacheExpiresAt: string;
}

export interface ActivityStreamSet {
  time: number[];
  moving?: boolean[];
  watts?: Array<number | null>;
  heartrate?: Array<number | null>;
  cadence?: Array<number | null>;
  distance?: Array<number | null>;
  altitude?: Array<number | null>;
}

export interface ActivityDataQuality {
  powerCoveragePercent: number;
  hasDevicePower: boolean;
  powerIsEstimated: boolean;
  missingStreams: string[];
  gapsLongerThanFiveSeconds: number;
  notes: string[];
}

export interface ActivityAnalysisSummary {
  movingTimeSeconds: number;
  averagePower: number | null;
  weightedPower: number | null;
  intensityFactor: number | null;
  estimatedTss: number | null;
  variabilityIndex: number | null;
  averageHeartRate: number | null;
  averageCadence: number | null;
  workKilojoules: number | null;
}

export interface ActivityZoneTime {
  id: string;
  label: string;
  range: string;
  color: string;
  seconds: number;
  percent: number;
}

export interface PeakEffort {
  durationSeconds: number;
  label: string;
  watts: number | null;
  startMovingSecond: number | null;
}

export interface ComparisonMetric {
  first: number | null;
  final: number | null;
  percentDelta: number | null;
}

export interface DurabilityComparison {
  power: ComparisonMetric;
  heartRate: ComparisonMetric;
  cadence: ComparisonMetric;
}

export interface ActivityChartPoint {
  second: number;
  power: number | null;
  heartRate: number | null;
  cadence: number | null;
  altitude: number | null;
}

export interface ActivityAnalysis {
  ftp: number;
  ftpEffectiveFrom: string;
  dataQuality: ActivityDataQuality;
  summary: ActivityAnalysisSummary;
  powerZones: ActivityZoneTime[];
  peakEfforts: PeakEffort[];
  durability: DurabilityComparison | null;
  chart: ActivityChartPoint[];
}

export interface ActivityDetail {
  activity: ActivitySummary;
  analysis: ActivityAnalysis;
  source: "strava" | "synthetic-demo";
  cacheExpiresAt?: string;
}
