import type {
  ActivityAnalysis,
  ActivityChartPoint,
  ActivityStreamSet,
  ComparisonMetric,
  DurabilityComparison,
  PeakEffort,
} from "@/lib/activity/types";
import { zoneForPercent, zones } from "@/lib/workout/zones";

interface AnalysisInput {
  streams: ActivityStreamSet;
  ftp: number;
  ftpEffectiveFrom: string;
  hasDevicePower: boolean;
}

interface Sample {
  second: number;
  segment: number;
  power: number | null;
  heartRate: number | null;
  cadence: number | null;
  altitude: number | null;
}

const peakWindows = [5, 30, 60, 300, 1200] as const;

function numberAt(values: Array<number | null> | undefined, index: number) {
  const value = values?.[index];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function interpolate(start: number | null, end: number | null, ratio: number) {
  if (ratio === 0) return start;
  if (start === null || end === null) return null;
  return start + (end - start) * ratio;
}

function normalizeStreams(streams: ActivityStreamSet) {
  const samples: Sample[] = [];
  let movingSecond = 0;
  let segment = 0;
  let gaps = 0;
  for (let index = 0; index < streams.time.length; index += 1) {
    const elapsed = streams.time[index];
    if (!Number.isFinite(elapsed) || streams.moving?.[index] === false) continue;
    const nextElapsed = streams.time[index + 1];
    const gap = Number.isFinite(nextElapsed) ? nextElapsed - elapsed : 1;
    if (gap > 5) gaps += 1;
    const fill = gap > 1 && gap <= 5 && streams.moving?.[index + 1] !== false ? Math.floor(gap) : 1;
    const values = {
      power: numberAt(streams.watts, index),
      heartRate: numberAt(streams.heartrate, index),
      cadence: numberAt(streams.cadence, index),
      altitude: numberAt(streams.altitude, index),
    };
    const next = {
      power: numberAt(streams.watts, index + 1),
      heartRate: numberAt(streams.heartrate, index + 1),
      cadence: numberAt(streams.cadence, index + 1),
      altitude: numberAt(streams.altitude, index + 1),
    };
    for (let offset = 0; offset < fill; offset += 1) {
      const ratio = fill === 1 ? 0 : offset / gap;
      samples.push({
        second: movingSecond,
        segment,
        power: interpolate(values.power, next.power, ratio),
        heartRate: interpolate(values.heartRate, next.heartRate, ratio),
        cadence: interpolate(values.cadence, next.cadence, ratio),
        altitude: interpolate(values.altitude, next.altitude, ratio),
      });
      movingSecond += 1;
    }
    if (gap > 5) segment += 1;
  }
  return { samples, gaps };
}

function average(values: Array<number | null>) {
  const valid = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

function rollingBest(samples: Sample[], windowSeconds: number): PeakEffort {
  let best: number | null = null;
  let bestStart: number | null = null;
  for (let end = windowSeconds - 1; end < samples.length; end += 1) {
    const window = samples.slice(end - windowSeconds + 1, end + 1);
    if (window[0].segment !== window[window.length - 1].segment) continue;
    const valid = window.map((sample) => sample.power).filter((value): value is number => value !== null);
    if (valid.length < Math.ceil(windowSeconds * 0.8)) continue;
    const watts = valid.reduce((sum, value) => sum + value, 0) / valid.length;
    if (best === null || watts > best) {
      best = watts;
      bestStart = window[0].second;
    }
  }
  const labels: Record<number, string> = { 5: "5 sec", 30: "30 sec", 60: "1 min", 300: "5 min", 1200: "20 min" };
  return { durationSeconds: windowSeconds, label: labels[windowSeconds], watts: best === null ? null : Math.round(best), startMovingSecond: bestStart };
}

function weightedPower(samples: Sample[]) {
  const rolling: number[] = [];
  for (let end = 29; end < samples.length; end += 1) {
    const window = samples.slice(end - 29, end + 1);
    if (window[0].segment !== window[window.length - 1].segment) continue;
    const valid = window.map((sample) => sample.power).filter((value): value is number => value !== null);
    if (valid.length < 24) continue;
    rolling.push(valid.reduce((sum, value) => sum + value, 0) / valid.length);
  }
  if (!rolling.length) return null;
  return Math.pow(rolling.reduce((sum, value) => sum + Math.pow(value, 4), 0) / rolling.length, 0.25);
}

function comparison(first: Array<number | null>, final: Array<number | null>): ComparisonMetric {
  const firstAverage = average(first);
  const finalAverage = average(final);
  return {
    first: firstAverage,
    final: finalAverage,
    percentDelta: firstAverage && finalAverage !== null ? ((finalAverage - firstAverage) / firstAverage) * 100 : null,
  };
}

function durability(samples: Sample[]): DurabilityComparison | null {
  if (samples.length < 3) return null;
  const third = Math.floor(samples.length / 3);
  const first = samples.slice(0, third);
  const final = samples.slice(samples.length - third);
  return {
    power: comparison(first.map((sample) => sample.power), final.map((sample) => sample.power)),
    heartRate: comparison(first.map((sample) => sample.heartRate), final.map((sample) => sample.heartRate)),
    cadence: comparison(first.map((sample) => sample.cadence), final.map((sample) => sample.cadence)),
  };
}

export function downsampleActivityChart(points: ActivityChartPoint[], maximum = 1500) {
  if (points.length <= maximum) return points;
  const bucketCount = Math.max(1, Math.floor(maximum / 8));
  const bucketSize = Math.ceil(points.length / bucketCount);
  const selected = new Set<number>();
  for (let start = 0; start < points.length; start += bucketSize) {
    const end = Math.min(points.length, start + bucketSize);
    selected.add(start);
    selected.add(end - 1);
    for (const key of ["power", "heartRate", "cadence"] as const) {
      let minIndex = -1;
      let maxIndex = -1;
      for (let index = start; index < end; index += 1) {
        const value = points[index][key];
        if (value === null) continue;
        if (minIndex === -1 || value < (points[minIndex][key] ?? Infinity)) minIndex = index;
        if (maxIndex === -1 || value > (points[maxIndex][key] ?? -Infinity)) maxIndex = index;
      }
      if (minIndex >= 0) selected.add(minIndex);
      if (maxIndex >= 0) selected.add(maxIndex);
    }
  }
  return [...selected].sort((a, b) => a - b).slice(0, maximum).map((index) => points[index]);
}

export function analyzeActivity({ streams, ftp, ftpEffectiveFrom, hasDevicePower }: AnalysisInput): ActivityAnalysis {
  const { samples, gaps } = normalizeStreams(streams);
  const validPower = samples.filter((sample) => sample.power !== null);
  const averagePower = average(samples.map((sample) => sample.power));
  const weighted = weightedPower(samples);
  const intensityFactor = weighted === null ? null : weighted / ftp;
  const zoneSeconds = new Map(zones.map((zone) => [zone.id, 0]));
  for (const sample of validPower) {
    const zone = zoneForPercent(((sample.power ?? 0) / ftp) * 100);
    zoneSeconds.set(zone.id, (zoneSeconds.get(zone.id) ?? 0) + 1);
  }
  const totalZoneSeconds = validPower.length;
  const missingStreams = [
    !streams.watts?.length ? "power" : null,
    !streams.heartrate?.length ? "heart rate" : null,
    !streams.cadence?.length ? "cadence" : null,
  ].filter((value): value is string => Boolean(value));
  const powerCoveragePercent = samples.length ? (validPower.length / samples.length) * 100 : 0;
  const workKilojoules = averagePower === null ? null : (averagePower * validPower.length) / 1000;
  const chart = downsampleActivityChart(samples.map((sample) => ({
    second: sample.second,
    segment: sample.segment,
    power: sample.power,
    heartRate: sample.heartRate,
    cadence: sample.cadence,
    altitude: sample.altitude,
  })));
  return {
    ftp,
    ftpEffectiveFrom,
    dataQuality: {
      powerCoveragePercent,
      hasDevicePower,
      powerIsEstimated: Boolean(streams.watts?.length) && !hasDevicePower,
      missingStreams,
      gapsLongerThanFiveSeconds: gaps,
      notes: [
        "Streams are resampled onto a one-second moving timeline; paused samples are excluded.",
        "Gaps longer than five seconds are not interpolated.",
        "Rolling metrics require at least 80% valid samples in each window.",
        ...(hasDevicePower ? [] : ["Power is absent or estimated by the source and should be interpreted cautiously."]),
      ],
    },
    summary: {
      movingTimeSeconds: samples.length,
      averagePower,
      weightedPower: weighted,
      intensityFactor,
      estimatedTss: intensityFactor === null ? null : (samples.length / 3600) * intensityFactor * intensityFactor * 100,
      variabilityIndex: weighted !== null && averagePower ? weighted / averagePower : null,
      averageHeartRate: average(samples.map((sample) => sample.heartRate)),
      averageCadence: average(samples.map((sample) => sample.cadence)),
      workKilojoules,
    },
    powerZones: zones.map((zone) => ({
      ...zone,
      seconds: zoneSeconds.get(zone.id) ?? 0,
      percent: totalZoneSeconds ? ((zoneSeconds.get(zone.id) ?? 0) / totalZoneSeconds) * 100 : 0,
    })),
    peakEfforts: peakWindows.map((window) => rollingBest(samples, window)),
    durability: durability(samples),
    chart,
  };
}
