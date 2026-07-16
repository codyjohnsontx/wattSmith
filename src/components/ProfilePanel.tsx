"use client";

import { ApiError } from "@/lib/client/api";
import { getProfileWarnings } from "@/lib/workout/warnings";
import type { IntegrationConnection } from "@/lib/integrations/types";
import type { AthleteProfile, Workout } from "@/lib/workout/types";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ComponentProps } from "react";

interface ProfilePanelProps {
  profile: AthleteProfile;
  workout: Workout;
  integrations: IntegrationConnection[];
  onSave: (profile: AthleteProfile) => Promise<AthleteProfile>;
  onReload: () => Promise<AthleteProfile>;
  onNavigate?: ComponentProps<typeof Link>["onNavigate"];
}

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function inputClassName() {
  return "mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none transition focus:border-cyan-300";
}

export function ProfilePanel({ profile, workout, integrations, onSave, onReload, onNavigate }: ProfilePanelProps) {
  const [draft, setDraft] = useState(profile);
  const [savedBaseline, setSavedBaseline] = useState(profile);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error" | "conflict">("idle");
  const [error, setError] = useState("");
  const savingRef = useRef(false);
  const savedBaselineRef = useRef(profile);
  const isDirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(savedBaseline), [draft, savedBaseline]);
  const warnings = getProfileWarnings(draft, workout);

  useEffect(() => {
    setDraft((current) => JSON.stringify(current) === JSON.stringify(savedBaselineRef.current) ? profile : current);
    savedBaselineRef.current = profile;
    setSavedBaseline(profile);
  }, [profile]);

  const save = async () => {
    if (savingRef.current || !isDirty) return;
    savingRef.current = true;
    setSaveState("saving");
    setError("");
    const submitted = draft;
    try {
      const saved = await onSave(submitted);
      setDraft((current) => JSON.stringify(current) === JSON.stringify(submitted) ? saved : current);
      savedBaselineRef.current = saved;
      setSavedBaseline(saved);
      setSaveState("saved");
    } catch (saveError) {
      setSaveState(saveError instanceof ApiError && saveError.status === 409 ? "conflict" : "error");
      setError(saveError instanceof Error ? saveError.message : "Could not save profile.");
    } finally {
      savingRef.current = false;
    }
  };

  const reloadLatest = async () => {
    setSaveState("saving");
    setError("");
    try {
      const latest = await onReload();
      setDraft(latest);
      savedBaselineRef.current = latest;
      setSavedBaseline(latest);
      setSaveState("idle");
    } catch (reloadError) {
      setSaveState("error");
      setError(reloadError instanceof Error ? reloadError.message : "Could not reload profile.");
    }
  };

  return (
    <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
      <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
          Profile
        </p>
        <h2 className="mt-1 text-xl font-semibold text-slate-50">Athlete profile</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Stored on the server for workout defaults, warnings, and future planning.
        </p>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label>
            <span className="text-xs font-medium text-slate-400">FTP</span>
            <input
              type="number"
              min={1}
              value={draft.ftp}
              onChange={(event) => setDraft({ ...draft, ftp: Number(event.target.value) })}
              className={inputClassName()}
            />
          </label>
          <label>
            <span className="text-xs font-medium text-slate-400">Experience</span>
            <select
              value={draft.experienceLevel}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  experienceLevel: event.target.value as AthleteProfile["experienceLevel"],
                })
              }
              className={inputClassName()}
            >
              <option value="new">New</option>
              <option value="recreational">Recreational</option>
              <option value="serious">Serious</option>
              <option value="competitive">Competitive</option>
              <option value="elite">Elite</option>
            </select>
          </label>
          <label>
            <span className="text-xs font-medium text-slate-400">Weekly hours</span>
            <input
              type="number"
              min={0}
              value={draft.weeklyHours}
              onChange={(event) => setDraft({ ...draft, weeklyHours: Number(event.target.value) })}
              className={inputClassName()}
            />
          </label>
          <label>
            <span className="text-xs font-medium text-slate-400">Preferred duration</span>
            <input
              type="number"
              min={15}
              value={draft.preferredWorkoutDurationMinutes}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  preferredWorkoutDurationMinutes: Number(event.target.value),
                })
              }
              className={inputClassName()}
            />
          </label>
          <label className="md:col-span-2">
            <span className="text-xs font-medium text-slate-400">Primary goal</span>
            <input
              value={draft.primaryGoal}
              onChange={(event) => setDraft({ ...draft, primaryGoal: event.target.value })}
              className={inputClassName()}
            />
          </label>
          <label className="md:col-span-2">
            <span className="text-xs font-medium text-slate-400">Constraints</span>
            <input
              value={draft.constraints.join(", ")}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  constraints: event.target.value
                    .split(",")
                    .map((item) => item.trim())
                    .filter(Boolean),
                })
              }
              placeholder="time limits, travel, fatigue, injury note"
              className={inputClassName()}
            />
          </label>
        </div>

        <div className="mt-5">
          <span className="text-xs font-medium text-slate-400">Available days</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {weekdays.map((day) => {
              const active = draft.availableDays.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      availableDays: active
                        ? draft.availableDays.filter((item) => item !== day)
                        : [...draft.availableDays, day],
                    })
                  }
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                    active
                      ? "border-cyan-300 bg-cyan-300/10 text-cyan-100"
                      : "border-slate-700 text-slate-300"
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-slate-800 pt-4">
          <button
            type="button"
            onClick={() => void save()}
            disabled={!isDirty || saveState === "saving"}
            className="rounded-lg bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saveState === "saving" ? "Saving…" : "Save profile"}
          </button>
          <span className="text-sm text-slate-400" aria-live="polite">
            {saveState === "saved" && !isDirty ? "Saved" : isDirty ? "Unsaved changes" : "Up to date"}
          </span>
        </div>
        {error ? (
          <div className="mt-4 border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-100" role="alert">
            <p>{error}</p>
            {saveState === "conflict" ? (
              <button type="button" onClick={() => void reloadLatest()} className="mt-3 font-semibold text-cyan-200 underline underline-offset-4">
                Reload latest profile
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="space-y-5">
        <section className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">
            Profile Warnings
          </h2>
          {warnings.length > 0 ? (
            <div className="mt-3 space-y-2">
              {warnings.map((warning) => (
                <p
                  key={warning}
                  className="rounded-lg border border-amber-300/30 bg-amber-300/10 p-3 text-sm leading-6 text-amber-100"
                >
                  {warning}
                </p>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm leading-6 text-slate-400">
              Current workout fits the profile duration and intensity assumptions.
            </p>
          )}
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">
            Integrations
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Strava is a separate, revocable activity-data connection. Cached activity data expires within seven days.
          </p>
          <div className="mt-4 space-y-2">
            {integrations.map((connection) => (
              <div
                key={connection.provider}
                className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2"
              >
                <span className="capitalize text-slate-100">{connection.provider}</span>
                <span className="rounded-full bg-slate-800 px-2.5 py-1 text-xs text-slate-400">
                  Planned
                </span>
              </div>
            ))}
          </div>
          <Link href="/activities" onNavigate={onNavigate} className="mt-4 inline-block text-sm font-semibold text-cyan-200 underline underline-offset-4">
            Manage Strava connection
          </Link>
        </section>
      </div>
    </section>
  );
}
