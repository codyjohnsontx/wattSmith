"use client";

import Link from "next/link";
import { ExportPanel } from "@/components/ExportPanel";
import type { ImportedWorkout } from "@/components/ImportWorkoutButton";
import { ImportReportPanel, type ImportReport } from "@/components/ImportReportPanel";
import { apiRequest } from "@/lib/client/api";
import type { ActivityPrescriptionOrigin } from "@/lib/activity/prescription";
import { consumeActivityPrescriptionDraft } from "@/lib/activity/prescriptionStorage";
import type { IntegrationConnection } from "@/lib/integrations/types";
import { ProfilePanel } from "@/components/ProfilePanel";
import { WorkoutChart } from "@/components/WorkoutChart";
import { WorkoutEditor } from "@/components/WorkoutEditor";
import { WorkoutLibrary } from "@/components/WorkoutLibrary";
import { WorkoutSummary } from "@/components/WorkoutSummary";
import { cloneDefaultWorkout } from "@/lib/workout/defaultWorkout";
import { createBlockFromTemplate } from "@/lib/workout/editor";
import { systemReusableBlocks } from "@/lib/workout/reusableBlocks";
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
  deleteReusableBlock,
  defaultProfile,
  loadIntegrationConnections,
  loadReusableBlocks,
  saveReusableBlock,
} from "@/lib/workout/storage";
import type {
  AthleteProfile,
  ReusableWorkoutBlock,
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

function workoutFingerprint(workout: Workout): string {
  const content = Object.fromEntries(
    Object.entries(normalizeWorkout(workout)).filter(([key]) => key !== "favorite" && key !== "updatedAt"),
  );
  return JSON.stringify(content);
}

function mergeWorkoutFingerprint(snapshot: string, values: Partial<Workout>) {
  if (!snapshot) return snapshot;
  return workoutFingerprint({ ...JSON.parse(snapshot) as Workout, ...values });
}

function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  if (target.isContentEditable) return true;

  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select";
}

function formatPrescriptionDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
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

