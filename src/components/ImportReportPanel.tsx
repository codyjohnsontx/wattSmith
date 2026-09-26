import type { WorkoutFileFormat } from "@/lib/ride/formats/types";

export interface ImportReport {
  fileName: string;
  format: WorkoutFileFormat;
  warnings: string[];
}

export function ImportReportPanel({ report, unsaved, onDismiss }: { report: ImportReport; unsaved: boolean; onDismiss: () => void }) {
  const count = report.warnings.length;

  return (
    <section className="border-l-2 border-cyan-300 bg-slate-900/60 px-5 py-4" aria-label="Import report">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
            Imported .{report.format} file
          </p>
          <p className="mt-2 break-words text-sm text-slate-200">
            <span className="font-semibold text-white">{report.fileName}</span>
            {" · "}
            {count === 0 ? "No warnings" : `${count} ${count === 1 ? "warning" : "warnings"}`}
          </p>
          {unsaved ? (
            <p className="mt-1 text-xs text-slate-500">This is an unsaved draft. Check it, then press Save to add it to your library.</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-sm font-semibold text-cyan-200 underline decoration-cyan-300/40 underline-offset-4"
        >
          Dismiss
        </button>
      </div>
      {count > 0 ? (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-amber-100/90">
          {report.warnings.map((warning, index) => (
            <li key={`${index}-${warning}`} className="break-words">
              {warning}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
