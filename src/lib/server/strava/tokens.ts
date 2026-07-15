import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const TOKEN_VERSION = "v1";

function encryptionKey() {
  const configured = process.env.STRAVA_TOKEN_ENCRYPTION_KEY;
  if (!configured) throw new Error("STRAVA_TOKEN_ENCRYPTION_KEY is not configured.");
  const key = /^[a-f\d]{64}$/i.test(configured)
    ? Buffer.from(configured, "hex")
    : Buffer.from(configured, "base64");
  if (key.length !== 32) {
    throw new Error("STRAVA_TOKEN_ENCRYPTION_KEY must be 32 bytes encoded as base64 or 64 hex characters.");
  }
  return key;
}

export function encryptStravaToken(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [TOKEN_VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptStravaToken(value: string): string {
  const [version, iv, tag, encrypted] = value.split(".");
  if (version !== TOKEN_VERSION || !iv || !tag || !encrypted) throw new Error("Encrypted Strava token is malformed.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}

function stateSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is required for Strava OAuth state signing.");
  return secret;
}

export function createStravaOAuthState(userId: string, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ userId, nonce: randomBytes(24).toString("base64url"), expiresAt: now + 10 * 60_000 })).toString("base64url");
  const signature = createHmac("sha256", stateSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyStravaOAuthState(value: string, userId: string, now = Date.now()) {
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return false;
  const expected = createHmac("sha256", stateSecret()).update(payload).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { userId?: unknown; expiresAt?: unknown };
    return parsed.userId === userId && typeof parsed.expiresAt === "number" && parsed.expiresAt >= now;
  } catch {
    return false;
  }
}
