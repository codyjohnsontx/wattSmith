import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stravaApiFetch } from "@/lib/server/strava/client";

vi.mock("@/lib/server/auth", () => ({
  requireUser: vi.fn().mockResolvedValue({ id: "user-1" }),
  authenticationErrorResponse: vi.fn(),
}));

vi.mock("@/lib/server/db", () => ({
  db: { stravaConnection: { findUnique: vi.fn().mockResolvedValue({ athleteId: "99" }) } },
}));

vi.mock("@/lib/server/profile", () => ({
  FtpHistoryError: class FtpHistoryError extends Error {},
  resolveFtpForDate: vi.fn(),
}));

vi.mock("@/lib/server/strava/cache", () => ({
  getCachedStravaResource: vi.fn().mockResolvedValue(null),
  cacheStravaResource: vi.fn(),
}));

vi.mock("@/lib/server/strava/client", () => ({
  StravaApiError: class StravaApiError extends Error {},
  stravaApiFetch: vi.fn(),
}));

describe("activity detail route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("STRAVA_CLIENT_ID", "client");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("returns not found for an owned non-cycling activity before loading streams", async () => {
    (stravaApiFetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 123,
      athlete: { id: 99 },
      sport_type: "Run",
      start_date: "2026-07-01T12:00:00Z",
    });
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ activityId: "123" }),
    });
    expect(response.status).toBe(404);
    expect(stravaApiFetch).toHaveBeenCalledTimes(1);
    expect(stravaApiFetch).toHaveBeenCalledWith("user-1", "/activities/123");
  });
});
