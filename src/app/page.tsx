"use client";

import { ExportPanel } from "@/components/ExportPanel";
import { ProfilePanel } from "@/components/ProfilePanel";
import { WorkoutChart } from "@/components/WorkoutChart";
import { WorkoutEditor } from "@/components/WorkoutEditor";
import { WorkoutLibrary } from "@/components/WorkoutLibrary";
import { WorkoutSummary } from "@/components/WorkoutSummary";
import { cloneDefaultWorkout } from "@/lib/workout/defaultWorkout";
import { createBlockFromTemplate } from "@/lib/workout/editor";
import {
  canRedoWorkoutHistory,
  canUndoWorkoutHistory,
  createWorkoutHistory,
  pushWorkoutHistory,
  redoWorkoutHistory,
  replaceWorkoutHistory,
  undoWorkoutHistory,
} from "@/lib/workout/history";
import { clampNumber, createId, percentToWatts } from "@/lib/workout/math";
import {
  deleteWorkout,
  defaultProfile,
  loadIntegrationConnections,
  loadProfile,
  loadWorkouts,
  saveProfile,
  saveWorkout,
} from "@/lib/workout/storage";
import type {
  AthleteProfile,
  IntegrationConnection,
  Workout,
  WorkoutStep,
} from "@/lib/workout/types";
import { validateWorkout } from "@/lib/workout/validation";
import { getProfileWarnings } from "@/lib/workout/warnings";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type WorkspaceTab = "builder" | "library" | "profile" | "export";

const tabs: { id: WorkspaceTab; label: string }[] = [
  { id: "builder", label: "Builder" },
  { id: "library", label: "Library" },
  { id: "profile", label: "Profile" },
  { id: "export", label: "Export" },
];

function getAllStepIds(steps: WorkoutStep[]): string[] {
  return steps.flatMap((step) => [step.id, ...getAllStepIds(step.children ?? [])]);
}

function normalizeWorkout(workout: Workout): Workout {
  return {
    ...workout,
    ftp: clampNumber(Math.round(workout.ftp), 1),
  };
}

