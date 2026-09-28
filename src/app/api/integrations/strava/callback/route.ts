import { cookies } from "next/headers";
import { authenticationErrorResponse, requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { invalidateStravaCache } from "@/lib/server/strava/cache";
import { exchangeAuthorizationCode, hasRequiredScopes } from "@/lib/server/strava/client";
import { encryptStravaToken, verifyStravaOAuthState } from "@/lib/server/strava/tokens";
import { isStravaEnabled, stravaDisabledResponse } from "@/lib/server/strava/config";

export async function GET(request: Request) {
  if (!isStravaEnabled()) return stravaDisabledResponse();
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const state = url.searchParams.get("state") ?? "";
    const code = url.searchParams.get("code") ?? "";
    const scope = (url.searchParams.get("scope") ?? "").split(",").filter(Boolean);
    const cookieStore = await cookies();
    const stateCookie = cookieStore.get("wattsmith_strava_state")?.value;
    cookieStore.delete("wattsmith_strava_state");
    if (!stateCookie || stateCookie !== state || !verifyStravaOAuthState(state, user.id)) {
      return Response.json({ error: "Strava OAuth state is invalid or expired." }, { status: 400 });
    }
    if (!code) return Response.json({ error: "Strava did not return an authorization code." }, { status: 400 });
    if (!hasRequiredScopes(scope)) {
      return Response.redirect(new URL("/settings?strava=insufficient_scope", request.url));
    }
    const tokens = await exchangeAuthorizationCode(code);
    if (tokens.athlete?.id === undefined) return Response.json({ error: "Strava did not identify the connected athlete." }, { status: 502 });
    await invalidateStravaCache(user.id);
    await db.stravaConnection.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        athleteId: String(tokens.athlete.id),
        encryptedAccessToken: encryptStravaToken(tokens.access_token),
        encryptedRefreshToken: encryptStravaToken(tokens.refresh_token),
        accessTokenExpiresAt: new Date(tokens.expires_at * 1000),
        scopes: scope,
      },
      update: {
        athleteId: String(tokens.athlete.id),
        encryptedAccessToken: encryptStravaToken(tokens.access_token),
        encryptedRefreshToken: encryptStravaToken(tokens.refresh_token),
        accessTokenExpiresAt: new Date(tokens.expires_at * 1000),
        scopes: scope,
        connectedAt: new Date(),
      },
    });
    return Response.redirect(new URL("/activities?strava=connected", request.url));
  } catch (error) {
    const response = authenticationErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
