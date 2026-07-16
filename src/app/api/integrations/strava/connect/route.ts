import { cookies } from "next/headers";
import { authenticationErrorResponse, requireUser } from "@/lib/server/auth";
import { REQUIRED_STRAVA_SCOPES, STRAVA_OAUTH_BASE_URL, stravaCallbackUrl, stravaClientId } from "@/lib/server/strava/client";
import { createStravaOAuthState } from "@/lib/server/strava/tokens";

export async function GET() {
  try {
    const user = await requireUser();
    const state = createStravaOAuthState(user.id);
    (await cookies()).set("wattsmith_strava_state", state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/api/integrations/strava/callback",
      maxAge: 10 * 60,
    });
    const authorize = new URL(`${STRAVA_OAUTH_BASE_URL}/authorize`);
    authorize.searchParams.set("client_id", stravaClientId());
    authorize.searchParams.set("redirect_uri", stravaCallbackUrl());
    authorize.searchParams.set("response_type", "code");
    authorize.searchParams.set("approval_prompt", "auto");
    authorize.searchParams.set("scope", REQUIRED_STRAVA_SCOPES.join(","));
    authorize.searchParams.set("state", state);
    return Response.redirect(authorize);
  } catch (error) {
    const response = authenticationErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
