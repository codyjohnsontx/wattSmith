import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/server/db";
import { deleteFtpHistoryEntry, getOrCreateAthleteProfile, parseFtp, syncCurrentProfileFtp } from "./profile";

vi.mock("@/lib/server/db", () => ({
  db: {
    $transaction: vi.fn(),
    athleteProfile: { upsert: vi.fn(), update: vi.fn() },
    athleteFtpHistory: {
      upsert: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

const profile = {
  id: "profile-1",
  userId: "user-1",
  ftp: 250,
  createdAt: new Date("2026-07-10T18:42:00.000Z"),
};

describe("FTP history service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (db.$transaction as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async (callback: (client: typeof db) => unknown) => callback(db),
    );
  });

  it("rejects booleans as FTP values", () => {
    expect(() => parseFtp(true)).toThrow("ftp must be an integer");
    expect(parseFtp("275")).toBe(275);
  });

  it("normalizes profile creation time to UTC midnight for initial history", async () => {
    (db.athleteProfile.upsert as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(profile);
    (db.athleteFtpHistory.upsert as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});
    await getOrCreateAthleteProfile("user-1");
    const effectiveFrom = new Date("2026-07-10T00:00:00.000Z");
    expect(db.athleteFtpHistory.upsert).toHaveBeenCalledWith({
      where: { userId_effectiveFrom: { userId: "user-1", effectiveFrom } },
      create: expect.objectContaining({ userId: "user-1", effectiveFrom }),
      update: {},
    });
  });

  it("retries serialization conflicts before deleting an entry", async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError("write conflict", {
      code: "P2034",
      clientVersion: "test",
    });
    (db.$transaction as unknown as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(conflict)
      .mockImplementationOnce(async (callback: (client: typeof db) => unknown) => callback(db));
    (db.athleteFtpHistory.findFirst as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ id: "entry-1" })
      .mockResolvedValueOnce({ ftp: 250 });
    (db.athleteFtpHistory.count as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(2);
    await deleteFtpHistoryEntry("user-1", "entry-1");
    expect(db.$transaction).toHaveBeenCalledTimes(2);
    expect(db.$transaction).toHaveBeenLastCalledWith(
      expect.any(Function),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    expect(db.athleteFtpHistory.delete).toHaveBeenCalledWith({ where: { id: "entry-1" } });
  });

  it("does not promote future-dated FTP entries to the current profile", async () => {
    (db.athleteFtpHistory.upsert as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (db.athleteFtpHistory.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ftp: 260 });
    await syncCurrentProfileFtp("user-1", 275);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    expect(db.athleteFtpHistory.findFirst).toHaveBeenCalledWith({
      where: { userId: "user-1", effectiveFrom: { lte: today } },
      orderBy: { effectiveFrom: "desc" },
    });
    expect(db.athleteProfile.update).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      data: { ftp: 260 },
    });
  });
});
