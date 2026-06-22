import { scienceNotes } from "@/lib/science/notes";
import { getScienceSource } from "@/lib/science/sources";
import { formatDuration } from "@/lib/workout/math";
import { calculateWorkoutSummary } from "@/lib/workout/summary";
import type { Workout, WorkoutRationale } from "@/lib/workout/types";
import { ScienceNoteCard } from "./ScienceNote";

interface WorkoutSummaryProps {
  workout: Workout;
  warnings?: string[];
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
      <dt className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</dt>
      <dd className="mt-1 text-lg font-semibold text-slate-50">{value}</dd>
      {hint ? <p className="mt-1 text-xs leading-5 text-slate-500">{hint}</p> : null}
    </div>
  );
}

function RationalePanel({ rationale }: { rationale?: WorkoutRationale }) {
  if (!rationale) return null;

  const sources = rationale.sourceIds.map(getScienceSource).filter(Boolean);

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
      <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">
        Workout Rationale
      </h2>
      <p className="mt-3 text-sm leading-6 text-slate-300">{rationale.summary}</p>
      {rationale.cautions.length > 0 ? (
        <ul className="mt-3 space-y-1 text-sm text-amber-100">
          {rationale.cautions.map((caution) => (
            <li key={caution}>- {caution}</li>
          ))}
        </ul>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {sources.map((source) => (
          <a
            key={source!.id}
            href={source!.url}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1 text-xs font-medium text-cyan-200"
          >
            {source!.authors ? `${source!.authors}${source!.year ? `, ${source!.year}` : ""}` : source!.title}
          </a>
        ))}
      </div>
    </section>
  );
}

export function WorkoutSummary({ workout, warnings = [] }: WorkoutSummaryProps) {
  const summary = calculateWorkoutSummary(workout);
  const maxZoneSeconds = Math.max(1, ...summary.zones.map((zone) => zone.seconds));

  return (
    <aside className="space-y-4">
      <section className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
          Summary
        </p>
        <h2 className="mt-1 text-lg font-semibold text-slate-50">{workout.name}</h2>
        <p className="mt-1 text-sm text-slate-400">
          FTP {workout.ftp}W · {summary.dominantZone.label} dominant
        </p>

        {warnings.length > 0 ? (
          <div className="mt-4 rounded-lg border border-amber-300/30 bg-amber-300/10 p-3 text-sm leading-6 text-amber-100">
            {warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        ) : null}

        <dl className="mt-4 grid grid-cols-2 gap-2">
          <Metric label="Duration" value={formatDuration(summary.totalDurationSeconds)} />
          <Metric label="Work" value={formatDuration(summary.workSeconds)} />
          <Metric label="Recovery" value={formatDuration(summary.recoverySeconds)} />
          <Metric label="Warmup" value={formatDuration(summary.warmupSeconds)} />
          <Metric label="Cooldown" value={formatDuration(summary.cooldownSeconds)} />
          <Metric label="Avg target" value={`${summary.averageWatts}W`} />
          <Metric label="Highest" value={`${summary.highestWatts}W`} />
          <Metric label="Above FTP" value={formatDuration(summary.aboveThresholdSeconds)} />
          <Metric label="Above VO2" value={formatDuration(summary.aboveVo2Seconds)} />
          <Metric label="Intervals" value={`${summary.intervalCount}`} />
          <Metric label="Longest work" value={formatDuration(summary.longestWorkSeconds)} />
          <Metric label="kJ estimate" value={`${summary.estimatedKilojoules}`} />
          <Metric label="IF est." value={summary.intensityFactor.toFixed(2)} />
          <Metric label="TSS est." value={`${summary.trainingStressScore}`} />
          <Metric
            label="NP-style est."
            value={`${summary.normalizedPowerEstimate}W`}
            hint="Approximation for comparing workouts."
          />
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

      <RationalePanel rationale={workout.rationale} />

      <section className="space-y-3">
        {scienceNotes.map((note) => (
          <ScienceNoteCard key={note.id} note={note} />
        ))}
      </section>
    </aside>
  );
}