function upsertWorkoutInList(workouts: Workout[], workout: Workout): Workout[] {
  const next = workouts.some((item) => item.id === workout.id)
    ? workouts.map((item) => (item.id === workout.id ? workout : item))
    : [workout, ...workouts];

  return [...next].sort((a, b) => {
    if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

interface WorkoutWorkspaceProps {
  initialTab?: WorkspaceTab;
}

export function WorkoutWorkspace({ initialTab = "builder" }: WorkoutWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(initialTab);
  const [profilePanelMounted, setProfilePanelMounted] = useState(initialTab === "profile");
  const [workoutHistory, setWorkoutHistory] = useState(() =>
    createWorkoutHistory(cloneDefaultWorkout()),
  );
  const [savedWorkouts, setSavedWorkouts] = useState<Workout[]>([]);
  const [customReusableBlocks, setCustomReusableBlocks] = useState<ReusableWorkoutBlock[]>([]);
  const [profile, setProfile] = useState<AthleteProfile>(defaultProfile);
  const [integrations, setIntegrations] = useState<IntegrationConnection[]>([]);
  const [selectedStepId, setSelectedStepId] = useState<string | undefined>("warmup");
  const [collapsedStepIds, setCollapsedStepIds] = useState<Set<string>>(() => new Set());
  const [status, setStatus] = useState("Ready");
  const [saveState, setSaveState] = useState<"unsaved" | "saving" | "saved" | "failed">("saved");
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState(() =>
    workoutFingerprint(cloneDefaultWorkout()),
  );
  const [prescriptionOrigin, setPrescriptionOrigin] = useState<ActivityPrescriptionOrigin | null>(null);
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const statusTimeoutRef = useRef<number | undefined>(undefined);
  const editorPristineRef = useRef(true);
  const activeWorkoutRef = useRef(workoutHistory.present);
  const navigationApprovedRef = useRef(false);
  const workout = workoutHistory.present;
  const canUndoWorkout = canUndoWorkoutHistory(workoutHistory);
  const canRedoWorkout = canRedoWorkoutHistory(workoutHistory);
  const hasUnsavedChanges = workoutFingerprint(workout) !== lastSavedSnapshot;

  useEffect(() => {
    activeWorkoutRef.current = workout;
  }, [workout]);

  const confirmDiscard = useCallback(() => {
    if (!hasUnsavedChanges) return true;
    return window.confirm("Discard unsaved workout changes?");
  }, [hasUnsavedChanges]);

  const guardLinkNavigation = useCallback((event: { preventDefault: () => void }) => {
    if (navigationApprovedRef.current) {
      navigationApprovedRef.current = false;
      return;
    }
    if (hasUnsavedChanges && !window.confirm("Discard unsaved workout changes and leave this page?")) {
      event.preventDefault();
    }
  }, [hasUnsavedChanges]);

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
    editorPristineRef.current = false;
    setSaveState("unsaved");
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
    let cancelled = false;

    async function loadServerState() {
      try {
        setStatus("Loading server library");
        const [serverProfile, serverWorkouts] = await Promise.all([
          apiRequest<AthleteProfile>("/api/profile"),
          apiRequest<Workout[]>("/api/workouts"),
        ]);

        if (cancelled) return;

        setProfile(serverProfile);
        setSavedWorkouts(serverWorkouts);
        setIntegrations(loadIntegrationConnections());
        setCustomReusableBlocks(loadReusableBlocks());

        if (editorPristineRef.current) {
          if (serverWorkouts[0]) {
            replaceActiveWorkout(serverWorkouts[0]);
            setLastSavedSnapshot(workoutFingerprint(serverWorkouts[0]));
          } else {
            const starter = { ...cloneDefaultWorkout(), ftp: serverProfile.ftp };
            replaceActiveWorkout(starter);
            setLastSavedSnapshot(workoutFingerprint(starter));
          }
          setSaveState("saved");
        }

        setStatus("Ready");
      } catch (error) {
        if (cancelled) return;
        setStatus(error instanceof Error ? error.message : "Could not load server library");
        setIntegrations(loadIntegrationConnections());
        setCustomReusableBlocks(loadReusableBlocks());
      }
    }

    const timeoutId = window.setTimeout(() => {
      const prescriptionDraft = consumeActivityPrescriptionDraft();
      if (prescriptionDraft) {
        editorPristineRef.current = false;
        replaceActiveWorkout(prescriptionDraft.workout);
        setPrescriptionOrigin(prescriptionDraft.origin);
        setLastSavedSnapshot("");
        setSaveState("unsaved");
        setActiveTab("builder");
        setStatus("Workout draft created from selected demand");
      }
      setCustomReusableBlocks(loadReusableBlocks());
      setIntegrations(loadIntegrationConnections());
      void loadServerState();
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      if (statusTimeoutRef.current !== undefined) {
        window.clearTimeout(statusTimeoutRef.current);
      }
    };
  }, [replaceActiveWorkout]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const handleInternalNavigation = (event: MouseEvent) => {
      if (!hasUnsavedChanges || event.defaultPrevented) return;
      const target = event.target instanceof Element ? event.target.closest("a") : null;
      if (!(target instanceof HTMLAnchorElement)) return;
      const destination = new URL(target.href, window.location.href);
      if (destination.origin !== window.location.origin || destination.pathname === window.location.pathname) return;
      if (!window.confirm("Discard unsaved workout changes and leave this page?")) {
        event.preventDefault();
        event.stopPropagation();
      } else {
        navigationApprovedRef.current = true;
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleInternalNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleInternalNavigation, true);
    };
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const marker = `wattsmith-unsaved-${Date.now()}`;
    window.history.pushState({ ...window.history.state, wattsmithUnsavedGuard: marker }, "", window.location.href);
    let restoringGuard = false;

    const handlePopState = () => {
      if (restoringGuard) {
        restoringGuard = false;
        return;
      }
      if (window.confirm("Discard unsaved workout changes and leave this page?")) {
        window.removeEventListener("popstate", handlePopState);
        window.history.back();
      } else {
        restoringGuard = true;
        window.history.forward();
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      if (window.history.state?.wattsmithUnsavedGuard === marker) window.history.back();
    };
  }, [hasUnsavedChanges]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTextEditingTarget(event.target)) return;
      if (activeTab !== "builder") return;

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
  }, [activeTab, canRedoWorkout, canUndoWorkout, redoWorkout, undoWorkout]);

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
  const reusableBlocks = useMemo(
    () => [...customReusableBlocks, ...systemReusableBlocks],
    [customReusableBlocks],
  );

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

  const handleSaveWorkout = async (workoutToSave = workout) => {
    const timestamp = new Date().toISOString();
    const nextWorkout = {
      ...workoutToSave,
      id: workoutToSave.id || createId("workout"),
      createdAt: workoutToSave.createdAt || timestamp,
      updatedAt: timestamp,
    };
    const submittedFingerprint = workoutFingerprint(nextWorkout);

    try {
      if (workoutToSave.id === workout.id) setSaveState("saving");
      const savedWorkout = await apiRequest<Workout>("/api/workouts", {
        method: "POST",
        body: JSON.stringify(nextWorkout),
      });

      if (activeWorkoutRef.current.id === nextWorkout.id) {
        setWorkoutHistory((current) => ({
          ...current,
          present: current.present.id === nextWorkout.id && workoutFingerprint(current.present) === submittedFingerprint
            ? normalizeWorkout(savedWorkout)
            : current.present,
        }));
        setLastSavedSnapshot(workoutFingerprint(savedWorkout));
        setSaveState("saved");
      }
      setSavedWorkouts((current) => upsertWorkoutInList(current, savedWorkout));
      flashStatus("Saved to library");
    } catch (error) {
      if (workoutToSave.id === workout.id) setSaveState("failed");
      flashStatus(error instanceof Error ? error.message : "Could not save workout");
    }
  };

  const handleToggleFavorite = async (id: string) => {
    const currentWorkout = savedWorkouts.find((item) => item.id === id);
    if (!currentWorkout) return;

    try {
      const toggled = await apiRequest<Workout>(`/api/workouts/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ favorite: !currentWorkout.favorite }),
      });

      setSavedWorkouts((current) => upsertWorkoutInList(current, toggled));
      if (id === workout.id) {
        // Patch the active workout in place; favoriting is not an edit, so it
        // must not enter undo history.
        setWorkoutHistory((current) => ({
          ...current,
          present: { ...current.present, favorite: toggled.favorite },
        }));
      }
      flashStatus(toggled.favorite ? "Added to favorites" : "Removed from favorites");
    } catch (error) {
      flashStatus(error instanceof Error ? error.message : "Could not update favorite");
    }
  };

  const handleRenameWorkout = async (id: string, name: string) => {
    const renamed = await apiRequest<Workout>(`/api/workouts/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    });
    setSavedWorkouts((current) => upsertWorkoutInList(current, renamed));
    if (activeWorkoutRef.current.id === id) {
      setWorkoutHistory((current) => ({
        ...current,
        present: current.present.id === id
          ? { ...current.present, name: renamed.name, updatedAt: renamed.updatedAt }
          : current.present,
      }));
      setLastSavedSnapshot((current) => mergeWorkoutFingerprint(current, { name: renamed.name }));
    }
    flashStatus("Workout renamed");
    return renamed;
  };

  const handleNewWorkout = () => {
    if (!confirmDiscard()) return;
    editorPristineRef.current = false;
    const nextWorkout = createBlankWorkout(profile.ftp);
    replaceActiveWorkout(nextWorkout);
    setPrescriptionOrigin(null);
    setImportReport(null);
    setLastSavedSnapshot("");
    setSaveState("unsaved");
    setActiveTab("builder");
    flashStatus("Started blank workout");
  };

  const handleImportWorkout = useCallback(
    ({ workout: imported, warnings, fileName, format }: ImportedWorkout) => {
      if (!confirmDiscard()) return;
      editorPristineRef.current = false;
      replaceActiveWorkout(imported);
      setPrescriptionOrigin(null);
      setImportReport({ fileName, format, warnings });
      setLastSavedSnapshot("");
      setSaveState("unsaved");
      setActiveTab("builder");
      flashStatus(`Imported ${fileName}`);
    },
    [confirmDiscard, flashStatus, replaceActiveWorkout],
  );

  const handleDeleteWorkout = async (id: string) => {
    if (workout.id === id && !confirmDiscard()) return;
    try {
      await apiRequest<void>(`/api/workouts/${id}`, { method: "DELETE" });

      const nextSavedWorkouts = savedWorkouts.filter((item) => item.id !== id);
      setSavedWorkouts(nextSavedWorkouts);
      if (workout.id === id) {
        const nextWorkout = nextSavedWorkouts[0] ?? createBlankWorkout(profile.ftp);
        replaceActiveWorkout(nextWorkout);
        setPrescriptionOrigin(null);
        setImportReport(null);
        setLastSavedSnapshot(nextSavedWorkouts[0] ? workoutFingerprint(nextWorkout) : "");
        setSaveState(nextSavedWorkouts[0] ? "saved" : "unsaved");
      }
      flashStatus("Deleted workout");
    } catch (error) {
      flashStatus(error instanceof Error ? error.message : "Could not delete workout");
    }
  };

  const handleSaveReusableBlock = (block: ReusableWorkoutBlock) => {
    const nextBlocks = saveReusableBlock(block);
    setCustomReusableBlocks(nextBlocks);
    flashStatus("Saved reusable block");
  };

  const handleDeleteReusableBlock = (id: string) => {
    const nextBlocks = deleteReusableBlock(id);
    setCustomReusableBlocks(nextBlocks);
    flashStatus("Deleted reusable block");
  };

  const handleProfileSave = async (nextProfile: AthleteProfile) => {
    const saved = await apiRequest<AthleteProfile>("/api/profile", {
      method: "PATCH",
      body: JSON.stringify(nextProfile),
    });
    setProfile(saved);
    flashStatus("Profile saved");
    return saved;
  };

  const handleProfileReload = async () => {
    const latest = await apiRequest<AthleteProfile>("/api/profile");
    setProfile(latest);
    return latest;
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
                  onClick={() => {
                    if (tab.id === "profile") setProfilePanelMounted(true);
                    setActiveTab(tab.id);
                  }}
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
              <span className={`text-xs font-semibold uppercase tracking-[0.14em] ${saveState === "failed" ? "text-red-300" : saveState === "saved" && !hasUnsavedChanges ? "text-emerald-300" : "text-amber-200"}`} aria-live="polite">
                {saveState === "saving" ? "Saving" : saveState === "failed" ? "Save failed" : hasUnsavedChanges ? "Unsaved" : "Saved"}
              </span>
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
                onClick={handleNewWorkout}
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
                  if (!confirmDiscard()) return;
                  editorPristineRef.current = false;
                  const starter = { ...cloneDefaultWorkout(), ftp: profile.ftp };
                  replaceActiveWorkout(starter);
                  setPrescriptionOrigin(null);
                  setImportReport(null);
                  setLastSavedSnapshot("");
                  setSaveState("unsaved");
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
          <div className="space-y-6">
            {prescriptionOrigin ? (
              <section className="border-l-2 border-cyan-300 bg-slate-900/60 px-5 py-4" aria-label="Workout draft origin">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">Draft from selected demand</p>
                    <p className="mt-2 text-sm text-slate-200">
                      <span className="font-semibold text-white">{prescriptionOrigin.findingLabel}</span>
                      {` · ${prescriptionOrigin.observedWatts}W observed → ${prescriptionOrigin.targetWatts}W target · ${prescriptionOrigin.repeatCount} × ${formatPrescriptionDuration(prescriptionOrigin.workIntervalSeconds)}`}
                      {prescriptionOrigin.recoverySeconds === null ? "" : ` with ${formatPrescriptionDuration(prescriptionOrigin.recoverySeconds)} recovery`}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">The source reference stays in this browser session and is not included when the workout is saved.</p>
                  </div>
                  <Link href={prescriptionOrigin.sourcePath} onNavigate={guardLinkNavigation} className="shrink-0 text-sm font-semibold text-cyan-200 underline decoration-cyan-300/40 underline-offset-4">
                    Back to analysis
                  </Link>
                </div>
              </section>
            ) : null}
            {importReport ? (
              <ImportReportPanel report={importReport} unsaved={hasUnsavedChanges} onDismiss={() => setImportReport(null)} />
            ) : null}
            <WorkoutChart
              workout={workout}
              selectedStepId={selectedStepId}
              onSelectStep={setSelectedStepId}
            />
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.75fr)]">
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
                reusableBlocks={reusableBlocks}
                onSaveReusableBlock={handleSaveReusableBlock}
                onDeleteReusableBlock={handleDeleteReusableBlock}
              />
              <WorkoutSummary workout={workout} warnings={profileWarnings} />
            </div>
          </div>
        ) : null}

        {activeTab === "library" ? (
          <WorkoutLibrary
            workouts={savedWorkouts}
            activeFtp={workout.ftp}
            profile={profile}
            onLoad={(nextWorkout) => {
              if (!confirmDiscard()) return;
              editorPristineRef.current = false;
              replaceActiveWorkout(nextWorkout);
              setPrescriptionOrigin(null);
              setImportReport(null);
              const saved = savedWorkouts.some((item) => item.id === nextWorkout.id);
              setLastSavedSnapshot(saved ? workoutFingerprint(nextWorkout) : "");
              setSaveState(saved ? "saved" : "unsaved");
              setActiveTab("builder");
              flashStatus("Loaded workout");
            }}
            onSaveWorkout={handleSaveWorkout}
            onRenameWorkout={handleRenameWorkout}
            onDeleteWorkout={handleDeleteWorkout}
            onToggleFavorite={handleToggleFavorite}
            onCreateNew={handleNewWorkout}
            onImportWorkout={handleImportWorkout}
          />
        ) : null}

        {profilePanelMounted ? (
          <div hidden={activeTab !== "profile"}>
            <ProfilePanel
              profile={profile}
              workout={workout}
              integrations={integrations}
              onSave={handleProfileSave}
              onReload={handleProfileReload}
              onNavigate={guardLinkNavigation}
            />
          </div>
        ) : null}

        {activeTab === "export" ? <ExportPanel key={workout.id} workout={workout} /> : null}
      </div>
    </main>
  );
}
