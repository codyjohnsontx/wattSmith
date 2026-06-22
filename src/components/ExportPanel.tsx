import { exportWorkoutToErg } from "@/lib/workout/exportErg";
import { exportWorkoutToMrc, safeFileName } from "@/lib/workout/exportMrc";
import { formatDuration } from "@/lib/workout/math";
import { calculateWorkoutSummary } from "@/lib/workout/summary";
import type { Workout } from "@/lib/workout/types";
import { useState } from "react";

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
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ExportPanel({ workout }: ExportPanelProps) {
  const [copied, setCopied] = useState(false);
  const summary = calculateWorkoutSummary(workout);
  const baseFileName = safeFileName(workout.name) || "wattsmith_workout";
  const plainSummary = `${workout.name}
FTP: ${workout.ftp}W
Duration: ${formatDuration(summary.totalDurationSeconds)}
Work: ${formatDuration(summary.workSeconds)}
Recovery: ${formatDuration(summary.recoverySeconds)}
Average target: ${summary.averageWatts}W
Highest target: ${summary.highestWatts}W`;

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
          Use MRC for reusable FTP-percentage workouts. Use ERG when you want fixed watts from
          the current FTP.
        </p>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={() => downloadTextFile(`${baseFileName}.mrc`, exportWorkoutToMrc(workout))}
          className="rounded-lg bg-cyan-300 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
        >
          Export .MRC
        </button>
        <button
          type="button"
          onClick={() => downloadTextFile(`${baseFileName}.erg`, exportWorkoutToErg(workout))}
          className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-100 transition hover:border-cyan-300"
        >
          Export .ERG
        </button>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(trainerRoadInstructions);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1800);
          }}
          className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-100 transition hover:border-cyan-300"
        >
          {copied ? "Copied" : "Copy import instructions"}
        </button>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
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
    </section>
  );
}
