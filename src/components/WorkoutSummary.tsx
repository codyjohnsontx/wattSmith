import { scienceNotes } from "@/lib/science/notes";
import { formatDuration } from "@/lib/workout/math";
import { calculateWorkoutSummary } from "@/lib/workout/summary";
import type { Workout } from "@/lib/workout/types";
import { ScienceNoteCard } from "./ScienceNote";

interface WorkoutSummaryProps {
  workout: Workout;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
      <dt className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</dt>
      <dd className="mt-1 text-lg font-semibold text-slate-50">{value}</dd>
    </div>
  );
}

export function WorkoutSummary({ workout }: WorkoutSummaryProps) {
  const summary = calculateWorkoutSummary(workout);
  const maxZoneSeconds = Math.max(1, ...summary.zones.map((zone) => zone.seconds));

  return (
    <aside className="space-y-4">
      <section className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
          Summary
        </p>
        <h2 className="mt-1 text-lg font-semibold text-slate-50">{workout.name}</h2>
        <p className="mt-1 text-sm text-slate-400">FTP {workout.ftp}W</p>

        <dl className="mt-4 grid grid-cols-2 gap-2">
          <Metric label="Duration" value={formatDuration(summary.totalDurationSeconds)} />
          <Metric label="Work" value={formatDuration(summary.workSeconds)} />
          <Metric label="Recovery" value={formatDuration(summary.recoverySeconds)} />
          <Metric label="Warmup" value={formatDuration(summary.warmupSeconds)} />
          <Metric label="Cooldown" value={formatDuration(summary.cooldownSeconds)} />
          <Metric label="Avg target" value={`${summary.averageWatts}W`} />
          <Metric label="Highest" value={`${summary.highestWatts}W`} />
          <Metric label="Above FTP" value={formatDuration(summary.aboveThresholdSeconds)} />
        </dl>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">
          Time In Zones
        </h2>
        <div className="mt-4 space-y-3">
          {summary.zones.map((zone) => (
            <div key={zone.id}>
              <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                <span className="text-slate-200">{zone.label}</span>
                <span className="text-slate-500">
                  {zone.range} · {formatDuration(zone.seconds)}
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-800">
                <div
                  className="h-2 rounded-full bg-cyan-300"
                  style={{ width: `${(zone.seconds / maxZoneSeconds) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        {scienceNotes.map((note) => (
          <ScienceNoteCard key={note.id} note={note} />
        ))}
      </section>
    </aside>
  );
}
