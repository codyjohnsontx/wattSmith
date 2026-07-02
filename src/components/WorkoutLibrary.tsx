import {
  difficultyLabels,
  workoutDifficulties,
  type WorkoutDifficulty,
} from "@/lib/workout/difficulty";
import { duplicateWorkout } from "@/lib/workout/editor";
import {
  decorateWorkouts,
  filterLibraryEntries,
  sortLibraryEntries,
  sortOrderLabels,
  workoutSortOrders,
  type LibraryWorkoutEntry,
  type WorkoutSortOrder,
} from "@/lib/workout/library";
import { formatDuration, formatRelativeTime } from "@/lib/workout/math";
import { cloneTemplateWorkout, workoutCategories, workoutTemplates } from "@/lib/workout/templates";
import type { AthleteProfile, Workout, WorkoutCategory, WorkoutTemplate } from "@/lib/workout/types";
import { useMemo, useState } from "react";
import { TemplatePreviewModal } from "./TemplatePreviewModal";

interface WorkoutLibraryProps {
  workouts: Workout[];
  activeFtp: number;
  profile: AthleteProfile;
  onLoad: (workout: Workout) => void;
  onSaveWorkout: (workout: Workout) => void;
  onDeleteWorkout: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onCreateNew?: () => void;
}

function categoryLabel(category?: WorkoutCategory) {
  return category ? category.replace("-", " ") : "uncategorized";
}

