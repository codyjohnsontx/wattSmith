import { authenticationErrorResponse, requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { hasRequiredScopes, revokeStravaToken } from "@/lib/server/strava/client";
import { isStravaEnabled, stravaDisabledResponse } from "@/lib/server/strava/config";

export async function GET() {
  if (!isStravaEnabled()) return stravaDisabledResponse();
  try {
    const user = await requireUser();
    const connection = await db.stravaConnection.findUnique({ where: { userId: user.id } });
    return Response.json({
      connected: Boolean(connection),
      athleteId: connection?.athleteId,
      connectedAt: connection?.connectedAt.toISOString(),
      scopes: connection?.scopes ?? [],
      reconnectRequired: connection ? !hasRequiredScopes(connection.scopes) : false,
      cacheRetentionDays: 7,
    });
  } catch (error) {
    const response = authenticationErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

// Deliberately not gated on isStravaEnabled(): a user must always be able to remove a stored
// connection, even after Strava is switched off. The local delete commits first so Strava can
// never delay or prevent it; revocation then runs best-effort from the captured token (it fails
// without Strava credentials) under a short timeout.
export async function DELETE() {
  try {
    const user = await requireUser();
    const connection = await db.stravaConnection.findUnique({ where: { userId: user.id } });
    await db.$transaction([
      db.stravaCacheEntry.deleteMany({ where: { userId: user.id } }),
      db.stravaConnection.deleteMany({ where: { userId: user.id } }),
    ]);
    if (connection) {
      await revokeStravaToken(connection.encryptedAccessToken).catch(() => undefined);
    }
    return new Response(null, { status: 204 });
  } catch (error) {
    const response = authenticationErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
