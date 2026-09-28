import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { describe, expect, it, vi } from "vitest";
import nextConfig from "../next.config";

vi.mock("@/auth", () => ({ auth: (handler: unknown) => handler }));

describe("auth proxy matcher", () => {
  it("guards the activity APIs", async () => {
    const { config } = await import("./proxy");
    expect(unstable_doesMiddlewareMatch({ config, nextConfig, url: "/api/activities" })).toBe(true);
    expect(unstable_doesMiddlewareMatch({ config, nextConfig, url: "/api/activities/1" })).toBe(true);
  });
});
