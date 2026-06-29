import { cloneStepWithNewIds, moveItem } from "@/lib/workout/editor";
import { clampNumber, createId, formatDuration } from "@/lib/workout/math";
import type {
  ReusableBlockCategory,
  ReusableWorkoutBlock,
  TargetMode,
  WorkoutStep,
  WorkoutStepType,
  WorkoutValidationIssue,
} from "@/lib/workout/types";
import { validateWorkout } from "@/lib/workout/validation";
import type { KeyboardEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

export const reusableBlockCategories: { id: ReusableBlockCategory; label: string }[] = [
  { id: "warmup", label: "Warmup" },
  { id: "cooldown", label: "Cooldown" },
  { id: "recovery", label: "Recovery" },
  { id: "endurance", label: "Endurance" },
  { id: "tempo", label: "Tempo" },
  { id: "sweet-spot", label: "Sweet spot" },
  { id: "threshold", label: "Threshold" },
  { id: "vo2", label: "VO2" },
  { id: "anaerobic", label: "Anaerobic" },
  { id: "general", label: "General" },
];

export type ReusableBlockModalMode = "create" | "edit" | "duplicate" | "save-workout-block";

interface ReusableBlockEditorModalProps {
  isOpen: boolean;
  mode: ReusableBlockModalMode;
  initialBlock?: ReusableWorkoutBlock;
  onClose: () => void;
  onSave: (block: ReusableWorkoutBlock) => void;
}

function inputClassName() {
  return "mt-1 h-10 w-full min-w-0 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none transition focus:border-cyan-300";
}

function buttonClassName() {
  return "min-w-0 truncate rounded-md border border-slate-700 px-2.5 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-cyan-300 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-40";
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true");
}

function createIntervalStep(
  type: Exclude<WorkoutStepType, "repeat"> = "steady",
  label = type === "recovery" ? "Recovery" : "Interval",
): WorkoutStep {
  return {
    id: createId(type),
    type,
    label,
    targetMode: "single",
    durationSeconds: type === "recovery" ? 60 : 300,
    targetPercentFTP: type === "recovery" ? 50 : 85,
  };
}

function createRepeatStep(label = "Custom repeat"): WorkoutStep {
  return {
    id: createId("repeat"),
    type: "repeat",
    label,
    repeatCount: 3,
    children: [createIntervalStep("steady", "Work"), createIntervalStep("recovery", "Recover")],
  };
}

function createDraftBlock(): ReusableWorkoutBlock {
  const timestamp = new Date().toISOString();
  return {
    id: createId("reusable-block"),
    name: "Custom block",
    category: "general",
    notes: "",
    tags: [],
    source: "user",
    block: createIntervalStep("steady", "Custom block"),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function getTargetMode(step: WorkoutStep): TargetMode {
  if (step.targetMode) return step.targetMode;
  if (step.startPercentFTP !== undefined || step.endPercentFTP !== undefined) return "ramp";
  if (step.minPercentFTP !== undefined || step.maxPercentFTP !== undefined) return "range";
  return "single";
}

function stepWithType(step: WorkoutStep, type: WorkoutStepType): WorkoutStep {
  if (type === "repeat") {
    return {
      ...createRepeatStep(step.label || "Custom repeat"),
      id: step.id,
    };
  }

  const target = step.targetPercentFTP ?? step.minPercentFTP ?? step.startPercentFTP ?? 75;
  return {
    id: step.id,
    type,
    label: step.label || "Interval",
    targetMode: "single",
    durationSeconds: step.durationSeconds ?? 300,
    targetPercentFTP: type === "recovery" ? Math.min(target, 55) : target,
  };
}

function stepWithTargetMode(step: WorkoutStep, mode: TargetMode): WorkoutStep {
  if (mode === "single") {
    return {
      ...step,
      targetMode: "single",
      targetPercentFTP:
        step.targetPercentFTP ??
        step.minPercentFTP ??
        step.startPercentFTP ??
        step.endPercentFTP ??
        75,
      startPercentFTP: undefined,
      endPercentFTP: undefined,
      minPercentFTP: undefined,
      maxPercentFTP: undefined,
    };
  }

  if (mode === "range") {
    const target = step.targetPercentFTP ?? step.startPercentFTP ?? 75;
    return {
      ...step,
      targetMode: "range",
      minPercentFTP: step.minPercentFTP ?? Math.max(0, target - 3),
      maxPercentFTP: step.maxPercentFTP ?? target + 3,
      targetPercentFTP: undefined,
      startPercentFTP: undefined,
      endPercentFTP: undefined,
    };
  }

  const target = step.targetPercentFTP ?? step.minPercentFTP ?? 75;
  return {
    ...step,
    targetMode: "ramp",
    startPercentFTP: step.startPercentFTP ?? Math.max(0, target - 10),
    endPercentFTP: step.endPercentFTP ?? target,
    targetPercentFTP: undefined,
    minPercentFTP: undefined,
    maxPercentFTP: undefined,
  };
}

function NumberField({
  label,
  value,
  min,
  step = 1,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-400">{label}</span>
      <div className="relative">
        <input
          type="number"
          min={min}
          step={step}
          value={value}
          onChange={(event) => onChange(clampNumber(Number(event.target.value), min))}
          className={`${inputClassName()} ${suffix ? "pr-12" : ""}`}
        />
        {suffix ? (
          <span className="pointer-events-none absolute right-3 top-3 text-xs text-slate-500">
            {suffix}
          </span>
        ) : null}
      </div>
    </label>
  );
}

function IssueList({ issues }: { issues: WorkoutValidationIssue[] }) {
  if (!issues.length) return null;

  return (
    <div className="grid gap-1.5">
      {issues.map((issue) => (
        <p
          key={issue.id}
          className={`rounded-md border px-2.5 py-1 text-xs leading-5 ${
            issue.severity === "error"
              ? "border-red-400/35 bg-red-400/10 text-red-100"
              : "border-amber-300/35 bg-amber-300/10 text-amber-100"
          }`}
        >
          {issue.message}
        </p>
      ))}
    </div>
  );
}

function IntervalFields({
  step,
  compact = false,
  onChange,
}: {
  step: WorkoutStep;
  compact?: boolean;
  onChange: (step: WorkoutStep) => void;
}) {
  const targetMode = getTargetMode(step);
  const durationValue = compact ? step.durationSeconds ?? 1 : Number(((step.durationSeconds ?? 60) / 60).toFixed(2));

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-3">
      <label className="block">
        <span className="text-xs font-medium text-slate-400">Label</span>
        <input
          value={step.label}
          onChange={(event) => onChange({ ...step, label: event.target.value })}
          className={inputClassName()}
        />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-slate-400">Type</span>
        <select
          value={step.type}
          onChange={(event) => onChange(stepWithType(step, event.target.value as WorkoutStepType))}
          className={inputClassName()}
        >
          <option value="warmup">Warmup</option>
          <option value="cooldown">Cooldown</option>
          <option value="steady">Steady</option>
          <option value="recovery">Recovery</option>
        </select>
      </label>
      <NumberField
        label="Duration"
        min={compact ? 1 : 0.25}
        step={compact ? 1 : 0.25}
        suffix={compact ? "sec" : "min"}
        value={durationValue}
        onChange={(value) =>
          onChange({
            ...step,
            durationSeconds: Math.round(compact ? value : value * 60),
          })
        }
      />
      <label className="block">
        <span className="text-xs font-medium text-slate-400">Target mode</span>
        <select
          value={targetMode}
          onChange={(event) => onChange(stepWithTargetMode(step, event.target.value as TargetMode))}
          className={inputClassName()}
        >
          <option value="single">Single target</option>
          <option value="range">Target range</option>
          <option value="ramp">Ramp</option>
        </select>
      </label>

      {targetMode === "single" ? (
        <NumberField
          label="Target"
          min={0}
          suffix="%"
          value={step.targetPercentFTP ?? 0}
          onChange={(value) => onChange({ ...step, targetPercentFTP: value })}
        />
      ) : null}

      {targetMode === "range" ? (
        <>
          <NumberField
            label="Low"
            min={0}
            suffix="%"
            value={step.minPercentFTP ?? 0}
            onChange={(value) => onChange({ ...step, minPercentFTP: value })}
          />
          <NumberField
            label="High"
            min={0}
            suffix="%"
            value={step.maxPercentFTP ?? 0}
            onChange={(value) => onChange({ ...step, maxPercentFTP: value })}
          />
        </>
      ) : null}

      {targetMode === "ramp" ? (
        <>
          <NumberField
            label="Start"
            min={0}
            suffix="%"
            value={step.startPercentFTP ?? 0}
            onChange={(value) => onChange({ ...step, startPercentFTP: value })}
          />
          <NumberField
            label="End"
            min={0}
            suffix="%"
            value={step.endPercentFTP ?? 0}
            onChange={(value) => onChange({ ...step, endPercentFTP: value })}
          />
        </>
      ) : null}
    </div>
  );
}

function RepeatChildrenEditor({
  step,
  onChange,
}: {
  step: WorkoutStep;
  onChange: (step: WorkoutStep) => void;
}) {
  const children = step.children ?? [];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-3">
        <label className="block">
          <span className="text-xs font-medium text-slate-400">Block label</span>
          <input
            value={step.label}
            onChange={(event) => onChange({ ...step, label: event.target.value })}
            className={inputClassName()}
          />
        </label>
        <NumberField
          label="Repeat count"
          min={1}
          value={step.repeatCount ?? 1}
          onChange={(value) => onChange({ ...step, repeatCount: Math.round(value) })}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          Repeat children
        </p>
        <button
          type="button"
          className={buttonClassName()}
          onClick={() => onChange({ ...step, children: [...children, createIntervalStep()] })}
        >
          Add child interval
        </button>
      </div>

      <div className="space-y-3">
        {children.map((child, index) => (
          <article key={child.id} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-300">
                {index + 1}. {child.label || "Child interval"} · {formatDuration(child.durationSeconds ?? 0)}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={index === 0}
                  className={buttonClassName()}
                  onClick={() => onChange({ ...step, children: moveItem(children, index, index - 1) })}
                >
                  Up
                </button>
                <button
                  type="button"
                  disabled={index === children.length - 1}
                  className={buttonClassName()}
                  onClick={() => onChange({ ...step, children: moveItem(children, index, index + 1) })}
                >
                  Down
                </button>
                <button
                  type="button"
                  className={buttonClassName()}
                  onClick={() => {
                    const next = [...children];
                    next.splice(index + 1, 0, cloneStepWithNewIds(child));
                    onChange({ ...step, children: next });
                  }}
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  className="min-w-0 truncate rounded-md border border-red-400/40 px-2.5 py-1.5 text-xs font-semibold text-red-200 transition hover:border-red-300 disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => onChange({ ...step, children: children.filter((item) => item.id !== child.id) })}
                >
                  Delete
                </button>
              </div>
            </div>
            <IntervalFields
              step={child}
              compact
              onChange={(nextChild) =>
                onChange({
                  ...step,
                  children: children.map((item) => (item.id === child.id ? nextChild : item)),
                })
              }
            />
          </article>
        ))}
      </div>
    </div>
  );
}

function buildInitialDraft(
  mode: ReusableBlockModalMode,
  initialBlock?: ReusableWorkoutBlock,
): ReusableWorkoutBlock {
  if (!initialBlock) return createDraftBlock();

  if (mode === "edit") {
    return structuredClone(initialBlock);
  }

  const timestamp = new Date().toISOString();
  return {
    ...structuredClone(initialBlock),
    id: createId("reusable-block"),
    name:
      mode === "duplicate"
        ? `${initialBlock.name} copy`
        : initialBlock.name || initialBlock.block.label || "Saved block",
    source: "user",
    block: cloneStepWithNewIds(initialBlock.block),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function ReusableBlockEditorModal({
  isOpen,
  mode,
  initialBlock,
  onClose,
  onSave,
}: ReusableBlockEditorModalProps) {
  if (!isOpen) return null;

  return (
    <ReusableBlockEditorDialog
      key={`${mode}-${initialBlock?.id ?? "new"}`}
      initialDraft={buildInitialDraft(mode, initialBlock)}
      mode={mode}
      onClose={onClose}
      onSave={onSave}
    />
  );
}

function ReusableBlockEditorDialog({
  initialDraft,
  mode,
  onClose,
  onSave,
}: {
  initialDraft: ReusableWorkoutBlock;
  mode: ReusableBlockModalMode;
  onClose: () => void;
  onSave: (block: ReusableWorkoutBlock) => void;
}) {
  const [draft, setDraft] = useState<ReusableWorkoutBlock>(() => initialDraft);
  const [triedSave, setTriedSave] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const validationIssues = useMemo(() => {
    const issues: WorkoutValidationIssue[] = [];

    if (!draft.name.trim()) {
      issues.push({
        id: "reusable-block-name",
        severity: "error",
        message: "Reusable block needs a name.",
      });
    }

    if (!draft.category) {
      issues.push({
        id: "reusable-block-category",
        severity: "error",
        message: "Reusable block needs a category.",
      });
    }

    issues.push(
      ...validateWorkout({
        id: "reusable-block-validation",
        name: draft.name || "Reusable block",
        description: "",
        category: "endurance",
        ftp: 200,
        blocks: [draft.block],
        cues: [],
        createdAt: draft.createdAt,
        updatedAt: draft.updatedAt,
      }),
    );

    return issues;
  }, [draft]);

  const hasErrors = validationIssues.some((issue) => issue.severity === "error");
  const rootType = draft.block.type;

  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key !== "Tab" || !dialogRef.current) return;

    const focusableElements = getFocusableElements(dialogRef.current);
    if (focusableElements.length === 0) {
      event.preventDefault();
      dialogRef.current.focus();
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
      return;
    }

    if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  };

  const handleSave = () => {
    setTriedSave(true);
    if (hasErrors) return;

    const timestamp = new Date().toISOString();
    onSave({
      ...draft,
      name: draft.name.trim(),
      notes: draft.notes?.trim(),
      source: "user",
      block: cloneStepWithNewIds({
        ...draft.block,
        label: draft.block.label.trim() || draft.name.trim(),
      }),
      createdAt: draft.createdAt || timestamp,
      updatedAt: timestamp,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/80 px-4 py-8 backdrop-blur-sm">
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reusable-block-modal-title"
        tabIndex={-1}
        onKeyDown={handleDialogKeyDown}
        className="w-full max-w-4xl rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-2xl"
      >
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
              Reusable block
            </p>
            <h2 id="reusable-block-modal-title" className="mt-1 text-xl font-semibold text-white">
              {mode === "edit" ? "Edit custom block" : "Save custom block"}
            </h2>
          </div>
          <button type="button" onClick={onClose} className={buttonClassName()}>
            Close
          </button>
        </div>

        <div className="mt-4 grid gap-4">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-3">
            <label className="block">
              <span className="text-xs font-medium text-slate-400">Name</span>
              <input
                ref={nameInputRef}
                value={draft.name}
                onChange={(event) => {
                  const name = event.target.value;
                  setDraft((current) => ({
                    ...current,
                    name,
                    block: {
                      ...current.block,
                      label:
                        current.block.label.trim() === "" ||
                        current.block.label === current.name ||
                        current.block.label === "Custom block"
                          ? name
                          : current.block.label,
                    },
                  }));
                }}
                className={inputClassName()}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-400">Category</span>
              <select
                value={draft.category}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    category: event.target.value as ReusableBlockCategory,
                  }))
                }
                className={inputClassName()}
              >
                {reusableBlockCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-400">Root block type</span>
              <select
                value={rootType}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    block: stepWithType(current.block, event.target.value as WorkoutStepType),
                  }))
                }
                className={inputClassName()}
              >
                <option value="warmup">Warmup</option>
                <option value="cooldown">Cooldown</option>
                <option value="steady">Steady</option>
                <option value="recovery">Recovery</option>
                <option value="repeat">Repeat</option>
              </select>
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-medium text-slate-400">Notes</span>
            <textarea
              value={draft.notes ?? ""}
              rows={2}
              onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm leading-6 text-slate-100 outline-none transition focus:border-cyan-300"
            />
          </label>

          <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
            {draft.block.type === "repeat" ? (
              <RepeatChildrenEditor
                step={draft.block}
                onChange={(block) => setDraft((current) => ({ ...current, block }))}
              />
            ) : (
              <IntervalFields
                step={draft.block}
                onChange={(block) => setDraft((current) => ({ ...current, block }))}
              />
            )}
          </div>

          {triedSave || validationIssues.some((issue) => issue.severity === "warning") ? (
            <IssueList issues={validationIssues} />
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-800 pt-4">
            <button type="button" onClick={onClose} className={buttonClassName()}>
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="rounded-lg bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
            >
              Save block
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
