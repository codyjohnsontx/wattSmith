import { authenticationErrorResponse, requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import {
  dbProfileToAthleteProfile,
  defaultProfileDbInput,
  profileToDbInput,
  validateProfilePayload,
} from "@/lib/training/profile";

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
    const result = validateProfilePayload(payload);

    if (!result.success) {
      return Response.json({ errors: result.errors }, { status: 400 });
    }

    const profile = await db.athleteProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        ...profileToDbInput(result.profile),
      },
      update: profileToDbInput(result.profile),
    });

    return Response.json(dbProfileToAthleteProfile(profile));
  } catch (error) {
    const response = authenticationErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
