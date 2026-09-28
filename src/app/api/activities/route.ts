import type { ActivityPage } from "@/lib/activity/types";
import type { StravaActivityResponse } from "@/lib/integrations/strava/types";
import { authenticationErrorResponse, requireUser } from "@/lib/server/auth";
import { getCachedStravaResource, cacheStravaResource } from "@/lib/server/strava/cache";
import { stravaApiFetch, StravaApiError } from "@/lib/server/strava/client";
import { isCyclingActivity, stravaActivityToSummary } from "@/lib/server/strava/activities";
import { isStravaEnabled, stravaDisabledResponse } from "@/lib/server/strava/config";

function stravaErrorResponse(error: unknown) {
  return error instanceof StravaApiError
    ? Response.json({ error: error.message, code: error.code }, { status: error.status })
    : undefined;
}

export async function GET(request: Request) {
  if (!isStravaEnabled()) return stravaDisabledResponse();
  try {
    const user = await requireUser();
    const params = new URL(request.url).searchParams;
    const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
    const perPage = Math.min(100, Math.max(1, Number.parseInt(params.get("perPage") ?? "50", 10) || 50));
    const resourceKey = `activities:list:${page}:${perPage}`;
    const cached = await getCachedStravaResource<StravaActivityResponse[]>(user.id, resourceKey);
    const raw = cached?.payload ?? await stravaApiFetch<StravaActivityResponse[]>(user.id, `/athlete/activities?page=${page}&per_page=${perPage}`);
    const expiresAt = cached?.expiresAt ?? await cacheStravaResource(user.id, resourceKey, raw);
    const response: ActivityPage = {
      activities: raw.filter(isCyclingActivity).map(stravaActivityToSummary).sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)),
      page,
      hasMore: raw.length === perPage,
      cacheExpiresAt: expiresAt.toISOString(),
    };
    return Response.json(response);
  } catch (error) {
    const response = authenticationErrorResponse(error) ?? stravaErrorResponse(error);
    if (response) return response;
    if (error instanceof Error && error.message.includes("required identity")) {
      return Response.json({ error: "Strava returned an incomplete activity list.", code: "malformed_response" }, { status: 502 });
    }
    throw error;
  }
}
