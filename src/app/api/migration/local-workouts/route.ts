import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { authenticationErrorResponse, requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { profileToDbInput } from "@/lib/training/profile";
import { validateLocalMigrationPayload } from "@/lib/training/localMigration";
import { workoutToStructuredInput } from "@/lib/training/workouts";
import type { AthleteProfile } from "@/lib/workout/types";

const maxLocalMigrationWorkouts = 100;

async function upsertMigrationProfile(userId: string, profile: AthleteProfile) {
  await db.athleteProfile.upsert({
    where: { userId },
    create: {
      userId,
      ...profileToDbInput(profile),
    },
    update: profileToDbInput(profile),
  });
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const payload = await request.json().catch(() => undefined);
    const result = validateLocalMigrationPayload(payload);

    if (!result.success) {
      return Response.json({ errors: result.errors }, { status: 400 });
    }

    if (result.workouts.length > maxLocalMigrationWorkouts) {
      return Response.json(
        { errors: [`Migration import is limited to ${maxLocalMigrationWorkouts} workouts per request.`] },
        { status: 413 },
      );
    }

    let importedWorkouts = 0;
    try {
      importedWorkouts = await db.$transaction(async (tx) => {
        if (result.profile) {
          await tx.athleteProfile.upsert({
            where: { userId: user.id },
            create: {
              userId: user.id,
              ...profileToDbInput(result.profile),
            },
            update: profileToDbInput(result.profile),
          });
        }

        let count = 0;
        for (const workout of result.workouts) {
          const input = workoutToStructuredInput(workout);
          const existing = await tx.structuredWorkout.findUnique({
            where: { id: workout.id },
          });

          if (existing?.userId === user.id) {
            await tx.structuredWorkout.update({
              where: { id: existing.id },
              data: input,
            });
          } else {
            await tx.structuredWorkout.create({
              data: {
                ...input,
                id: existing ? `workout-${randomUUID()}` : input.id,
                userId: user.id,
              },
            });
          }

          count += 1;
        }

        return count;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        if (result.profile) {
          await upsertMigrationProfile(user.id, result.profile);
        }

        return Response.json({ error: "A workout id collided during import. Retry the import." }, { status: 409 });
      }

      throw error;
    }

    return Response.json({
      importedProfile: Boolean(result.profile),
      importedWorkouts,
    });
  } catch (error) {
    const response = authenticationErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
