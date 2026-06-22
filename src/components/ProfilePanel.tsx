import { formatDuration } from "@/lib/workout/math";
import { calculateWorkoutSummary } from "@/lib/workout/summary";
import type { AthleteProfile, IntegrationConnection, Workout } from "@/lib/workout/types";

interface ProfilePanelProps {
  profile: AthleteProfile;
  workout: Workout;
  integrations: IntegrationConnection[];
  onChange: (profile: AthleteProfile) => void;
}

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function inputClassName() {
  return "mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none transition focus:border-cyan-300";
}

export function getProfileWarnings(profile: AthleteProfile, workout: Workout): string[] {
  const summary = calculateWorkoutSummary(workout);
  const warnings: string[] = [];

  if (summary.totalDurationSeconds / 60 > profile.preferredWorkoutDurationMinutes) {
    warnings.push(
      `This workout is ${formatDuration(summary.totalDurationSeconds)}, longer than your preferred ${profile.preferredWorkoutDurationMinutes} minutes.`,
    );
  }

  const intensityDensity = summary.aboveThresholdSeconds / Math.max(1, summary.totalDurationSeconds);
  if (intensityDensity > 0.22 && profile.experienceLevel !== "elite") {
    warnings.push("This workout has a high share of work above FTP. Consider reducing repeats when fatigued.");
  }

  return warnings;
}

export function ProfilePanel({ profile, workout, integrations, onChange }: ProfilePanelProps) {
  const warnings = getProfileWarnings(profile, workout);

  return (
    <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
      <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
          Profile
        </p>
        <h2 className="mt-1 text-xl font-semibold text-slate-50">Local athlete assumptions</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Stored locally for defaults and warnings. No account or backend is used.
        </p>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label>
            <span className="text-xs font-medium text-slate-400">FTP</span>
            <input
              type="number"
              min={1}
              value={profile.ftp}
              onChange={(event) => onChange({ ...profile, ftp: Number(event.target.value) })}
              className={inputClassName()}
            />
          </label>
          <label>
            <span className="text-xs font-medium text-slate-400">Experience</span>
            <select
              value={profile.experienceLevel}
              onChange={(event) =>
                onChange({
                  ...profile,
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
              value={profile.weeklyHours}
              onChange={(event) => onChange({ ...profile, weeklyHours: Number(event.target.value) })}
              className={inputClassName()}
            />
          </label>
          <label>
            <span className="text-xs font-medium text-slate-400">Preferred duration</span>
            <input
              type="number"
              min={15}
              value={profile.preferredWorkoutDurationMinutes}
              onChange={(event) =>
                onChange({
                  ...profile,
                  preferredWorkoutDurationMinutes: Number(event.target.value),
                })
              }
              className={inputClassName()}
            />
          </label>
          <label className="md:col-span-2">
            <span className="text-xs font-medium text-slate-400">Primary goal</span>
            <input
              value={profile.primaryGoal}
              onChange={(event) => onChange({ ...profile, primaryGoal: event.target.value })}
              className={inputClassName()}
            />
          </label>
          <label className="md:col-span-2">
            <span className="text-xs font-medium text-slate-400">Constraints</span>
            <input
              value={profile.constraints.join(", ")}
              onChange={(event) =>
                onChange({
                  ...profile,
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
              const active = profile.availableDays.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() =>
                    onChange({
                      ...profile,
                      availableDays: active
                        ? profile.availableDays.filter((item) => item !== day)
                        : [...profile.availableDays, day],
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
            Integration types are modeled for a future Strava import spike. No live sync is active.
          </p>
          <div className="mt-4 space-y-2">
            {integrations.map((connection) => (
              <div
                key={connection.provider}
                className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2"
              >
                <span className="capitalize text-slate-100">{connection.provider}</span>
                <span className="rounded-full bg-slate-800 px-2.5 py-1 text-xs text-slate-400">
                  Coming next
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
