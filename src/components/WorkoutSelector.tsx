import type { Workout } from "@/lib/workout/types";

interface WorkoutSelectorProps {
  workouts: Workout[];
  activeWorkout: Workout;
  onLoad: (workout: Workout) => void;
}

export function WorkoutSelector({ workouts, activeWorkout, onLoad }: WorkoutSelectorProps) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
        Saved Workouts
      </span>
      <select
        className="mt-2 h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none transition focus:border-cyan-300"
        value={activeWorkout.id}
        onChange={(event) => {
          const selected = workouts.find((workout) => workout.id === event.target.value);
          if (selected) {
            onLoad(structuredClone(selected));
          }
        }}
      >
        <option value={activeWorkout.id}>{activeWorkout.name} current</option>
        {workouts
          .filter((workout) => workout.id !== activeWorkout.id)
          .map((workout) => (
            <option key={workout.id} value={workout.id}>
              {workout.name}
            </option>
          ))}
      </select>
    </label>
  );
}
