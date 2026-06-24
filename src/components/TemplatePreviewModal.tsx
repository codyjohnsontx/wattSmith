import { getScienceSource } from "@/lib/science/sources";
import { formatDuration } from "@/lib/workout/math";
import { calculateWorkoutSummary } from "@/lib/workout/summary";
import type { AthleteProfile, Workout, WorkoutCategory, WorkoutTemplate } from "@/lib/workout/types";
import { getProfileWarnings } from "@/lib/workout/warnings";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { WorkoutChart } from "./WorkoutChart";

interface TemplatePreviewModalProps {
  template: WorkoutTemplate;
  workout: Workout;
  profile: AthleteProfile;
  onClose: () => void;
  onUseTemplate: () => void;
}

function categoryLabel(category?: WorkoutCategory) {
  return category ? category.replace("-", " ") : "uncategorized";
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

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

type FocusableElement = HTMLElement | SVGElement;

export function TemplatePreviewModal({
  template,
  workout,
  profile,
  onClose,
  onUseTemplate,
}: TemplatePreviewModalProps) {
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogPanelRef = useRef<HTMLDivElement>(null);
  const [selectedStepId, setSelectedStepId] = useState<string | undefined>(workout.blocks[0]?.id);
  const summary = useMemo(() => calculateWorkoutSummary(workout), [workout]);
  const warnings = useMemo(() => getProfileWarnings(profile, workout), [profile, workout]);
  const sources = useMemo(
    () => template.rationale.sourceIds.map(getScienceSource).filter(Boolean),
    [template.rationale.sourceIds],
  );

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    const getFocusableElements = () =>
      Array.from(
        dialogPanelRef.current?.querySelectorAll<FocusableElement>(focusableSelector) ?? [],
      ).filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 || rect.height > 0;
      });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key !== "Tab") return;

      const focusableElements = getFocusableElements();
      const firstElement = focusableElements[0];
      const lastElement = focusableElements.at(-1);

      if (!firstElement || !lastElement) {
        event.preventDefault();
        dialogPanelRef.current?.focus();
        return;
      }

      const activeElement = document.activeElement;
      const focusIsInsideDialog =
        activeElement instanceof Element && dialogPanelRef.current?.contains(activeElement);

      if (!focusIsInsideDialog) {
        event.preventDefault();
        firstElement.focus();
        return;
      }

      if (event.shiftKey && activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
        return;
      }

      if (!event.shiftKey && activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 px-3 py-4 backdrop-blur-sm sm:px-5 sm:py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="mx-auto flex min-h-full max-w-6xl items-center">
        <div
          ref={dialogPanelRef}
          tabIndex={-1}
          className="w-full rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-2xl shadow-black/50 sm:p-5"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <header className="flex flex-col gap-3 border-b border-slate-800 pb-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
                Starter template preview
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <h2 id={titleId} className="text-2xl font-semibold tracking-tight text-white">
                  {template.name}
                </h2>
                <span className="rounded-full bg-slate-800 px-2.5 py-1 text-xs capitalize text-slate-300">
                  {categoryLabel(template.category)}
                </span>
              </div>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                {template.description}
              </p>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label="Close template preview"
              className="h-10 w-10 shrink-0 rounded-lg border border-slate-700 text-lg font-semibold text-slate-200 transition hover:border-cyan-300 hover:text-white focus:border-cyan-300 focus:outline-none"
            >
              x
            </button>
          </header>

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0">
              <WorkoutChart
                workout={workout}
                selectedStepId={selectedStepId}
                onSelectStep={setSelectedStepId}
              />
            </div>

            <aside className="space-y-3">
              <section className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
                  Key metrics
                </p>
                <p className="mt-2 text-sm text-slate-400">
                  FTP {workout.ftp}W. {summary.dominantZone.label} dominant.
                </p>
                <dl className="mt-4 grid grid-cols-2 gap-2">
                  <Metric label="Duration" value={formatDuration(summary.totalDurationSeconds)} />
                  <Metric label="Avg target" value={`${summary.averageWatts}W`} />
                  <Metric label="Highest" value={`${summary.highestWatts}W`} />
                  <Metric label="Work" value={formatDuration(summary.workSeconds)} />
                  <Metric label="Recovery" value={formatDuration(summary.recoverySeconds)} />
                  <Metric label="IF est." value={summary.intensityFactor.toFixed(2)} />
                  <Metric label="TSS est." value={`${summary.trainingStressScore}`} />
                  <Metric label="Above FTP" value={formatDuration(summary.aboveThresholdSeconds)} />
                </dl>
                <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900/70 p-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                    Dominant zone
                  </p>
                  <p className="mt-1 text-base font-semibold text-slate-50">
                    {summary.dominantZone.label}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{summary.dominantZone.range}</p>
                </div>
              </section>

              {warnings.length > 0 ? (
                <section className="space-y-2" aria-label="Profile warnings">
                  {warnings.map((warning) => (
                    <p
                      key={warning}
                      className="rounded-lg border border-amber-300/30 bg-amber-300/10 p-3 text-sm leading-6 text-amber-100"
                    >
                      {warning}
                    </p>
                  ))}
                </section>
              ) : (
                <p className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm leading-6 text-slate-400">
                  Fits the current profile duration and intensity warning thresholds.
                </p>
              )}
            </aside>
          </div>

          <section className="mt-5 grid gap-4 border-t border-slate-800 pt-5 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.45fr)]">
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">
                  Rationale
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  {template.rationale.summary}
                </p>
              </div>

              {template.rationale.cautions.length > 0 ? (
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-200">
                    Cautions
                  </h3>
                  <ul className="mt-2 space-y-2 text-sm leading-6 text-amber-100">
                    {template.rationale.cautions.map((caution) => (
                      <li key={caution} className="rounded-lg bg-amber-300/10 px-3 py-2">
                        {caution}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">
                  Citations
                </h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {sources.map((source) => (
                    <a
                      key={source!.id}
                      href={source!.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1 text-xs font-medium text-cyan-200 transition hover:border-cyan-300 hover:text-cyan-100"
                    >
                      {source!.authors
                        ? `${source!.authors}${source!.year ? `, ${source!.year}` : ""}`
                        : source!.title}
                    </a>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={onUseTemplate}
                  className="rounded-lg bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
                >
                  Use this template
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-cyan-300"
                >
                  Close
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
