import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/server/db";
import { getCachedStravaResource } from "./cache";

vi.mock("@/lib/server/db", () => ({
  db: {
    stravaCacheEntry: {
      deleteMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

describe("Strava cache retention", () => {
  beforeEach(() => vi.clearAllMocks());

  it("removes all expired rows before reading a resource", async () => {
    (db.stravaCacheEntry.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(getCachedStravaResource("user-1", "activity:1")).resolves.toBeNull();
    expect(db.stravaCacheEntry.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lte: expect.any(Date) } },
    });
  });
});
