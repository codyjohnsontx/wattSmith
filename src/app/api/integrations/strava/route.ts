import { authenticationErrorResponse, requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { invalidateStravaCache } from "@/lib/server/strava/cache";
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
// connection, even after Strava is switched off. Revocation is best-effort for the same reason
// (it fails without Strava credentials), so it never blocks the local delete.
export async function DELETE() {
  try {
    const user = await requireUser();
    const connection = await db.stravaConnection.findUnique({ where: { userId: user.id } });
    if (connection) {
      await revokeStravaToken(connection.encryptedAccessToken).catch(() => undefined);
    }
    await invalidateStravaCache(user.id);
    await db.stravaConnection.deleteMany({ where: { userId: user.id } });
    return new Response(null, { status: 204 });
  } catch (error) {
    const response = authenticationErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
