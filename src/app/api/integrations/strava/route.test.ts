import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/server/db";
import { encryptStravaToken } from "@/lib/server/strava/tokens";

vi.mock("@/lib/server/auth", () => ({
  requireUser: vi.fn().mockResolvedValue({ id: "user-1" }),
  authenticationErrorResponse: vi.fn(),
}));

vi.mock("@/lib/server/db", () => ({
  db: {
    $transaction: vi.fn(async (operations: unknown[]) => Promise.all(operations)),
    stravaConnection: { findUnique: vi.fn(), deleteMany: vi.fn() },
    stravaCacheEntry: { deleteMany: vi.fn() },
  },
}));

const findUnique = db.stravaConnection.findUnique as unknown as ReturnType<typeof vi.fn>;
const deleteMany = db.stravaConnection.deleteMany as unknown as ReturnType<typeof vi.fn>;
const deleteCache = db.stravaCacheEntry.deleteMany as unknown as ReturnType<typeof vi.fn>;
const transaction = db.$transaction as unknown as ReturnType<typeof vi.fn>;
const fetchMock = vi.fn();

describe("DELETE /api/integrations/strava", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("STRAVA_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("removes a stored connection while Strava is off even though revoke cannot run", async () => {
    vi.stubEnv("STRAVA_CLIENT_ID", "");
    vi.stubEnv("STRAVA_CLIENT_SECRET", "");
    findUnique.mockResolvedValue({ userId: "user-1", encryptedAccessToken: encryptStravaToken("access") });
    const { DELETE } = await import("./route");

    const response = await DELETE();

    expect(response.status).toBe(204);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(deleteCache).toHaveBeenCalledWith({ where: { userId: "user-1" } });
    expect(deleteMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
  });

  it("succeeds while Strava is off when no connection is stored", async () => {
    vi.stubEnv("STRAVA_CLIENT_ID", "");
    findUnique.mockResolvedValue(null);
    const { DELETE } = await import("./route");

    const response = await DELETE();

    expect(response.status).toBe(204);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(deleteMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
  });

  it("still removes the connection when Strava rejects the revoke", async () => {
    vi.stubEnv("STRAVA_CLIENT_ID", "client");
    vi.stubEnv("STRAVA_CLIENT_SECRET", "secret");
    findUnique.mockResolvedValue({ userId: "user-1", encryptedAccessToken: encryptStravaToken("access") });
    fetchMock.mockResolvedValue(new Response(null, { status: 500 }));
    const { DELETE } = await import("./route");

    const response = await DELETE();

    expect(response.status).toBe(204);
    expect(fetchMock).toHaveBeenCalledWith("https://www.strava.com/oauth/revoke", expect.objectContaining({ method: "POST" }));
    expect(deleteMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
  });

  it("commits the local delete before revoking, so a pending revoke cannot hold it back", async () => {
    vi.stubEnv("STRAVA_CLIENT_ID", "client");
    vi.stubEnv("STRAVA_CLIENT_SECRET", "secret");
    findUnique.mockResolvedValue({ userId: "user-1", encryptedAccessToken: encryptStravaToken("access") });
    let releaseRevoke: (response: Response) => void = () => undefined;
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => { releaseRevoke = resolve; }));
    const { DELETE } = await import("./route");

    const pending = DELETE();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());

    expect(transaction).toHaveBeenCalledOnce();
    expect(deleteCache).toHaveBeenCalledWith({ where: { userId: "user-1" } });
    expect(deleteMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    releaseRevoke(new Response(null, { status: 200 }));
    expect((await pending).status).toBe(204);
  });

  it("skips revoke and returns an error when the local delete fails", async () => {
    vi.stubEnv("STRAVA_CLIENT_ID", "client");
    vi.stubEnv("STRAVA_CLIENT_SECRET", "secret");
    findUnique.mockResolvedValue({ userId: "user-1", encryptedAccessToken: encryptStravaToken("access") });
    transaction.mockRejectedValueOnce(new Error("database unavailable"));
    const { DELETE } = await import("./route");

    await expect(DELETE()).rejects.toThrow("database unavailable");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
