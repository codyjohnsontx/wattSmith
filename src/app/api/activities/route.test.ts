import { afterEach, describe, expect, it, vi } from "vitest";

// The auth proxy no longer guards /api/activities, so the handlers must reject anonymous callers
// themselves once Strava is on, and answer strava_disabled before auth while it is off.
vi.mock("@/auth", () => ({ auth: vi.fn().mockResolvedValue(null) }));

vi.mock("@/lib/server/db", () => ({
  db: new Proxy({}, { get: () => { throw new Error("database must not run for anonymous callers"); } }),
}));

const handlers = {
  "/api/activities": async () => (await import("./route")).GET(new Request("http://localhost/api/activities")),
  "/api/activities/1": async () => (await import("./[activityId]/route")).GET(new Request("http://localhost/api/activities/1"), { params: Promise.resolve({ activityId: "1" }) }),
};

describe("anonymous activity API requests", () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each(Object.entries(handlers))("%s returns 404 strava_disabled while Strava is off", async (_url, call) => {
    vi.stubEnv("STRAVA_CLIENT_ID", "");
    const response = await call();
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "strava_disabled" });
  });

  it.each(Object.entries(handlers))("%s returns 401 while Strava is on", async (_url, call) => {
    vi.stubEnv("STRAVA_CLIENT_ID", "client");
    const response = await call();
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: "Authentication required" });
  });
});
