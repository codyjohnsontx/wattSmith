import type { AthleteProfile as DbAthleteProfile } from "@prisma/client";
import { authenticationErrorResponse, requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import {
  dbProfileToAthleteProfile,
  defaultProfileDbInput,
  profileToDbInput,
  validateProfilePayload,
} from "@/lib/training/profile";

function profilePreconditionDate(payload: unknown) {
  if (typeof payload !== "object" || payload === null || !("updatedAt" in payload)) {
    return undefined;
  }

  const updatedAt = (payload as { updatedAt?: unknown }).updatedAt;
  if (typeof updatedAt !== "string") {
    return undefined;
  }

  const date = new Date(updatedAt);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export async function GET() {
  try {
    const user = await requireUser();
    const profile = await db.athleteProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        ...defaultProfileDbInput(),
      },
      update: {},
    });

    return Response.json(dbProfileToAthleteProfile(profile));
  } catch (error) {
    const response = authenticationErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const payload = await request.json().catch(() => undefined);
    const expectedUpdatedAt = profilePreconditionDate(payload);

    if (!expectedUpdatedAt) {
      return Response.json({ errors: ["updatedAt precondition is required."] }, { status: 400 });
    }

    const result = validateProfilePayload(payload);

    if (!result.success) {
      return Response.json({ errors: result.errors }, { status: 400 });
    }

    const existingProfile = await db.athleteProfile.findUnique({
      where: { userId: user.id },
      select: { updatedAt: true },
    });

    let profile: DbAthleteProfile;
    if (existingProfile) {
      const updateResult = await db.athleteProfile.updateMany({
        where: {
          userId: user.id,
          updatedAt: expectedUpdatedAt,
        },
        data: profileToDbInput(result.profile),
      });

      if (updateResult.count === 0) {
        return Response.json(
          { error: "Profile has changed since this edit started. Refresh and try again." },
          { status: 409 },
        );
      }

      profile = await db.athleteProfile.findUniqueOrThrow({
        where: { userId: user.id },
      });
    } else {
      profile = await db.athleteProfile.create({
        data: {
          userId: user.id,
          ...profileToDbInput(result.profile),
        },
      });
    }

    return Response.json(dbProfileToAthleteProfile(profile));
  } catch (error) {
    const response = authenticationErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