function WorkoutRow({
  entry,
  onLoad,
  onDuplicate,
  onDelete,
  onRename,
  onToggleFavorite,
}: {
  entry: LibraryWorkoutEntry;
  onLoad: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onRename: (name: string) => void;
  onToggleFavorite: () => void;
}) {
  const { workout, summary, difficulty } = entry;
  const isFavorite = workout.favorite === true;

  return (
    <article className="grid gap-3 rounded-lg border border-slate-800 bg-slate-950/70 p-4 lg:grid-cols-[1fr_auto] lg:items-center">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onToggleFavorite}
            aria-pressed={isFavorite}
            aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
            className={`text-lg leading-none transition ${
              isFavorite ? "text-amber-300" : "text-slate-600 hover:text-slate-300"
            }`}
          >
            {isFavorite ? "★" : "☆"}
          </button>
          <input
            value={workout.name}
            onChange={(event) => onRename(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-base font-semibold text-slate-50 outline-none"
            aria-label="Rename saved workout"
          />
          <span className="rounded-full bg-slate-800 px-2.5 py-1 text-xs capitalize text-slate-300">
            {categoryLabel(workout.category)}
          </span>
          <span className="rounded-full bg-slate-800 px-2.5 py-1 text-xs text-slate-300">
            {difficultyLabels[difficulty]}
          </span>
        </div>
        <p className="mt-1 text-sm leading-6 text-slate-400">{workout.description}</p>
        <p className="mt-2 text-xs uppercase tracking-[0.16em] text-slate-500">
          {formatDuration(summary.totalDurationSeconds)} · avg {summary.averageWatts}W · high{" "}
          {summary.highestWatts}W · {summary.dominantZone.label} · Edited{" "}
          {formatRelativeTime(workout.updatedAt)}
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
  profile,
  onLoad,
  onSaveWorkout,
  onDeleteWorkout,
  onToggleFavorite,
  onCreateNew,
}: WorkoutLibraryProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"all" | WorkoutCategory>("all");
  const [difficulty, setDifficulty] = useState<"all" | WorkoutDifficulty>("all");
  const [sortOrder, setSortOrder] = useState<WorkoutSortOrder>("recent");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<WorkoutTemplate | undefined>();

  const decoratedWorkouts = useMemo(() => decorateWorkouts(workouts), [workouts]);
  const visibleWorkouts = useMemo(
    () =>
      sortLibraryEntries(
        filterLibraryEntries(decoratedWorkouts, { query, category, difficulty, favoritesOnly }),
        sortOrder,
      ),
    [decoratedWorkouts, query, category, difficulty, favoritesOnly, sortOrder],
  );

  const templateEntries = useMemo(
    () =>
      workoutTemplates.map((template) => ({
        template,
        entry: decorateWorkouts([{ ...template.defaultWorkout, ftp: activeFtp }])[0],
      })),
    [activeFtp],
  );
  const visibleTemplates = useMemo(
    () =>
      templateEntries.filter(({ template, entry }) => {
        const matchesQuery = `${template.name} ${template.description}`
          .toLowerCase()
          .includes(query.trim().toLowerCase());
        const matchesCategory = category === "all" || template.category === category;
        const matchesDifficulty = difficulty === "all" || entry.difficulty === difficulty;
        return matchesQuery && matchesCategory && matchesDifficulty;
      }),
    [templateEntries, query, category, difficulty],
  );

  const hasActiveFilters =
    query.trim().length > 0 || category !== "all" || difficulty !== "all" || favoritesOnly;

  const clearFilters = () => {
    setQuery("");
    setCategory("all");
    setDifficulty("all");
    setFavoritesOnly(false);
  };

  const previewWorkout = useMemo(() => {
    if (!previewTemplate) return undefined;

    return {
      ...structuredClone(previewTemplate.defaultWorkout),
      ftp: activeFtp,
      rationale: previewTemplate.rationale,
    };
  }, [previewTemplate, activeFtp]);

  const handleUseTemplate = (template: WorkoutTemplate) => {
    onLoad(cloneTemplateWorkout(template, activeFtp));
  };

  const clearFiltersButton = (
    <button
      type="button"
      onClick={clearFilters}
      className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:border-cyan-300"
    >
      Clear filters
    </button>
  );

  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
          Library
        </p>
        <h2 className="mt-1 text-xl font-semibold text-slate-50">Saved workouts and templates</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_180px_180px_190px_auto]">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search workouts"
            aria-label="Search workouts"
            className="h-11 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none transition focus:border-cyan-300"
          />
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as "all" | WorkoutCategory)}
            aria-label="Filter workouts by category"
            className="h-11 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm capitalize text-slate-100 outline-none transition focus:border-cyan-300"
          >
            <option value="all">All categories</option>
            {workoutCategories.map((item) => (
              <option key={item} value={item}>
                {categoryLabel(item)}
              </option>
            ))}
          </select>
          <select
            value={difficulty}
            onChange={(event) => setDifficulty(event.target.value as "all" | WorkoutDifficulty)}
            aria-label="Filter workouts by difficulty"
            className="h-11 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none transition focus:border-cyan-300"
          >
            <option value="all">All difficulties</option>
            {workoutDifficulties.map((item) => (
              <option key={item} value={item}>
                {difficultyLabels[item]}
              </option>
            ))}
          </select>
          <select
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value as WorkoutSortOrder)}
            aria-label="Sort saved workouts"
            className="h-11 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none transition focus:border-cyan-300"
          >
            {workoutSortOrders.map((item) => (
              <option key={item} value={item}>
                {sortOrderLabels[item]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setFavoritesOnly((current) => !current)}
            aria-pressed={favoritesOnly}
            className={`h-11 rounded-lg border px-4 text-sm font-semibold transition ${
              favoritesOnly
                ? "border-amber-300/60 bg-amber-300/10 text-amber-200"
                : "border-slate-700 bg-slate-950 text-slate-300 hover:border-cyan-300"
            }`}
          >
            ★ Favorites
          </button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
            Saved
          </h3>
          {visibleWorkouts.length > 0 ? (
            visibleWorkouts.map((entry) => (
              <WorkoutRow
                key={entry.workout.id}
                entry={entry}
                onLoad={() => onLoad(structuredClone(entry.workout))}
                onDuplicate={() => onSaveWorkout(duplicateWorkout(entry.workout))}
                onDelete={() => onDeleteWorkout(entry.workout.id)}
                onRename={(name) => onSaveWorkout({ ...entry.workout, name })}
                onToggleFavorite={() => onToggleFavorite(entry.workout.id)}
              />
            ))
          ) : workouts.length === 0 ? (
            <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-6 text-center">
              <p className="text-base font-semibold text-slate-100">No saved workouts yet</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Build a workout in the Builder and press Save, or start from a starter template on
                the right.
              </p>
              {onCreateNew ? (
                <button
                  type="button"
                  onClick={onCreateNew}
                  className="mt-4 rounded-lg bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
                >
                  Start a blank workout
                </button>
              ) : null}
            </div>
          ) : (
            <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-4">
              <p className="text-sm text-slate-400">No saved workouts match these filters.</p>
              {hasActiveFilters ? <div className="mt-3">{clearFiltersButton}</div> : null}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
            Starter templates
          </h3>
          {visibleTemplates.length === 0 ? (
            <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-4">
              <p className="text-sm text-slate-400">No templates match these filters.</p>
              {hasActiveFilters ? <div className="mt-3">{clearFiltersButton}</div> : null}
            </div>
          ) : null}
          {visibleTemplates.map(({ template, entry }) => (
            <article
              key={template.id}
              className="rounded-lg border border-slate-800 bg-slate-950/70 p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold text-slate-50">{template.name}</h3>
                <span className="rounded-full bg-slate-800 px-2.5 py-1 text-xs capitalize text-slate-300">
                  {categoryLabel(template.category)}
                </span>
                <span className="rounded-full bg-slate-800 px-2.5 py-1 text-xs text-slate-300">
                  {difficultyLabels[entry.difficulty]}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-400">{template.description}</p>
              <p className="mt-2 text-xs uppercase tracking-[0.16em] text-slate-500">
                {formatDuration(entry.summary.totalDurationSeconds)} · avg{" "}
                {entry.summary.averageWatts}W · high {entry.summary.highestWatts}W
              </p>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                {template.rationale.summary}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setPreviewTemplate(template)}
                  className="rounded-lg bg-cyan-300 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-cyan-200"
                >
                  Preview
                </button>
                <button
                  type="button"
                  onClick={() => handleUseTemplate(template)}
                  className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:border-cyan-300"
                >
                  Use template
                </button>
              </div>
            </article>
          ))}
        </section>
      </div>

      {previewTemplate && previewWorkout ? (
        <TemplatePreviewModal
          template={previewTemplate}
          workout={previewWorkout}
          profile={profile}
          onClose={() => setPreviewTemplate(undefined)}
          onUseTemplate={() => {
            handleUseTemplate(previewTemplate);
            setPreviewTemplate(undefined);
          }}
        />
      ) : null}
    </section>
  );
}
