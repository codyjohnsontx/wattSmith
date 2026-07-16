import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createStravaOAuthState, decryptStravaToken, encryptStravaToken, verifyStravaOAuthState } from "./tokens";

describe("Strava token security", () => {
  beforeEach(() => {
    process.env.STRAVA_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    process.env.AUTH_SECRET = "test-auth-secret";
  });
  afterEach(() => {
    delete process.env.STRAVA_TOKEN_ENCRYPTION_KEY;
    delete process.env.AUTH_SECRET;
  });

  it("encrypts with randomized AES-GCM payloads and decrypts losslessly", () => {
    const first = encryptStravaToken("secret-token");
    const second = encryptStravaToken("secret-token");
    expect(first).not.toBe(second);
    expect(first).not.toContain("secret-token");
    expect(decryptStravaToken(first)).toBe("secret-token");
  });

  it("rejects mismatched and expired OAuth state", () => {
    const state = createStravaOAuthState("user-1", 1_000);
    expect(verifyStravaOAuthState(state, "user-1", 1_001)).toBe(true);
    expect(verifyStravaOAuthState(state, "user-2", 1_001)).toBe(false);
    expect(verifyStravaOAuthState(state, "user-1", 1_000 + 10 * 60_000 + 1)).toBe(false);
  });
});
