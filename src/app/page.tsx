"use client";

import { ExportPanel } from "@/components/ExportPanel";
import { getProfileWarnings, ProfilePanel } from "@/components/ProfilePanel";
import { WorkoutChart } from "@/components/WorkoutChart";
import { WorkoutEditor } from "@/components/WorkoutEditor";
import { WorkoutLibrary } from "@/components/WorkoutLibrary";
import { WorkoutSummary } from "@/components/WorkoutSummary";
import { cloneDefaultWorkout } from "@/lib/workout/defaultWorkout";
import { createBlockFromTemplate } from "@/lib/workout/editor";
import { clampNumber, createId, percentToWatts } from "@/lib/workout/math";
import {
  deleteWorkout,
  loadIntegrationConnections,
  loadProfile,
  loadWorkouts,
  saveProfile,
  saveWorkout,
} from "@/lib/workout/storage";
import type { AthleteProfile, IntegrationConnection, Workout } from "@/lib/workout/types";
import { useEffect, useMemo, useState } from "react";

type WorkspaceTab = "builder" | "library" | "profile" | "export";

const tabs: { id: WorkspaceTab; label: string }[] = [
  { id: "builder", label: "Builder" },
  { id: "library", label: "Library" },
  { id: "profile", label: "Profile" },
  { id: "export", label: "Export" },
];

function createBlankWorkout(ftp: number): Workout {
  const timestamp = new Date().toISOString();
  return {
    id: createId("workout"),
    name: "Untitled Workout",
    description: "A custom FTP-based workout.",
    category: "endurance",
    ftp,
    blocks: [createBlockFromTemplate("warmup-ramp"), createBlockFromTemplate("steady"), createBlockFromTemplate("cooldown-ramp")],
    cues: [],
    rationale: {
      summary:
        "Custom workout rationale can be refined as the workout target and structure become clearer.",
      sourceIds: ["coggan-power-zones"],
      cautions: ["Check duration, intensity, and recent fatigue before riding."],
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("builder");
  const [workout, setWorkout] = useState<Workout>(() => cloneDefaultWorkout());
  const [savedWorkouts, setSavedWorkouts] = useState<Workout[]>([]);
  const [profile, setProfile] = useState<AthleteProfile>(() => loadProfile());
  const [integrations, setIntegrations] = useState<IntegrationConnection[]>([]);
  const [selectedStepId, setSelectedStepId] = useState<string | undefined>("warmup");
  const [status, setStatus] = useState("Ready");

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const storedProfile = loadProfile();
      const storedWorkouts = loadWorkouts();
      setProfile(storedProfile);
      setSavedWorkouts(storedWorkouts);
      setIntegrations(loadIntegrationConnections());

      if (storedWorkouts[0]) {
        setWorkout(storedWorkouts[0]);
      } else {
        setWorkout({ ...cloneDefaultWorkout(), ftp: storedProfile.ftp });
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

  const profileWarnings = useMemo(() => getProfileWarnings(profile, workout), [profile, workout]);

  const flashStatus = (message: string) => {
    setStatus(message);
    window.setTimeout(() => setStatus("Ready"), 1800);
  };

  const updateWorkout = (nextWorkout: Workout) => {
    setWorkout({
      ...nextWorkout,
      ftp: clampNumber(Math.round(nextWorkout.ftp), 1),
    });
  };

  const handleSaveWorkout = (workoutToSave = workout) => {
    const timestamp = new Date().toISOString();
    const nextWorkout = {
      ...workoutToSave,
      id: workoutToSave.id || createId("workout"),
      createdAt: workoutToSave.createdAt || timestamp,
      updatedAt: timestamp,
    };
    const nextSavedWorkouts = saveWorkout(nextWorkout);
    setWorkout(nextWorkout);
    setSavedWorkouts(nextSavedWorkouts);
    flashStatus("Saved locally");
  };

  const handleDeleteWorkout = (id: string) => {
    const nextSavedWorkouts = deleteWorkout(id);
    setSavedWorkouts(nextSavedWorkouts);
    if (workout.id === id) {
      setWorkout(nextSavedWorkouts[0] ?? createBlankWorkout(profile.ftp));
    }
    flashStatus("Deleted workout");
  };

  const handleProfileChange = (nextProfile: AthleteProfile) => {
    const savedProfile = saveProfile(nextProfile);
    setProfile(savedProfile);
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex w-full max-w-[1520px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="border-b border-slate-800 pb-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300">
                Wattsmith
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-5xl">
                Manual workout forge.
              </h1>
              <p className="mt-3 max-w-3xl text-base leading-7 text-slate-400">
                Build percentage-based cycling workouts, inspect the load, cite the intent, and
                export files that match the chart.
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
          </div>

          <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <nav className="flex overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/80 p-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                    activeTab === tab.id
                      ? "bg-cyan-300 text-slate-950"
                      : "text-slate-400 hover:text-slate-100"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>

            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-2 text-sm text-slate-400">{status}</span>
              <button
                type="button"
                onClick={() => {
                  const nextWorkout = createBlankWorkout(profile.ftp);
                  setWorkout(nextWorkout);
                  setSelectedStepId(nextWorkout.blocks[0]?.id);
                  setActiveTab("builder");
                  flashStatus("Started blank workout");
                }}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-cyan-300"
              >
                New workout
              </button>
              <button
                type="button"
                onClick={() => handleSaveWorkout()}
                className="rounded-lg bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  const starter = { ...cloneDefaultWorkout(), ftp: profile.ftp };
                  setWorkout(starter);
                  setSelectedStepId(starter.blocks[0]?.id);
                  flashStatus("Reset to starter");
                }}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-cyan-300"
              >
                Reset starter
              </button>
            </div>
          </div>
        </header>

        {activeTab === "builder" ? (
          <div className="grid gap-6 xl:grid-cols-[minmax(390px,0.95fr)_minmax(520px,1.45fr)_minmax(330px,0.85fr)]">
            <WorkoutEditor
              workout={workout}
              selectedStepId={selectedStepId}
              onSelectStep={setSelectedStepId}
              onChange={updateWorkout}
            />
            <div className="space-y-6">
              <WorkoutChart
                workout={workout}
                selectedStepId={selectedStepId}
                onSelectStep={setSelectedStepId}
              />
            </div>
            <WorkoutSummary workout={workout} warnings={profileWarnings} />
          </div>
        ) : null}

        {activeTab === "library" ? (
          <WorkoutLibrary
            workouts={savedWorkouts}
            activeFtp={workout.ftp}
            onLoad={(nextWorkout) => {
              setWorkout(nextWorkout);
              setSelectedStepId(nextWorkout.blocks[0]?.id);
              setActiveTab("builder");
              flashStatus("Loaded workout");
            }}
            onSaveWorkout={handleSaveWorkout}
            onDeleteWorkout={handleDeleteWorkout}
          />
        ) : null}

        {activeTab === "profile" ? (
          <ProfilePanel
            profile={profile}
            workout={workout}
            integrations={integrations}
            onChange={handleProfileChange}
          />
        ) : null}

        {activeTab === "export" ? <ExportPanel workout={workout} /> : null}
      </div>
    </main>
  );
}
