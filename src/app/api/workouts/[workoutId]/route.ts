import { authenticationErrorResponse, requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { structuredWorkoutToWorkout, validateWorkoutPayload, workoutToStructuredInput } from "@/lib/training/workouts";

interface RouteContext {
  params: Promise<{
    workoutId: string;
  }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { workoutId } = await context.params;
    const workout = await db.structuredWorkout.findFirst({
      where: { id: workoutId, userId: user.id },
    });

    if (!workout) {
      return Response.json({ error: "Workout not found" }, { status: 404 });
    }

    return Response.json(structuredWorkoutToWorkout(workout));
  } catch (error) {
    const response = authenticationErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { workoutId } = await context.params;
    const existing = await db.structuredWorkout.findFirst({
      where: { id: workoutId, userId: user.id },
    });

    if (!existing) {
      return Response.json({ error: "Workout not found" }, { status: 404 });
    }

    const payload = await request.json().catch(() => undefined);
    const result = validateWorkoutPayload({ ...structuredWorkoutToWorkout(existing), ...payload, id: workoutId });

    if (!result.success) {
      return Response.json({ errors: result.errors }, { status: 400 });
    }

    const workout = await db.structuredWorkout.update({
      where: { id: existing.id },
      data: workoutToStructuredInput(result.workout),
    });

    return Response.json(structuredWorkoutToWorkout(workout));
  } catch (error) {
    const response = authenticationErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { workoutId } = await context.params;
    const existing = await db.structuredWorkout.findFirst({
      where: { id: workoutId, userId: user.id },
    });

    if (!existing) {
      return Response.json({ error: "Workout not found" }, { status: 404 });
    }

    await db.structuredWorkout.delete({
      where: { id: existing.id },
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    const response = authenticationErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
