import type { Prisma } from "@prisma/client";
import { db } from "@/lib/server/db";

export const STRAVA_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export async function getCachedStravaResource<T>(userId: string, resourceKey: string): Promise<{ payload: T; expiresAt: Date } | null> {
  const entry = await db.stravaCacheEntry.findUnique({ where: { userId_resourceKey: { userId, resourceKey } } });
  if (!entry || entry.expiresAt.getTime() <= Date.now()) return null;
  return { payload: entry.payload as T, expiresAt: entry.expiresAt };
}

export async function cacheStravaResource<T>(userId: string, resourceKey: string, payload: T, maxAgeMs = STRAVA_CACHE_MAX_AGE_MS) {
  const fetchedAt = new Date();
  const expiresAt = new Date(fetchedAt.getTime() + Math.min(maxAgeMs, STRAVA_CACHE_MAX_AGE_MS));
  await db.stravaCacheEntry.upsert({
    where: { userId_resourceKey: { userId, resourceKey } },
    create: { userId, resourceKey, payload: payload as Prisma.InputJsonValue, fetchedAt, expiresAt },
    update: { payload: payload as Prisma.InputJsonValue, fetchedAt, expiresAt },
  });
  return expiresAt;
}

export async function invalidateStravaCache(userId: string) {
  await db.stravaCacheEntry.deleteMany({ where: { userId } });
}
