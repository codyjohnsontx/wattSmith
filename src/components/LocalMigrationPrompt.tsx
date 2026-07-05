"use client";

import { PROFILE_STORAGE_KEY, loadProfile, loadWorkouts } from "@/lib/workout/storage";
import { useEffect, useState } from "react";

const migrationMarkerKey = "wattsmith.localMigration.v1";

interface LocalMigrationState {
  visible: boolean;
  workoutCount: number;
  hasProfile: boolean;
}

export function LocalMigrationPrompt() {
  const [localState, setLocalState] = useState<LocalMigrationState>({
    visible: false,
    workoutCount: 0,
    hasProfile: false,
  });
  const [status, setStatus] = useState<"idle" | "importing" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if (window.localStorage.getItem(migrationMarkerKey) === "complete") return;

      const localWorkouts = loadWorkouts();
      const localProfileExists = window.localStorage.getItem(PROFILE_STORAGE_KEY) !== null;

      setLocalState({
        visible: localProfileExists || localWorkouts.length > 0,
        workoutCount: localWorkouts.length,
        hasProfile: localProfileExists,
      });
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  if (!localState.visible) return null;

  const markComplete = () => {
    window.localStorage.setItem(migrationMarkerKey, "complete");
    setLocalState((current) => ({ ...current, visible: false }));
  };

  const importLocalData = async () => {
    setStatus("importing");
    setMessage("");

    const response = await fetch("/api/migration/local-workouts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profile: localState.hasProfile ? loadProfile() : undefined,
        workouts: loadWorkouts(),
      }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => undefined);
      setStatus("error");
      setMessage(payload?.errors?.join(" ") ?? payload?.error ?? "Import failed.");
      return;
    }

    const result = (await response.json()) as { importedWorkouts: number; importedProfile: boolean };
    window.localStorage.setItem(migrationMarkerKey, "complete");
    setStatus("done");
    setMessage(
      `Imported ${result.importedWorkouts} workout${result.importedWorkouts === 1 ? "" : "s"}${
        result.importedProfile ? " and profile settings" : ""
      }.`,
    );
    window.setTimeout(() => window.location.reload(), 700);
  };

  return (
    <section className="border border-cyan-300/30 bg-cyan-300/10 p-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-200">
            Local data found
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Import {localState.workoutCount} browser-saved workout
            {localState.workoutCount === 1 ? "" : "s"}
            {localState.hasProfile ? " and the local profile" : ""} into this account.
          </p>
          {message ? (
            <p className={`mt-2 text-sm ${status === "error" ? "text-red-200" : "text-cyan-100"}`}>
              {message}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void importLocalData()}
            disabled={status === "importing" || status === "done"}
            className="bg-cyan-300 px-3 py-2 text-xs font-semibold text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
          >
            {status === "importing" ? "Importing" : "Import"}
          </button>
          <button
            type="button"
            onClick={markComplete}
            disabled={status === "importing"}
            className="border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Skip
          </button>
        </div>
      </div>
    </section>
  );
}
