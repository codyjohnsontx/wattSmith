import { Prisma } from "@prisma/client";
import { db } from "@/lib/server/db";
import { decryptStravaToken, encryptStravaToken } from "@/lib/server/strava/tokens";
import type { StravaTokenResponse } from "@/lib/integrations/strava/types";

export const STRAVA_API_BASE_URL = "https://www.strava.com/api/v3";
export const STRAVA_OAUTH_BASE_URL = "https://www.strava.com/oauth";
export const REQUIRED_STRAVA_SCOPES = ["read", "activity:read_all"] as const;
const STRAVA_REQUEST_TIMEOUT_MS = 15_000;
const STRAVA_REVOKE_TIMEOUT_MS = 5_000;
const refreshesByUser = new Map<string, Promise<string>>();

export class StravaApiError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message);
    this.name = "StravaApiError";
  }
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

export function stravaClientId() { return requiredEnv("STRAVA_CLIENT_ID"); }
export function stravaClientSecret() { return requiredEnv("STRAVA_CLIENT_SECRET"); }
export function stravaCallbackUrl() { return requiredEnv("STRAVA_CALLBACK_URL"); }

export function hasRequiredScopes(scopes: string[]) {
  return REQUIRED_STRAVA_SCOPES.every((scope) => scopes.includes(scope));
}

async function stravaFetch(url: string, init: RequestInit, timeoutMs = STRAVA_REQUEST_TIMEOUT_MS) {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    if (typeof error === "object" && error !== null && "name" in error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new StravaApiError("Strava did not respond before the request timed out.", 504, "timeout");
    }
    throw error;
  }
}

async function parseTokenResponse(response: Response): Promise<StravaTokenResponse> {
  const body = await response.json().catch(() => undefined) as Partial<StravaTokenResponse> | undefined;
  if (!response.ok || !body?.access_token || !body.refresh_token || !body.expires_at) {
    throw new StravaApiError("Strava authorization could not be refreshed.", response.status, "token_refresh_failed");
  }
  return body as StravaTokenResponse;
}

export async function exchangeAuthorizationCode(code: string) {
  const response = await stravaFetch(`${STRAVA_OAUTH_BASE_URL}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: stravaClientId(), client_secret: stravaClientSecret(), code, grant_type: "authorization_code" }),
    cache: "no-store",
  });
  return parseTokenResponse(response);
}

function validateConnection(connection: Awaited<ReturnType<typeof db.stravaConnection.findUnique>>) {
  if (!connection) throw new StravaApiError("Connect Strava to continue.", 409, "not_connected");
  if (!hasRequiredScopes(connection.scopes)) throw new StravaApiError("Reconnect Strava and grant full activity access.", 403, "insufficient_scope");
  return connection;
}

async function refreshStravaAccessToken(userId: string) {
  return db.$transaction(async (transaction) => {
    await transaction.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${userId}), 0)`);
    const connection = validateConnection(await transaction.stravaConnection.findUnique({ where: { userId } }));
    if (connection.accessTokenExpiresAt.getTime() > Date.now() + 3_600_000) {
      return decryptStravaToken(connection.encryptedAccessToken);
    }

    const response = await stravaFetch(`${STRAVA_OAUTH_BASE_URL}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: stravaClientId(), client_secret: stravaClientSecret(), grant_type: "refresh_token", refresh_token: decryptStravaToken(connection.encryptedRefreshToken) }),
      cache: "no-store",
    });
    const tokens = await parseTokenResponse(response);
    const update = await transaction.stravaConnection.updateMany({
      where: { userId, updatedAt: connection.updatedAt },
      data: {
        encryptedAccessToken: encryptStravaToken(tokens.access_token),
        encryptedRefreshToken: encryptStravaToken(tokens.refresh_token),
        accessTokenExpiresAt: new Date(tokens.expires_at * 1000),
        lastRefreshedAt: new Date(),
      },
    });
    if (update.count === 1) return tokens.access_token;
    const newer = await transaction.stravaConnection.findUnique({ where: { userId } });
    if (!newer) throw new StravaApiError("The Strava connection was revoked.", 403, "revoked");
    return decryptStravaToken(newer.encryptedAccessToken);
  }, { maxWait: 5_000, timeout: STRAVA_REQUEST_TIMEOUT_MS + 5_000 });
}

export async function getValidStravaAccessToken(userId: string) {
  const connection = validateConnection(await db.stravaConnection.findUnique({ where: { userId } }));
  if (connection.accessTokenExpiresAt.getTime() > Date.now() + 3_600_000) {
    return decryptStravaToken(connection.encryptedAccessToken);
  }
  const activeRefresh = refreshesByUser.get(userId);
  if (activeRefresh) return activeRefresh;
  const refresh = refreshStravaAccessToken(userId).finally(() => {
    if (refreshesByUser.get(userId) === refresh) refreshesByUser.delete(userId);
  });
  refreshesByUser.set(userId, refresh);
  return refresh;
}

export async function revokeStravaToken(encryptedAccessToken: string) {
  const credentials = Buffer.from(`${stravaClientId()}:${stravaClientSecret()}`).toString("base64");
  const response = await stravaFetch(`${STRAVA_OAUTH_BASE_URL}/revoke`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ token: decryptStravaToken(encryptedAccessToken), token_type_hint: "access_token" }),
    cache: "no-store",
  }, STRAVA_REVOKE_TIMEOUT_MS);
  if (!response.ok) {
    throw new StravaApiError("Strava access could not be revoked. Try disconnecting again.", 502, "revocation_failed");
  }
}

export async function stravaApiFetch<T>(userId: string, path: string): Promise<T> {
  const token = await getValidStravaAccessToken(userId);
  const response = await stravaFetch(`${STRAVA_API_BASE_URL}${path}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!response.ok) {
    if (response.status === 401) throw new StravaApiError("Strava authorization has been revoked. Reconnect to continue.", 403, "revoked");
    if (response.status === 429) throw new StravaApiError("Strava rate limit reached. Try again after the limit resets.", 429, "rate_limited");
    throw new StravaApiError("Strava returned an unexpected response.", 502, "upstream_error");
  }
  return response.json() as Promise<T>;
}
