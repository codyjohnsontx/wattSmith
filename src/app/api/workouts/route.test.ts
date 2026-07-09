import { Prisma, type StructuredWorkout } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { auth } from "@/auth";
import { db } from "@/lib/server/db";
import { structuredWorkoutToWorkout } from "@/lib/training/workouts";
import { defaultWorkout } from "@/lib/workout/defaultWorkout";
import { mockSignIn } from "../testUtils";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/server/db", () => ({
  db: {
    structuredWorkout: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

const mockAuth = auth as unknown as {
  mockResolvedValue: (value: unknown) => void;
};
const structuredWorkout = db.structuredWorkout as unknown as {
  create: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

const validWorkout = {
  ...defaultWorkout,
  id: "workout-1",
  name: "Threshold Builder",
  description: "A focused threshold workout.",
  ftp: 250,
  favorite: true,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-02T00:00:00.000Z",
};

function dbWorkout(overrides: Partial<StructuredWorkout> = {}): StructuredWorkout {
  return {
    id: "workout-1",
    userId: "user-1",
    name: "Threshold Builder",
    description: "A focused threshold workout.",
    category: "threshold",
    favorite: true,
    ftp: 250,
    blocksJson: defaultWorkout.blocks as unknown as Prisma.JsonValue,
    cuesJson: (defaultWorkout.cues ?? []) as unknown as Prisma.JsonValue,
    rationaleJson: (defaultWorkout.rationale ?? null) as unknown as Prisma.JsonValue,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-02T00:00:00.000Z"),
    ...overrides,
  };
}

function postRequest(body: unknown) {
  return new Request("http://localhost/api/workouts", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("workouts collection API route", () => {
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

  it("GET queries only the current user and returns mapped workouts", async () => {
    mockSignIn(mockAuth);
    const records = [dbWorkout(), dbWorkout({ id: "workout-2", name: "VO2 Builder" })];
    structuredWorkout.findMany.mockResolvedValue(records);

    const { GET } = await import("./route");
    const response = await GET();

    expect(response.status).toBe(200);
    expect(structuredWorkout.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: [{ favorite: "desc" }, { updatedAt: "desc" }],
    });
    await expect(response.json()).resolves.toEqual(records.map(structuredWorkoutToWorkout));
  });

  it("POST rejects malformed workout payload with 400", async () => {
    mockSignIn(mockAuth);

    const { POST } = await import("./route");
    const response = await POST(postRequest({ ...validWorkout, ftp: 0 }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      errors: ["FTP must be greater than zero."],
    });
    expect(structuredWorkout.findUnique).not.toHaveBeenCalled();
  });

  it("POST creates a new owned workout with status 201", async () => {
    mockSignIn(mockAuth);
    const created = dbWorkout();
    structuredWorkout.findUnique.mockResolvedValue(null);
    structuredWorkout.create.mockResolvedValue(created);

    const { POST } = await import("./route");
    const response = await POST(postRequest(validWorkout));

    expect(response.status).toBe(201);
    expect(structuredWorkout.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: validWorkout.id,
        userId: "user-1",
        ftp: validWorkout.ftp,
      }),
    });
    await expect(response.json()).resolves.toEqual(structuredWorkoutToWorkout(created));
  });

  it("POST updates an existing workout owned by current user with status 200", async () => {
    mockSignIn(mockAuth);
    const existing = dbWorkout();
    const updated = dbWorkout({ name: "Updated Threshold Builder" });
    structuredWorkout.findUnique.mockResolvedValue(existing);
    structuredWorkout.update.mockResolvedValue(updated);

    const { POST } = await import("./route");
    const response = await POST(postRequest({ ...validWorkout, name: updated.name }));

    expect(response.status).toBe(200);
    expect(structuredWorkout.update).toHaveBeenCalledWith({
      where: { id: existing.id },
      data: expect.objectContaining({
        id: validWorkout.id,
        name: updated.name,
        ftp: validWorkout.ftp,
      }),
    });
    await expect(response.json()).resolves.toEqual(structuredWorkoutToWorkout(updated));
  });

  it("POST returns 409 when the workout ID belongs to another user", async () => {
    mockSignIn(mockAuth);
    structuredWorkout.findUnique.mockResolvedValue(dbWorkout({ userId: "user-2" }));

    const { POST } = await import("./route");
    const response = await POST(postRequest(validWorkout));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "Workout id is already in use." });
    expect(structuredWorkout.create).not.toHaveBeenCalled();
    expect(structuredWorkout.update).not.toHaveBeenCalled();
  });

  it("POST catches Prisma P2002 and returns 409", async () => {
    mockSignIn(mockAuth);
    structuredWorkout.findUnique.mockResolvedValue(null);
    structuredWorkout.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
        meta: { target: ["id"] },
      }),
    );

    const { POST } = await import("./route");
    const response = await POST(postRequest(validWorkout));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "Workout id is already in use." });
  });
});
