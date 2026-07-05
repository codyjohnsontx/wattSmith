import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { db } from "@/lib/server/db";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/server/db", () => ({
  db: {
    athleteProfile: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      updateMany: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

const mockAuth = auth as unknown as {
  mockResolvedValue: (value: unknown) => void;
};
const athleteProfile = db.athleteProfile as unknown as {
  create: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  findUniqueOrThrow: ReturnType<typeof vi.fn>;
  updateMany: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
};

const validProfile = {
  id: "local-athlete",
  ftp: 250,
  experienceLevel: "serious",
  weeklyHours: 8,
  availableDays: ["Tue", "Thu", "Sat"],
  primaryGoal: "Raise threshold",
  preferredWorkoutDurationMinutes: 75,
  constraints: ["travel"],
  updatedAt: "2026-07-01T00:00:00.000Z",
};

describe("profile API route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(null);
  });

  it("rejects unauthenticated profile requests", async () => {
    const { GET } = await import("./route");
    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Authentication required" });
  });

  it("rejects stale profile updates", async () => {
    mockAuth.mockResolvedValue({
      user: {
        id: "user-1",
        name: null,
        email: null,
        image: null,
      },
    });
    athleteProfile.findUnique.mockResolvedValue({
      updatedAt: new Date("2026-07-02T00:00:00.000Z"),
    });
    athleteProfile.updateMany.mockResolvedValue({ count: 0 });

    const { PATCH } = await import("./route");
    const response = await PATCH(
      new Request("http://localhost/api/profile", {
        method: "PATCH",
        body: JSON.stringify(validProfile),
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Profile has changed since this edit started. Refresh and try again.",
    });
    expect(athleteProfile.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it("returns conflict when profile creation races another request", async () => {
    mockAuth.mockResolvedValue({
      user: {
        id: "user-1",
        name: null,
        email: null,
        image: null,
      },
    });
    athleteProfile.findUnique.mockResolvedValue(null);
    athleteProfile.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
        meta: { target: ["userId"] },
      }),
    );

    const { PATCH } = await import("./route");
    const response = await PATCH(
      new Request("http://localhost/api/profile", {
        method: "PATCH",
        body: JSON.stringify(validProfile),
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Profile has changed since this edit started. Refresh and try again.",
    });
  });
});
