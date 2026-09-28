import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { describe, expect, it, vi } from "vitest";
import nextConfig from "../next.config";

vi.mock("@/auth", () => ({ auth: (handler: unknown) => handler }));

describe("auth proxy matcher", () => {
  it("leaves activity APIs to their handlers so the Strava gate answers first", async () => {
    const { config } = await import("./proxy");
    expect(unstable_doesMiddlewareMatch({ config, nextConfig, url: "/api/activities" })).toBe(false);
    expect(unstable_doesMiddlewareMatch({ config, nextConfig, url: "/api/activities/1" })).toBe(false);
  });

  it("still guards the other protected APIs and pages", async () => {
    const { config } = await import("./proxy");
    for (const url of ["/api/workouts", "/api/profile", "/activities", "/activities/1", "/settings"]) {
      expect(unstable_doesMiddlewareMatch({ config, nextConfig, url })).toBe(true);
    }
  });
});
