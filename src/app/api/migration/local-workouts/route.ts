import { authenticationErrorResponse, requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { profileToDbInput } from "@/lib/training/profile";
import { validateLocalMigrationPayload } from "@/lib/training/localMigration";
import { workoutToStructuredInput } from "@/lib/training/workouts";

const maxLocalMigrationWorkouts = 100;

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

    const importedWorkouts = await db.$transaction(async (tx) => {
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
        const existing = await tx.structuredWorkout.findFirst({
          where: { id: workout.id, userId: user.id },
        });

        if (existing) {
          await tx.structuredWorkout.update({
            where: { id: existing.id },
            data: input,
          });
        } else {
          await tx.structuredWorkout.create({
            data: {
              ...input,
              userId: user.id,
            },
          });
        }

        count += 1;
      }

      return count;
    });

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
