import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/server/db";
import { exchangeAuthorizationCode, getValidStravaAccessToken, revokeStravaToken } from "./client";

vi.mock("@/lib/server/db", () => ({
  db: {
    $transaction: vi.fn(),
    $executeRaw: vi.fn(),
    stravaConnection: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/server/strava/tokens", () => ({
  decryptStravaToken: vi.fn((value: string) => value.replace("encrypted-", "")),
  encryptStravaToken: vi.fn((value: string) => `encrypted-${value}`),
}));

const connection = {
  userId: "user-1",
  scopes: ["read", "activity:read_all"],
  encryptedAccessToken: "encrypted-old-access",
  encryptedRefreshToken: "encrypted-old-refresh",
  accessTokenExpiresAt: new Date(0),
  updatedAt: new Date("2026-07-01T00:00:00.000Z"),
};

describe("Strava client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRAVA_CLIENT_ID = "client";
    process.env.STRAVA_CLIENT_SECRET = "secret";
    (db.stravaConnection.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(connection);
    (db.stravaConnection.updateMany as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });
    (db.$transaction as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async (callback: (client: typeof db) => unknown) => callback(db),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.STRAVA_CLIENT_ID;
    delete process.env.STRAVA_CLIENT_SECRET;
  });

  it("maps upstream timeouts to a stable Strava error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue({ name: "TimeoutError" }));
    await expect(exchangeAuthorizationCode("code")).rejects.toMatchObject({ status: 504, code: "timeout" });
  });

  it("keeps failed revocations retryable by rejecting non-2xx responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    await expect(revokeStravaToken("encrypted-access")).rejects.toMatchObject({
      status: 502,
      code: "revocation_failed",
    });
  });

  it("shares one rotating-token refresh across concurrent requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: "new-access",
      refresh_token: "new-refresh",
      expires_at: 2_000_000_000,
      athlete: { id: 1 },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(Promise.all([
      getValidStravaAccessToken("user-1"),
      getValidStravaAccessToken("user-1"),
    ])).resolves.toEqual(["new-access", "new-access"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(db.stravaConnection.updateMany).toHaveBeenCalledTimes(1);
  });
});
