import { safeFileName } from "@/lib/workout/exportMrc";

// wattsmith_<workout>_<yyyy-mm-dd>.fit, dated in the rider's local time.
export function rideFitFileName(workoutName: string, startMs: number, utcOffsetMinutes: number): string {
  const workout = safeFileName(workoutName).toLowerCase() || "ride";
  const date = new Date(startMs + utcOffsetMinutes * 60_000).toISOString().slice(0, 10);
  return `wattsmith_${workout}_${date}.fit`;
}
