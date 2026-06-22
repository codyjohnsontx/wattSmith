import { exportWorkoutToErg } from "@/lib/workout/exportErg";
import { exportWorkoutToMrc, safeFileName } from "@/lib/workout/exportMrc";
import { formatDuration } from "@/lib/workout/math";
import { calculateWorkoutSummary } from "@/lib/workout/summary";
import type { ExportRangeStrategy, Workout } from "@/lib/workout/types";
import { validateWorkout } from "@/lib/workout/validation";
import { useMemo, useState } from "react";

interface ExportPanelProps {
  workout: Workout;
}

const trainerRoadInstructions =
  "Download the `.MRC` or `.ERG` file. Open the TrainerRoad Workout Creator on Mac or Windows. Drag the file into the left sidebar. Review the workout, then click Save/Publish. Open the TrainerRoad app and refresh your workout library. The workout should appear under Workouts > Custom.";

function downloadTextFile(fileName: string, contents: string) {
  const blob = new Blob([contents], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName.toLowerCase();
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ExportPanel({ workout }: ExportPanelProps) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const [rangeStrategy, setRangeStrategy] = useState<ExportRangeStrategy>("midpoint");
  const [previewFormat, setPreviewFormat] = useState<"mrc" | "erg">("mrc");
  const summary = calculateWorkoutSummary(workout);
  const issues = validateWorkout(workout);
  const hasErrors = issues.some((issue) => issue.severity === "error");
  const baseFileName = safeFileName(workout.name) || "wattsmith_workout";
  const mrc = useMemo(() => exportWorkoutToMrc(workout, rangeStrategy), [workout, rangeStrategy]);
  const erg = useMemo(() => exportWorkoutToErg(workout, rangeStrategy), [workout, rangeStrategy]);
  const preview = previewFormat === "mrc" ? mrc : erg;
  const plainSummary = `${workout.name}
FTP: ${workout.ftp}W
Duration: ${formatDuration(summary.totalDurationSeconds)}
Work: ${formatDuration(summary.workSeconds)}
Recovery: ${formatDuration(summary.recoverySeconds)}
Average target: ${summary.averageWatts}W
Highest target: ${summary.highestWatts}W
IF estimate: ${summary.intensityFactor.toFixed(2)}
TSS estimate: ${summary.trainingStressScore}`;

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
            Export
          </p>
          <h2 className="mt-1 text-lg font-semibold text-slate-50">Ride it elsewhere</h2>
        </div>
        <p className="max-w-xl text-sm leading-6 text-slate-400">
          MRC preserves FTP percentages. ERG uses absolute watts from the current FTP.
        </p>
      </div>

      {issues.length > 0 ? (
        <div className="mt-4 space-y-2">
          {issues.map((issue) => (
            <p
              key={issue.id}
              className={`rounded-lg border px-3 py-2 text-sm ${
                issue.severity === "error"
                  ? "border-red-400/40 bg-red-400/10 text-red-100"
                  : "border-amber-300/40 bg-amber-300/10 text-amber-100"
              }`}
            >
              {issue.message}
            </p>
          ))}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-[220px_1fr]">
        <label>
          <span className="text-xs font-medium text-slate-400">Range export value</span>
          <select
            value={rangeStrategy}
            onChange={(event) => setRangeStrategy(event.target.value as ExportRangeStrategy)}
            className="mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none transition focus:border-cyan-300"
          >
            <option value="low">Low end</option>
            <option value="midpoint">Midpoint</option>
            <option value="high">High end</option>
          </select>
        </label>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <button
            type="button"
            disabled={hasErrors}
            onClick={() => downloadTextFile(`${baseFileName}.mrc`, mrc)}
            className="rounded-lg bg-cyan-300 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Export .MRC
          </button>
          <button
            type="button"
            disabled={hasErrors}
            onClick={() => downloadTextFile(`${baseFileName}.erg`, erg)}
            className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-100 transition hover:border-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Export .ERG
          </button>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(trainerRoadInstructions);
                setCopyError("");
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1800);
              } catch (error) {
                console.error("Failed to copy TrainerRoad instructions", error);
                setCopied(false);
                setCopyError("Could not copy instructions. You can still select the text below.");
              }
            }}
            className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-100 transition hover:border-cyan-300"
          >
            {copied ? "Copied" : "Copy import instructions"}
          </button>
        </div>
        {copyError ? <p className="text-sm text-amber-200 sm:col-start-2">{copyError}</p> : null}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-100">Export preview</h3>
            <div className="flex rounded-lg border border-slate-700 p-1">
              {(["mrc", "erg"] as const).map((format) => (
                <button
                  key={format}
                  type="button"
                  onClick={() => setPreviewFormat(format)}
                  className={`rounded-md px-3 py-1 text-xs font-semibold uppercase ${
                    previewFormat === format ? "bg-cyan-300 text-slate-950" : "text-slate-400"
                  }`}
                >
                  {format}
                </button>
              ))}
            </div>
          </div>
          <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-slate-950 p-3 font-mono text-xs leading-5 text-slate-300">
            {preview}
          </pre>
        </div>
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-4">
            <h3 className="text-sm font-semibold text-slate-100">TrainerRoad import</h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">{trainerRoadInstructions}</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-4">
            <h3 className="text-sm font-semibold text-slate-100">Plain-text summary</h3>
            <pre className="mt-2 whitespace-pre-wrap font-mono text-xs leading-5 text-slate-400">
              {plainSummary}
            </pre>
          </div>
        </div>
      </div>
    </section>
  );
}
