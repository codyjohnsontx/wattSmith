import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { auth } from "@/auth";
import { db } from "@/lib/server/db";
import { mockSignIn } from "../testUtils";

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

const dbProfile = {
  ...validProfile,
  userId: "user-1",
  targetEventDate: null,
  createdAt: new Date("2026-07-01T00:00:00.000Z"),
  updatedAt: new Date("2026-07-02T00:00:00.000Z"),
};

describe("profile API route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(null);
  });

  it("GET unauthenticated returns 401", async () => {
    const { GET } = await import("./route");
    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Authentication required" });
  });

  it("GET creates/defaults profile when missing via upsert", async () => {
    mockSignIn(mockAuth);
    athleteProfile.upsert.mockResolvedValue(dbProfile);

    const { GET } = await import("./route");
    const response = await GET();

    expect(response.status).toBe(200);
    expect(athleteProfile.upsert).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      create: expect.objectContaining({ userId: "user-1" }),
      update: {},
    });
    await expect(response.json()).resolves.toMatchObject({
      id: validProfile.id,
      ftp: validProfile.ftp,
      updatedAt: "2026-07-02T00:00:00.000Z",
    });
  });

  it("PATCH rejects missing updatedAt precondition with 400", async () => {
    mockSignIn(mockAuth);

    const { PATCH } = await import("./route");
    const response = await PATCH(
      new Request("http://localhost/api/profile", {
        method: "PATCH",
        body: JSON.stringify({ ...validProfile, updatedAt: undefined }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      errors: ["updatedAt precondition is required."],
    });
    expect(athleteProfile.findUnique).not.toHaveBeenCalled();
  });

  it("PATCH rejects invalid updatedAt precondition with 400", async () => {
    mockSignIn(mockAuth);

    const { PATCH } = await import("./route");
    const response = await PATCH(
      new Request("http://localhost/api/profile", {
        method: "PATCH",
        body: JSON.stringify({ ...validProfile, updatedAt: "not-a-date" }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      errors: ["updatedAt precondition is required."],
    });
    expect(athleteProfile.findUnique).not.toHaveBeenCalled();
  });

  it("PATCH rejects stale profile update with 409", async () => {
    mockSignIn(mockAuth);
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

  it("PATCH creates profile when no profile exists", async () => {
    mockSignIn(mockAuth);
    athleteProfile.findUnique.mockResolvedValue(null);
    athleteProfile.create.mockResolvedValue(dbProfile);

    const { PATCH } = await import("./route");
    const response = await PATCH(
      new Request("http://localhost/api/profile", {
        method: "PATCH",
        body: JSON.stringify(validProfile),
      }),
    );

    expect(response.status).toBe(200);
    expect(athleteProfile.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        ftp: validProfile.ftp,
      }),
    });
    await expect(response.json()).resolves.toMatchObject({
      id: validProfile.id,
      ftp: validProfile.ftp,
      updatedAt: "2026-07-02T00:00:00.000Z",
    });
  });

  it("PATCH catches create-race P2002 and returns 409", async () => {
    mockSignIn(mockAuth);
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

  it("PATCH rejects malformed profile payload with 400", async () => {
    mockSignIn(mockAuth);

    const { PATCH } = await import("./route");
    const response = await PATCH(
      new Request("http://localhost/api/profile", {
        method: "PATCH",
        body: JSON.stringify({ ...validProfile, ftp: 0 }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      errors: ["ftp must be at least 1."],
    });
    expect(athleteProfile.findUnique).not.toHaveBeenCalled();
  });
});
