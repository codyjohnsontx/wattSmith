import { authenticationErrorResponse, requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { structuredWorkoutToWorkout, validateWorkoutPayload, workoutToStructuredInput } from "@/lib/training/workouts";

export async function GET() {
  try {
    const user = await requireUser();
    const workouts = await db.structuredWorkout.findMany({
      where: { userId: user.id },
      orderBy: [{ favorite: "desc" }, { updatedAt: "desc" }],
    });

    return Response.json(workouts.map(structuredWorkoutToWorkout));
  } catch (error) {
    const response = authenticationErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const payload = await request.json().catch(() => undefined);
    const result = validateWorkoutPayload(payload);

    if (!result.success) {
      return Response.json({ errors: result.errors }, { status: 400 });
    }

    const input = workoutToStructuredInput(result.workout);
    const existing = await db.structuredWorkout.findFirst({
      where: { id: result.workout.id, userId: user.id },
    });

    const workout = existing
      ? await db.structuredWorkout.update({
          where: { id: existing.id },
          data: input,
        })
      : await db.structuredWorkout.create({
          data: {
            ...input,
            userId: user.id,
          },
        });

    return Response.json(structuredWorkoutToWorkout(workout), { status: existing ? 200 : 201 });
  } catch (error) {
    const response = authenticationErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
