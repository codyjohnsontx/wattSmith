// Strava is optional. Every Strava surface stays off unless a Strava app is configured.
export function isStravaEnabled() {
  return Boolean(process.env.STRAVA_CLIENT_ID);
}

export function stravaDisabledResponse() {
  return Response.json({ error: "Strava is not enabled on this deployment.", code: "strava_disabled" }, { status: 404 });
}
