"use client";

import { ExportPanel } from "@/components/ExportPanel";
import { WorkoutChart } from "@/components/WorkoutChart";
import { WorkoutEditor } from "@/components/WorkoutEditor";
import { WorkoutSelector } from "@/components/WorkoutSelector";
import { WorkoutSummary } from "@/components/WorkoutSummary";
import { cloneDefaultWorkout } from "@/lib/workout/defaultWorkout";
import { clampNumber, percentToWatts } from "@/lib/workout/math";
import { loadWorkouts, saveWorkout } from "@/lib/workout/storage";
import type { Workout } from "@/lib/workout/types";
import { useEffect, useMemo, useState } from "react";

export default function Home() {
  const [workout, setWorkout] = useState<Workout>(() => cloneDefaultWorkout());
  const [savedWorkouts, setSavedWorkouts] = useState<Workout[]>([]);
  const [savedMessage, setSavedMessage] = useState("");

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const storedWorkouts = loadWorkouts();
      setSavedWorkouts(storedWorkouts);

      if (storedWorkouts[0]) {
        setWorkout(storedWorkouts[0]);
      }
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  const ftpExamples = useMemo(
    () => [
      { label: "120%", watts: percentToWatts(workout.ftp, 120) },
      { label: "50%", watts: percentToWatts(workout.ftp, 50) },
      { label: "45%", watts: percentToWatts(workout.ftp, 45) },
    ],
    [workout.ftp],
  );

  const updateWorkout = (nextWorkout: Workout) => {
    setWorkout({
      ...nextWorkout,
      ftp: clampNumber(Math.round(nextWorkout.ftp), 1),
    });
  };

  const handleSave = () => {
    const timestamp = new Date().toISOString();
    const workoutToSave = {
      ...workout,
      id: workout.id || crypto.randomUUID(),
      createdAt: workout.createdAt || timestamp,
      updatedAt: timestamp,
    };
    const nextSavedWorkouts = saveWorkout(workoutToSave);
    setWorkout(workoutToSave);
    setSavedWorkouts(nextSavedWorkouts);
    setSavedMessage("Saved locally");
    window.setTimeout(() => setSavedMessage(""), 1800);
  };

  const handleReset = () => {
    setWorkout(cloneDefaultWorkout());
    setSavedMessage("Reset to starter workout");
    window.setTimeout(() => setSavedMessage(""), 1800);
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-slate-800 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300">
              Wattsmith
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-5xl">
              Build FTP-based bike workouts.
            </h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-slate-400">
              Forge reusable structured workouts from FTP percentages, preview the actual watts,
              and export files you can import into TrainerRoad Workout Creator.
            </p>
          </div>
          <div className="grid gap-2 rounded-xl border border-slate-800 bg-slate-900/80 p-4 sm:min-w-72">
            <label>
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Rider FTP
              </span>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  value={workout.ftp}
                  onChange={(event) =>
                    updateWorkout({
                      ...workout,
                      ftp: clampNumber(Number(event.target.value), 1),
                    })
                  }
                  className="h-12 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-lg font-semibold text-white outline-none transition focus:border-cyan-300"
                />
                <span className="text-sm font-semibold text-slate-400">watts</span>
              </div>
            </label>
            <div className="flex flex-wrap gap-2">
              {ftpExamples.map((item) => (
                <span
                  key={item.label}
                  className="rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-slate-300"
                >
                  {item.label} = {item.watts}W
                </span>
              ))}
            </div>
          </div>
        </header>

        <section className="grid gap-4 rounded-xl border border-slate-800 bg-slate-900/70 p-4 lg:grid-cols-[1fr_320px_auto_auto] lg:items-end">
          <WorkoutSelector
            workouts={savedWorkouts}
            activeWorkout={workout}
            onLoad={(selectedWorkout) => {
              setWorkout(selectedWorkout);
              setSavedMessage("Loaded saved workout");
              window.setTimeout(() => setSavedMessage(""), 1800);
            }}
          />
          <div className="text-sm text-slate-500">
            <span className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Status
            </span>
            <span className="mt-3 block h-5 text-slate-300">{savedMessage || "Ready"}</span>
          </div>
          <button
            type="button"
            onClick={handleSave}
            className="h-11 rounded-lg bg-cyan-300 px-5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
          >
            Save workout
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="h-11 rounded-lg border border-slate-700 px-5 text-sm font-semibold text-slate-100 transition hover:border-cyan-300"
          >
            Reset starter
          </button>
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(360px,0.9fr)_minmax(520px,1.5fr)_minmax(320px,0.8fr)]">
          <div className="xl:order-1">
            <WorkoutEditor workout={workout} onChange={updateWorkout} />
          </div>
          <div className="space-y-6 xl:order-2">
            <WorkoutChart workout={workout} />
            <ExportPanel workout={workout} />
          </div>
          <div className="xl:order-3">
            <WorkoutSummary workout={workout} />
          </div>
        </div>
      </div>
    </main>
  );
}
