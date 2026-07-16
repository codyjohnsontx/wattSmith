import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateFtpHistoryEntry } from "@/lib/server/profile";

vi.mock("@/lib/server/auth", () => ({
  requireUser: vi.fn().mockResolvedValue({ id: "user-1" }),
  authenticationErrorResponse: vi.fn(),
}));

vi.mock("@/lib/server/profile", () => ({
  FtpHistoryError: class FtpHistoryError extends Error {},
  updateFtpHistoryEntry: vi.fn(),
  deleteFtpHistoryEntry: vi.fn(),
  ftpHistoryToDto: vi.fn((entry) => entry),
}));

describe("FTP history entry route", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([undefined, null, [], {}, { source: "manual" }])("rejects invalid PATCH payload %#", async (payload) => {
    const { PATCH } = await import("./route");
    const request = new Request("http://localhost/api/profile/ftp-history/entry-1", {
      method: "PATCH",
      body: payload === undefined ? "not-json" : JSON.stringify(payload),
    });
    const response = await PATCH(request, { params: Promise.resolve({ entryId: "entry-1" }) });
    expect(response.status).toBe(400);
    expect(updateFtpHistoryEntry).not.toHaveBeenCalled();
  });

  it("accepts a partial FTP update", async () => {
    (updateFtpHistoryEntry as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ftp: 275 });
    const { PATCH } = await import("./route");
    const response = await PATCH(new Request("http://localhost", {
      method: "PATCH",
      body: JSON.stringify({ ftp: 275 }),
    }), { params: Promise.resolve({ entryId: "entry-1" }) });
    expect(response.status).toBe(200);
    expect(updateFtpHistoryEntry).toHaveBeenCalledWith("user-1", "entry-1", { ftp: 275 });
  });
});
