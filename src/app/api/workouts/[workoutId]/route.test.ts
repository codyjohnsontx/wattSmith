import { Prisma, type StructuredWorkout } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { auth } from "@/auth";
import { db } from "@/lib/server/db";
import { structuredWorkoutToWorkout } from "@/lib/training/workouts";
import { defaultWorkout } from "@/lib/workout/defaultWorkout";
import { mockSignIn } from "../../testUtils";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/server/db", () => ({
  db: {
    structuredWorkout: {
      delete: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

const mockAuth = auth as unknown as {
  mockResolvedValue: (value: unknown) => void;
};
const structuredWorkout = db.structuredWorkout as unknown as {
  delete: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

function dbWorkout(overrides: Partial<StructuredWorkout> = {}): StructuredWorkout {
  return {
    id: "workout-1",
    userId: "user-1",
    name: "Threshold Builder",
    description: "A focused threshold workout.",
    category: "threshold",
    favorite: false,
    ftp: 250,
    blocksJson: defaultWorkout.blocks as unknown as Prisma.JsonValue,
    cuesJson: (defaultWorkout.cues ?? []) as unknown as Prisma.JsonValue,
    rationaleJson: (defaultWorkout.rationale ?? null) as unknown as Prisma.JsonValue,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-02T00:00:00.000Z"),
    ...overrides,
  };
}

function context(workoutId = "workout-1") {
  return {
    params: Promise.resolve({ workoutId }),
  };
}

function patchRequest(body: unknown) {
  return new Request("http://localhost/api/workouts/workout-1", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

describe("single workout API route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(null);
  });

  it("GET returns 404 when findFirst by id and userId finds nothing", async () => {
    mockSignIn(mockAuth);
    structuredWorkout.findFirst.mockResolvedValue(null);

    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/workouts/workout-1"), context());

    expect(response.status).toBe(404);
    expect(structuredWorkout.findFirst).toHaveBeenCalledWith({
      where: { id: "workout-1", userId: "user-1" },
    });
    await expect(response.json()).resolves.toEqual({ error: "Workout not found" });
  });

  it("GET returns the owned workout DTO when found", async () => {
    mockSignIn(mockAuth);
    const record = dbWorkout();
    structuredWorkout.findFirst.mockResolvedValue(record);

    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/workouts/workout-1"), context());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(structuredWorkoutToWorkout(record));
  });

  it("PATCH returns 404 for missing or not-owned workout", async () => {
    mockSignIn(mockAuth);
    structuredWorkout.findFirst.mockResolvedValue(null);

    const { PATCH } = await import("./route");
    const response = await PATCH(patchRequest({ name: "Updated" }), context());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Workout not found" });
    expect(structuredWorkout.update).not.toHaveBeenCalled();
  });

  it("PATCH merges partial payload over existing workout and updates only owned record", async () => {
    mockSignIn(mockAuth);
    const existing = dbWorkout();
    const updated = dbWorkout({
      name: "Updated Threshold Builder",
      favorite: true,
      updatedAt: new Date("2026-07-03T00:00:00.000Z"),
    });
    structuredWorkout.findFirst.mockResolvedValue(existing);
    structuredWorkout.update.mockResolvedValue(updated);

    const { PATCH } = await import("./route");
    const response = await PATCH(patchRequest({ name: updated.name, favorite: true }), context());

    expect(response.status).toBe(200);
    expect(structuredWorkout.findFirst).toHaveBeenCalledWith({
      where: { id: "workout-1", userId: "user-1" },
    });
    expect(structuredWorkout.update).toHaveBeenCalledWith({
      where: { id: existing.id },
      data: expect.objectContaining({
        id: "workout-1",
        name: updated.name,
        favorite: true,
        ftp: existing.ftp,
      }),
    });
    await expect(response.json()).resolves.toEqual(structuredWorkoutToWorkout(updated));
  });

  it("PATCH rejects malformed merged workout with 400", async () => {
    mockSignIn(mockAuth);
    structuredWorkout.findFirst.mockResolvedValue(dbWorkout());

    const { PATCH } = await import("./route");
    const response = await PATCH(patchRequest({ blocks: [] }), context());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      errors: ["Workout needs at least one block."],
    });
    expect(structuredWorkout.update).not.toHaveBeenCalled();
  });

  it("DELETE returns 404 for missing or not-owned workout", async () => {
    mockSignIn(mockAuth);
    structuredWorkout.findFirst.mockResolvedValue(null);

    const { DELETE } = await import("./route");
    const response = await DELETE(new Request("http://localhost/api/workouts/workout-1"), context());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Workout not found" });
    expect(structuredWorkout.delete).not.toHaveBeenCalled();
  });

  it("DELETE deletes owned workout and returns 204", async () => {
    mockSignIn(mockAuth);
    structuredWorkout.findFirst.mockResolvedValue(dbWorkout());
    structuredWorkout.delete.mockResolvedValue(dbWorkout());

    const { DELETE } = await import("./route");
    const response = await DELETE(new Request("http://localhost/api/workouts/workout-1"), context());

    expect(response.status).toBe(204);
    expect(structuredWorkout.delete).toHaveBeenCalledWith({
      where: { id: "workout-1" },
    });
    expect(await response.text()).toBe("");
  });
});
