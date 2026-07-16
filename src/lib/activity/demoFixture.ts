import { analyzeActivity } from "@/lib/activity/analysis";
import type { ActivityDetail, ActivityStreamSet, ActivitySummary } from "@/lib/activity/types";

export const demoActivityId = "synthetic-summer-criterium";

function createSyntheticRaceStreams(): ActivityStreamSet {
  const duration = 5_400;
  const time: number[] = [];
  const moving: boolean[] = [];
  const watts: number[] = [];
  const heartrate: number[] = [];
  const cadence: number[] = [];
  const distance: number[] = [];
  const altitude: number[] = [];
  let meters = 0;
  for (let second = 0; second <= duration; second += 1) {
    const lap = second % 180;
    const lateFactor = second > 3_600 ? 0.94 : 1;
    const surge = lap < 12 ? 430 : lap > 125 && lap < 145 ? 305 : 205;
    const power = Math.max(85, Math.round((surge + 22 * Math.sin(second / 17) + 9 * Math.sin(second / 3)) * lateFactor));
    const hr = Math.round(136 + Math.min(39, second / 180) + 5 * Math.sin(second / 95));
    const rpm = Math.round(89 + 8 * Math.sin(second / 31) + (lap < 12 ? 6 : 0));
    meters += 11.2 + power / 150;
    time.push(second);
    moving.push(!(second >= 2_700 && second < 2_712));
    watts.push(power);
    heartrate.push(hr);
    cadence.push(rpm);
    distance.push(meters);
    altitude.push(184 + 7 * Math.sin(second / 170));
  }
  return { time, moving, watts, heartrate, cadence, distance, altitude };
}

export const demoActivity: ActivitySummary = {
  id: demoActivityId,
  name: "Riverfront Summer Criterium",
  sportType: "Ride",
  startedAt: "2026-06-21T14:00:00.000Z",
  movingTimeSeconds: 5_389,
  elapsedTimeSeconds: 5_400,
  distanceMeters: 42_700,
  elevationGainMeters: 188,
  trainer: false,
  averagePower: 224,
  weightedAveragePower: 263,
  maximumPower: 468,
  devicePower: true,
  averageHeartRate: 169,
  maximumHeartRate: 181,
  averageCadence: 90,
  kilojoules: 1_207,
};

export function getDemoActivityDetail(): ActivityDetail {
  return {
    activity: demoActivity,
    analysis: analyzeActivity({
      streams: createSyntheticRaceStreams(),
      ftp: 268,
      ftpEffectiveFrom: "2026-05-12",
      hasDevicePower: true,
    }),
    source: "synthetic-demo",
  };
}
