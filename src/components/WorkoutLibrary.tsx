import { duplicateWorkout } from "@/lib/workout/editor";
import { formatDuration } from "@/lib/workout/math";
import { calculateWorkoutSummary } from "@/lib/workout/summary";
import { cloneTemplateWorkout, workoutCategories, workoutTemplates } from "@/lib/workout/templates";
import type { Workout, WorkoutCategory } from "@/lib/workout/types";
import { useMemo, useState } from "react";

interface WorkoutLibraryProps {
  workouts: Workout[];
  activeFtp: number;
  onLoad: (workout: Workout) => void;
  onSaveWorkout: (workout: Workout) => void;
  onDeleteWorkout: (id: string) => void;
}

function categoryLabel(category?: WorkoutCategory) {
  return category ? category.replace("-", " ") : "uncategorized";
}

function WorkoutRow({
  workout,
  onLoad,
  onDuplicate,
  onDelete,
  onRename,
}: {
  workout: Workout;
  onLoad: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onRename: (name: string) => void;
}) {
  const summary = calculateWorkoutSummary(workout);

  return (
    <article className="grid gap-3 rounded-lg border border-slate-800 bg-slate-950/70 p-4 lg:grid-cols-[1fr_auto] lg:items-center">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={workout.name}
            onChange={(event) => onRename(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-base font-semibold text-slate-50 outline-none"
            aria-label="Rename saved workout"
          />
          <span className="rounded-full bg-slate-800 px-2.5 py-1 text-xs capitalize text-slate-300">
            {categoryLabel(workout.category)}
          </span>
        </div>
        <p className="mt-1 text-sm leading-6 text-slate-400">{workout.description}</p>
        <p className="mt-2 text-xs uppercase tracking-[0.16em] text-slate-500">
          {formatDuration(summary.totalDurationSeconds)} · avg {summary.averageWatts}W · high{" "}
          {summary.highestWatts}W · {summary.dominantZone.label}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onLoad}
          className="rounded-lg bg-cyan-300 px-3 py-2 text-xs font-semibold text-slate-950"
        >
          Load
        </button>
        <button
          type="button"
          onClick={onDuplicate}
          className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-100"
        >
          Duplicate
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-lg border border-red-400/40 px-3 py-2 text-xs font-semibold text-red-200"
        >
          Delete
        </button>
      </div>
    </article>
  );
}

export function WorkoutLibrary({
  workouts,
  activeFtp,
  onLoad,
  onSaveWorkout,
  onDeleteWorkout,
}: WorkoutLibraryProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"all" | WorkoutCategory>("all");

  const filteredWorkouts = useMemo(
    () =>
      workouts.filter((workout) => {
        const matchesQuery = `${workout.name} ${workout.description}`
          .toLowerCase()
          .includes(query.toLowerCase());
        const matchesCategory = category === "all" || workout.category === category;
        return matchesQuery && matchesCategory;
      }),
    [workouts, query, category],
  );

  const filteredTemplates = useMemo(
    () =>
      workoutTemplates.filter((template) => {
        const matchesQuery = `${template.name} ${template.description}`
          .toLowerCase()
          .includes(query.toLowerCase());
        const matchesCategory = category === "all" || template.category === category;
        return matchesQuery && matchesCategory;
      }),
    [query, category],
  );

  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
          Library
        </p>
        <h2 className="mt-1 text-xl font-semibold text-slate-50">Saved workouts and templates</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_220px]">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search workouts"
            className="h-11 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none transition focus:border-cyan-300"
          />
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as "all" | WorkoutCategory)}
            className="h-11 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm capitalize text-slate-100 outline-none transition focus:border-cyan-300"
          >
            <option value="all">All categories</option>
            {workoutCategories.map((item) => (
              <option key={item} value={item}>
                {categoryLabel(item)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
            Saved
          </h3>
          {filteredWorkouts.length > 0 ? (
            filteredWorkouts.map((workout) => (
              <WorkoutRow
                key={workout.id}
                workout={workout}
                onLoad={() => onLoad(structuredClone(workout))}
                onDuplicate={() => onSaveWorkout(duplicateWorkout(workout))}
                onDelete={() => onDeleteWorkout(workout.id)}
                onRename={(name) => onSaveWorkout({ ...workout, name })}
              />
            ))
          ) : (
            <p className="rounded-lg border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-400">
              No saved workouts match this filter.
            </p>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
            Starter templates
          </h3>
          {filteredTemplates.map((template) => {
            const workout = { ...template.defaultWorkout, ftp: activeFtp };
            const summary = calculateWorkoutSummary(workout);
            return (
              <article
                key={template.id}
                className="rounded-lg border border-slate-800 bg-slate-950/70 p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-semibold text-slate-50">{template.name}</h3>
                  <span className="rounded-full bg-slate-800 px-2.5 py-1 text-xs capitalize text-slate-300">
                    {categoryLabel(template.category)}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-400">{template.description}</p>
                <p className="mt-2 text-xs uppercase tracking-[0.16em] text-slate-500">
                  {formatDuration(summary.totalDurationSeconds)} · avg {summary.averageWatts}W ·
                  high {summary.highestWatts}W
                </p>
                <p className="mt-3 text-sm leading-6 text-slate-300">
                  {template.rationale.summary}
                </p>
                <button
                  type="button"
                  onClick={() => onLoad(cloneTemplateWorkout(template, activeFtp))}
                  className="mt-4 rounded-lg bg-cyan-300 px-3 py-2 text-xs font-semibold text-slate-950"
                >
                  Use template
                </button>
              </article>
            );
          })}
        </section>
      </div>
    </section>
  );
}
