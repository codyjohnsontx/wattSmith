import { db } from "@/lib/server/db";
import { isStravaEnabled, stravaDisabledResponse } from "@/lib/server/strava/config";

export async function GET(request: Request) {
  if (!isStravaEnabled()) return stravaDisabledResponse();
  const url = new URL(request.url);
  const verifyToken = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (!challenge || !process.env.STRAVA_WEBHOOK_VERIFY_TOKEN || verifyToken !== process.env.STRAVA_WEBHOOK_VERIFY_TOKEN) {
    return Response.json({ error: "Webhook verification failed." }, { status: 403 });
  }
  return Response.json({ "hub.challenge": challenge });
}

export async function POST(request: Request) {
  if (!isStravaEnabled()) return stravaDisabledResponse();
  const event = await request.json().catch(() => undefined) as {
    object_type?: string;
    aspect_type?: string;
    owner_id?: number | string;
    updates?: Record<string, unknown>;
  } | undefined;
  if (!event?.owner_id) return Response.json({ received: true });
  const connections = await db.stravaConnection.findMany({ where: { athleteId: String(event.owner_id) }, select: { userId: true } });
  for (const connection of connections) {
    await db.stravaCacheEntry.deleteMany({ where: { userId: connection.userId } });
  }
  const authorized = event.updates?.authorized;
  const deauthorized = event.object_type === "athlete" && event.aspect_type === "update" && (authorized === "false" || authorized === false);
  if (deauthorized) await db.stravaConnection.deleteMany({ where: { athleteId: String(event.owner_id) } });
  return Response.json({ received: true });
}
