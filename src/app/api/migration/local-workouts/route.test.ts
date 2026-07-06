import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { auth } from "@/auth";
import { db } from "@/lib/server/db";
import { defaultWorkout } from "@/lib/workout/defaultWorkout";
import { defaultProfile } from "@/lib/workout/storage";
import type { Workout } from "@/lib/workout/types";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

const tx = {
  athleteProfile: {
    upsert: vi.fn(),
  },
  structuredWorkout: {
    create: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
};

vi.mock("@/lib/server/db", () => ({
  db: {
    $transaction: vi.fn(),
    athleteProfile: {
      upsert: vi.fn(),
    },
  },
}));

const mockAuth = auth as unknown as {
  mockResolvedValue: (value: unknown) => void;
};
const transaction = db.$transaction as unknown as ReturnType<typeof vi.fn>;
const athleteProfile = db.athleteProfile as unknown as {
  upsert: ReturnType<typeof vi.fn>;
};

function signIn() {
  mockAuth.mockResolvedValue({
    user: {
      id: "user-1",
      name: null,
      email: null,
      image: null,
    },
  });
}

function workout(overrides: Partial<Workout> = {}): Workout {
  return {
    ...defaultWorkout,
    id: "workout-1",
    name: "Threshold Builder",
    description: "A focused threshold workout.",
    ftp: 250,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-02T00:00:00.000Z",
    ...overrides,
  };
}

function postRequest(body: unknown) {
  return new Request("http://localhost/api/migration/local-workouts", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("local workout migration API route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(null);
    tx.structuredWorkout.findMany.mockResolvedValue([]);
    tx.structuredWorkout.create.mockResolvedValue({});
    tx.structuredWorkout.update.mockResolvedValue({});
    tx.athleteProfile.upsert.mockResolvedValue({});
    athleteProfile.upsert.mockResolvedValue({});
    transaction.mockImplementation(async (callback) => callback(tx));
  });

  it("unauthenticated request returns 401", async () => {
    const { POST } = await import("./route");
    const response = await POST(postRequest({ workouts: [] }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Authentication required" });
  });

  it("malformed payload returns 400", async () => {
    signIn();

    const { POST } = await import("./route");
    const response = await POST(postRequest({ workouts: "not-workouts" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ errors: ["workouts must be an array."] });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("more than 100 workouts returns 413 before opening a transaction", async () => {
    signIn();
    const workouts = Array.from({ length: 101 }, (_, index) =>
      workout({ id: `workout-${index}`, name: `Workout ${index}` }),
    );

    const { POST } = await import("./route");
    const response = await POST(postRequest({ workouts }));

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      errors: ["Migration import is limited to 100 workouts per request."],
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("valid payload upserts profile and imports workouts inside $transaction", async () => {
    signIn();
    const incomingWorkout = workout();

    const { POST } = await import("./route");
    const response = await POST(
      postRequest({
        profile: defaultProfile,
        workouts: [incomingWorkout],
      }),
    );

    expect(response.status).toBe(200);
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 5_000,
      timeout: 15_000,
    });
    expect(tx.athleteProfile.upsert).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      create: expect.objectContaining({ userId: "user-1", ftp: defaultProfile.ftp }),
      update: expect.objectContaining({ ftp: defaultProfile.ftp }),
    });
    expect(tx.structuredWorkout.findMany).toHaveBeenCalledWith({
      where: { id: { in: [incomingWorkout.id] } },
      select: { id: true, userId: true },
    });
    expect(tx.structuredWorkout.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: incomingWorkout.id,
        userId: "user-1",
        ftp: incomingWorkout.ftp,
      }),
    });
    await expect(response.json()).resolves.toEqual({
      importedProfile: true,
      importedWorkouts: 1,
    });
  });

  it("existing workout owned by current user is updated", async () => {
    signIn();
    const incomingWorkout = workout();
    tx.structuredWorkout.findMany.mockResolvedValue([{ id: incomingWorkout.id, userId: "user-1" }]);

    const { POST } = await import("./route");
    const response = await POST(postRequest({ workouts: [incomingWorkout] }));

    expect(response.status).toBe(200);
    expect(tx.structuredWorkout.update).toHaveBeenCalledWith({
      where: { id: incomingWorkout.id },
      data: expect.objectContaining({
        id: incomingWorkout.id,
        name: incomingWorkout.name,
      }),
    });
    expect(tx.structuredWorkout.create).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      importedProfile: false,
      importedWorkouts: 1,
    });
  });

  it("existing workout ID owned by another user creates with a generated replacement ID", async () => {
    signIn();
    const incomingWorkout = workout();
    tx.structuredWorkout.findMany.mockResolvedValue([{ id: incomingWorkout.id, userId: "user-2" }]);

    const { POST } = await import("./route");
    const response = await POST(postRequest({ workouts: [incomingWorkout] }));

    expect(response.status).toBe(200);
    expect(tx.structuredWorkout.update).not.toHaveBeenCalled();
    expect(tx.structuredWorkout.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        ftp: incomingWorkout.ftp,
      }),
    });
    const createCall = tx.structuredWorkout.create.mock.calls[0][0];
    expect(createCall.data.id).toMatch(/^workout-/);
    expect(createCall.data.id).not.toBe(incomingWorkout.id);
  });

  it("Prisma P2002 from import returns 409", async () => {
    signIn();
    transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
        meta: { target: ["id"] },
      }),
    );

    const { POST } = await import("./route");
    const response = await POST(postRequest({ workouts: [workout()] }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "A workout id collided during import. Retry the import.",
    });
    expect(athleteProfile.upsert).not.toHaveBeenCalled();
  });

  it("if P2002 happens and profile was included, fallback profile upsert is attempted", async () => {
    signIn();
    transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
        meta: { target: ["id"] },
      }),
    );

    const { POST } = await import("./route");
    const response = await POST(postRequest({ profile: defaultProfile, workouts: [workout()] }));

    expect(response.status).toBe(409);
    expect(athleteProfile.upsert).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      create: expect.objectContaining({ userId: "user-1", ftp: defaultProfile.ftp }),
      update: expect.objectContaining({ ftp: defaultProfile.ftp }),
    });
    await expect(response.json()).resolves.toEqual({
      error: "A workout id collided during import. Retry the import.",
    });
  });
});
