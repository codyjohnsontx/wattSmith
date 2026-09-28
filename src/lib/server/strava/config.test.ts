import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/auth", () => ({
  requireUser: vi.fn(() => { throw new Error("auth must not run while Strava is off"); }),
  authenticationErrorResponse: vi.fn(),
}));

vi.mock("@/lib/server/db", () => ({
  db: new Proxy({}, { get: () => { throw new Error("database must not run while Strava is off"); } }),
}));

const routes = {
  "integrations/strava": () => import("@/app/api/integrations/strava/route"),
  "integrations/strava/connect": () => import("@/app/api/integrations/strava/connect/route"),
  "integrations/strava/callback": () => import("@/app/api/integrations/strava/callback/route"),
  "integrations/strava/webhook": () => import("@/app/api/integrations/strava/webhook/route"),
  "activities": () => import("@/app/api/activities/route"),
  "activities/[activityId]": () => import("@/app/api/activities/[activityId]/route"),
};

describe("Strava off by default", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is enabled only when STRAVA_CLIENT_ID is set", async () => {
    const { isStravaEnabled } = await import("./config");
    vi.stubEnv("STRAVA_CLIENT_ID", "");
    expect(isStravaEnabled()).toBe(false);
    vi.stubEnv("STRAVA_CLIENT_ID", "12345");
    expect(isStravaEnabled()).toBe(true);
  });

  it.each(Object.entries(routes))("returns strava_disabled from every %s handler", async (_name, load) => {
    vi.stubEnv("STRAVA_CLIENT_ID", "");
    const handlers = Object.entries(await load()).filter(([method]) => ["GET", "POST", "DELETE"].includes(method));
    expect(handlers.length).toBeGreaterThan(0);
    for (const [, handler] of handlers) {
      const response = await (handler as (request: Request, context: unknown) => Promise<Response>)(
        new Request("http://localhost/api"),
        { params: Promise.resolve({ activityId: "1" }) },
      );
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ code: "strava_disabled" });
    }
  });
});