function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  if (target.isContentEditable) return true;

  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select";
}

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
  const [workoutHistory, setWorkoutHistory] = useState(() =>
    createWorkoutHistory(cloneDefaultWorkout()),
  );
  const [savedWorkouts, setSavedWorkouts] = useState<Workout[]>([]);
  const [profile, setProfile] = useState<AthleteProfile>(defaultProfile);
  const [integrations, setIntegrations] = useState<IntegrationConnection[]>([]);
  const [selectedStepId, setSelectedStepId] = useState<string | undefined>("warmup");
  const [collapsedStepIds, setCollapsedStepIds] = useState<Set<string>>(() => new Set());
  const [status, setStatus] = useState("Ready");
  const statusTimeoutRef = useRef<number | undefined>(undefined);
  const workout = workoutHistory.present;
  const canUndoWorkout = canUndoWorkoutHistory(workoutHistory);
  const canRedoWorkout = canRedoWorkoutHistory(workoutHistory);

  const flashStatus = useCallback((message: string) => {
    if (statusTimeoutRef.current !== undefined) {
      window.clearTimeout(statusTimeoutRef.current);
    }

    setStatus(message);
    statusTimeoutRef.current = window.setTimeout(() => {
      setStatus("Ready");
      statusTimeoutRef.current = undefined;
    }, 1800);
  }, []);

  const syncEditorStateForWorkout = useCallback(
    (nextWorkout: Workout, options: { resetCollapsed?: boolean } = {}) => {
      const validStepIds = new Set(getAllStepIds(nextWorkout.blocks));
      const firstStepId = nextWorkout.blocks[0]?.id;

      setSelectedStepId((current) =>
        current && validStepIds.has(current) ? current : firstStepId,
      );
      setCollapsedStepIds((current) => {
        if (options.resetCollapsed) return new Set();

        return new Set([...current].filter((stepId) => validStepIds.has(stepId)));
      });
    },
    [],
  );

  const replaceActiveWorkout = useCallback(
    (nextWorkout: Workout) => {
      const normalizedWorkout = normalizeWorkout(nextWorkout);
      setWorkoutHistory(replaceWorkoutHistory(normalizedWorkout));
      syncEditorStateForWorkout(normalizedWorkout, { resetCollapsed: true });
    },
    [syncEditorStateForWorkout],
  );

  const updateWorkout = useCallback((nextWorkout: Workout) => {
    setWorkoutHistory((current) => pushWorkoutHistory(current, normalizeWorkout(nextWorkout)));
  }, []);

  const undoWorkout = useCallback(() => {
    if (!canUndoWorkout) return;

    const nextHistory = undoWorkoutHistory(workoutHistory);
    setWorkoutHistory(nextHistory);
    syncEditorStateForWorkout(nextHistory.present);
    flashStatus("Undid change");
  }, [canUndoWorkout, flashStatus, syncEditorStateForWorkout, workoutHistory]);

  const redoWorkout = useCallback(() => {
    if (!canRedoWorkout) return;

    const nextHistory = redoWorkoutHistory(workoutHistory);
    setWorkoutHistory(nextHistory);
    syncEditorStateForWorkout(nextHistory.present);
    flashStatus("Redid change");
  }, [canRedoWorkout, flashStatus, syncEditorStateForWorkout, workoutHistory]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const storedProfile = loadProfile();
      const storedWorkouts = loadWorkouts();
      setProfile(storedProfile);
      setSavedWorkouts(storedWorkouts);
      setIntegrations(loadIntegrationConnections());

      if (storedWorkouts[0]) {
        replaceActiveWorkout(storedWorkouts[0]);
      } else {
        replaceActiveWorkout({ ...cloneDefaultWorkout(), ftp: storedProfile.ftp });
      }
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
      if (statusTimeoutRef.current !== undefined) {
        window.clearTimeout(statusTimeoutRef.current);
      }
    };
  }, [replaceActiveWorkout]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTextEditingTarget(event.target)) return;

      const key = event.key.toLowerCase();
      const usesModifier = event.metaKey || event.ctrlKey;
      const isUndoShortcut = usesModifier && key === "z" && !event.shiftKey;
      const isRedoShortcut =
        (usesModifier && key === "z" && event.shiftKey) ||
        (event.ctrlKey && !event.metaKey && key === "y");

      if (isUndoShortcut && canUndoWorkout) {
        event.preventDefault();
        undoWorkout();
        return;
      }

      if (isRedoShortcut && canRedoWorkout) {
        event.preventDefault();
        redoWorkout();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canRedoWorkout, canUndoWorkout, redoWorkout, undoWorkout]);

  const ftpExamples = useMemo(
    () => [
      { label: "120%", watts: percentToWatts(workout.ftp, 120) },
      { label: "50%", watts: percentToWatts(workout.ftp, 50) },
      { label: "45%", watts: percentToWatts(workout.ftp, 45) },
    ],
    [workout.ftp],
  );

  const profileWarnings = useMemo(() => getProfileWarnings(profile, workout), [profile, workout]);
  const validationIssues = useMemo(() => validateWorkout(workout), [workout]);

  const toggleCollapsedStep = (stepId: string) => {
    setCollapsedStepIds((current) => {
      const next = new Set(current);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      return next;
    });
  };

  const expandAllSteps = () => {
    setCollapsedStepIds(new Set());
  };

  const collapseAllSteps = () => {
    setCollapsedStepIds(new Set(getAllStepIds(workout.blocks)));
  };

  const pruneCollapsedSteps = (stepIds: string[]) => {
    setCollapsedStepIds((current) => {
      const next = new Set(current);
      stepIds.forEach((stepId) => next.delete(stepId));
      return next;
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
    if (nextWorkout.id === workout.id) {
      setWorkoutHistory((current) => ({
        ...current,
        present: normalizeWorkout(nextWorkout),
      }));
    }
    setSavedWorkouts(nextSavedWorkouts);
    flashStatus("Saved locally");
  };

  const handleDeleteWorkout = (id: string) => {
    const nextSavedWorkouts = deleteWorkout(id);
    setSavedWorkouts(nextSavedWorkouts);
    if (workout.id === id) {
      const nextWorkout = nextSavedWorkouts[0] ?? createBlankWorkout(profile.ftp);
      replaceActiveWorkout(nextWorkout);
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
                disabled={!canUndoWorkout}
                onClick={undoWorkout}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Undo
              </button>
              <button
                type="button"
                disabled={!canRedoWorkout}
                onClick={redoWorkout}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Redo
              </button>
              <button
                type="button"
                onClick={() => {
                  const nextWorkout = createBlankWorkout(profile.ftp);
                  replaceActiveWorkout(nextWorkout);
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
                  replaceActiveWorkout(starter);
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
              collapsedStepIds={collapsedStepIds}
              onSelectStep={setSelectedStepId}
              onToggleCollapsedStep={toggleCollapsedStep}
              onExpandAllSteps={expandAllSteps}
              onCollapseAllSteps={collapseAllSteps}
              onPruneCollapsedSteps={pruneCollapsedSteps}
              onChange={updateWorkout}
              validationIssues={validationIssues}
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
            profile={profile}
            onLoad={(nextWorkout) => {
              replaceActiveWorkout(nextWorkout);
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
