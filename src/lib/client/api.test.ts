import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest, ApiError } from "./api";

describe("typed API client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("parses error and errors payloads while preserving status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ errors: ["First", "Second"] }), { status: 409, headers: { "Content-Type": "application/json" } })));
    await expect(apiRequest("/api/test")).rejects.toMatchObject({ status: 409, message: "First Second", errors: ["First", "Second"] } satisfies Partial<ApiError>);
  });

  it("redirects 401 responses to sign-in with a callback", async () => {
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { pathname: "/activities", search: "?page=2", assign } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Authentication required" }), { status: 401 })));
    await expect(apiRequest("/api/test")).rejects.toBeInstanceOf(ApiError);
    expect(assign).toHaveBeenCalledWith("/sign-in?callbackUrl=%2Factivities%3Fpage%3D2");
  });

  it("preserves every Headers form and does not replace explicit content types", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await apiRequest("/api/test", {
      method: "POST",
      body: "payload",
      headers: new Headers([["X-Test", "kept"], ["Content-Type", "text/plain"]]),
    });

    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get("X-Test")).toBe("kept");
    expect(headers.get("Content-Type")).toBe("text/plain");
  });
});
