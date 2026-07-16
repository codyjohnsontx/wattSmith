import { describe, expect, it } from "vitest";
import { analyzeActivity, downsampleActivityChart } from "./analysis";
import { getDemoActivityDetail } from "./demoFixture";

function constantStreams(duration: number, watts = 250) {
  return {
    time: Array.from({ length: duration }, (_, index) => index),
    moving: Array.from({ length: duration }, () => true),
    watts: Array.from({ length: duration }, () => watts),
  };
}

describe("activity analysis", () => {
  it("allocates Wattsmith zone boundaries using historical FTP", () => {
    const analysis = analyzeActivity({
      streams: { time: [0, 1, 2, 3, 4, 5, 6], watts: [54, 55, 75, 76, 88, 105, 121] },
      ftp: 100,
      ftpEffectiveFrom: "2026-01-01",
      hasDevicePower: true,
    });
    expect(Object.fromEntries(analysis.powerZones.map((zone) => [zone.id, zone.seconds]))).toEqual({
      recovery: 1,
      endurance: 2,
      tempo: 1,
      "sweet-spot": 1,
      threshold: 1,
      vo2: 0,
      anaerobic: 1,
    });
    expect(analysis.ftpEffectiveFrom).toBe("2026-01-01");
  });

  it("calculates stable weighted power, peaks, IF, and TSS", () => {
    const analysis = analyzeActivity({ streams: constantStreams(3600), ftp: 250, ftpEffectiveFrom: "2026-01-01", hasDevicePower: true });
    expect(analysis.summary.averagePower).toBe(250);
    expect(analysis.summary.weightedPower).toBeCloseTo(250, 8);
    expect(analysis.summary.intensityFactor).toBeCloseTo(1, 8);
    expect(analysis.summary.estimatedTss).toBeCloseTo(100, 8);
    expect(analysis.peakEfforts.map((effort) => effort.watts)).toEqual([250, 250, 250, 250, 250]);
  });

  it("excludes pauses, does not bridge long gaps, and omits missing metrics", () => {
    const analysis = analyzeActivity({
      streams: { time: [0, 1, 2, 10, 11], moving: [true, false, true, true, true], watts: [200, 900, null, 210, 220] },
      ftp: 200,
      ftpEffectiveFrom: "2026-01-01",
      hasDevicePower: false,
    });
    expect(analysis.summary.movingTimeSeconds).toBe(4);
    expect(analysis.dataQuality.gapsLongerThanFiveSeconds).toBe(1);
    expect(analysis.dataQuality.powerIsEstimated).toBe(true);
    expect(analysis.summary.averageHeartRate).toBeNull();
  });

  it("downsamples to 1,500 points while preserving a local power maximum", () => {
    const points = Array.from({ length: 10_000 }, (_, second) => ({ second, segment: 0, power: second === 5_005 ? 999 : 100, heartRate: 150, cadence: 90, altitude: null }));
    const result = downsampleActivityChart(points);
    expect(result.length).toBeLessThanOrEqual(1500);
    expect(result.some((point) => point.power === 999)).toBe(true);
  });

  it("preserves long-gap segment markers in chart output", () => {
    const analysis = analyzeActivity({
      streams: { time: [0, 1, 10, 11], watts: [200, 210, 220, 230] },
      ftp: 250,
      ftpEffectiveFrom: "2026-01-01",
      hasDevicePower: true,
    });
    expect(analysis.chart.map((point) => point.segment)).toEqual([0, 0, 1, 1]);
  });

  it("keeps the committed synthetic fixture metrics stable", () => {
    const detail = getDemoActivityDetail();
    expect(detail.analysis.summary.averagePower).toBeCloseTo(225.3, 0);
    expect(detail.analysis.summary.weightedPower).toBeCloseTo(233.4, 0);
    expect(detail.analysis.chart.length).toBeLessThanOrEqual(1500);
    expect(detail.analysis.peakEfforts[0].watts).toBeGreaterThan(430);
    expect(detail.analysis.durability?.power.percentDelta).toBeLessThan(0);
  });
});
