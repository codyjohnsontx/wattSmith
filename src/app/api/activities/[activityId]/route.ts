import { analyzeActivity } from "@/lib/activity/analysis";
import type { ActivityDetail } from "@/lib/activity/types";
import type { StravaActivityResponse, StravaStreamResponse } from "@/lib/integrations/strava/types";
import { authenticationErrorResponse, requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { resolveFtpForDate, FtpHistoryError } from "@/lib/server/profile";
import { isCyclingActivity, normalizeStravaStreams, stravaActivityToSummary } from "@/lib/server/strava/activities";
import { cacheStravaResource, getCachedStravaResource } from "@/lib/server/strava/cache";
import { stravaApiFetch, StravaApiError } from "@/lib/server/strava/client";

type Context = { params: Promise<{ activityId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const user = await requireUser();
    const { activityId } = await context.params;
    if (!/^\d+$/.test(activityId)) return Response.json({ error: "Activity id is invalid." }, { status: 400 });
    const connection = await db.stravaConnection.findUnique({ where: { userId: user.id } });
    if (!connection) throw new StravaApiError("Connect Strava to continue.", 409, "not_connected");
    const activityKey = `activities:detail:${activityId}`;
    const streamsKey = `activities:streams:${activityId}`;
    const cachedActivity = await getCachedStravaResource<StravaActivityResponse>(user.id, activityKey);
    const activity = cachedActivity?.payload ?? await stravaApiFetch<StravaActivityResponse>(user.id, `/activities/${activityId}`);
    if (String(activity.athlete?.id ?? "") !== connection.athleteId || !isCyclingActivity(activity)) {
      return Response.json({ error: "Activity not found for the connected athlete." }, { status: 404 });
    }
    const cachedStreams = await getCachedStravaResource<StravaStreamResponse[] | Record<string, StravaStreamResponse>>(user.id, streamsKey);
    const streams = cachedStreams?.payload ?? await stravaApiFetch<StravaStreamResponse[] | Record<string, StravaStreamResponse>>(
      user.id,
      `/activities/${activityId}/streams?keys=time,moving,watts,heartrate,cadence,distance,altitude&key_by_type=true`,
    );
    const activityExpiry = cachedActivity?.expiresAt ?? await cacheStravaResource(user.id, activityKey, activity);
    const streamExpiry = cachedStreams?.expiresAt ?? await cacheStravaResource(user.id, streamsKey, streams);
    const summary = stravaActivityToSummary(activity);
    const ftp = await resolveFtpForDate(user.id, new Date(summary.startedAt));
    const detail: ActivityDetail = {
      activity: summary,
      analysis: analyzeActivity({
        streams: normalizeStravaStreams(streams),
        ftp: ftp.ftp,
        ftpEffectiveFrom: ftp.effectiveFrom.toISOString().slice(0, 10),
        hasDevicePower: summary.devicePower,
      }),
      source: "strava",
      cacheExpiresAt: new Date(Math.min(activityExpiry.getTime(), streamExpiry.getTime())).toISOString(),
    };
    return Response.json(detail);
  } catch (error) {
    const response = authenticationErrorResponse(error);
    if (response) return response;
    if (error instanceof StravaApiError) return Response.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof FtpHistoryError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: "Activity analysis could not be created from the available streams.", code: "malformed_response" }, { status: 502 });
  }
}
