import {
  blockTemplateLabels,
  createBlockFromTemplate,
  duplicateStep,
  findStepById,
  moveItem,
  removeStepById,
  updateStepById,
  type BlockTemplateId,
} from "@/lib/workout/editor";
import { clampNumber, createId, formatDuration, percentToWatts } from "@/lib/workout/math";
import type { TargetMode, Workout, WorkoutCue, WorkoutStep } from "@/lib/workout/types";

interface WorkoutEditorProps {
  workout: Workout;
  selectedStepId?: string;
  collapsedStepIds: Set<string>;
  onSelectStep: (stepId?: string) => void;
  onToggleCollapsedStep: (stepId: string) => void;
  onExpandAllSteps: () => void;
  onCollapseAllSteps: () => void;
  onPruneCollapsedSteps: (stepIds: string[]) => void;
  onChange: (workout: Workout) => void;
}

const blockTemplateIds: BlockTemplateId[] = [
  "warmup-ramp",
  "steady",
  "recovery",
  "two-step-repeat",
  "three-step-repeat",
  "ramp-up",
  "ramp-down",
  "cooldown-ramp",
];

function inputClassName() {
  return "mt-1 h-10 w-full min-w-0 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none transition focus:border-cyan-300";
}

function buttonClassName(active = false) {
  return active
    ? "min-w-0 truncate rounded-md border border-cyan-300 bg-cyan-300/10 px-2.5 py-1.5 text-xs font-semibold text-cyan-100"
    : "min-w-0 truncate rounded-md border border-slate-700 px-2.5 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-cyan-300 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-40";
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

function estimateStepWatts(ftp: number, step: WorkoutStep): string {
  if (step.type === "repeat") return `${step.repeatCount ?? 1}x`;

  if (step.targetMode === "range") {
    return `${percentToWatts(ftp, step.minPercentFTP ?? 0)}-${percentToWatts(
      ftp,
      step.maxPercentFTP ?? 0,
    )}W`;
  }

  if (step.targetMode === "ramp") {
    return `${percentToWatts(ftp, step.startPercentFTP ?? 0)}-${percentToWatts(
      ftp,
      step.endPercentFTP ?? 0,
    )}W`;
  }

  return `${percentToWatts(ftp, step.targetPercentFTP ?? 0)}W`;
}

function getAllStepIds(steps: WorkoutStep[]): string[] {
  return steps.flatMap((step) => [step.id, ...getAllStepIds(step.children ?? [])]);
}

function getRemovedStepIds(step: WorkoutStep): string[] {
  return [step.id, ...getAllStepIds(step.children ?? [])];
}

function stepIncludesId(step: WorkoutStep, stepId?: string): boolean {
  if (!stepId) return false;
  if (step.id === stepId) return true;
  return step.children?.some((child) => stepIncludesId(child, stepId)) ?? false;
}

function StepControls({
  canMoveUp,
  canMoveDown,
  canDelete,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onDelete,
}: {
  canMoveUp: boolean;
  canMoveDown: boolean;
  canDelete: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(6.75rem,1fr))] gap-2">
      <button
        type="button"
        disabled={!canMoveUp}
        onClick={(event) => {
          event.stopPropagation();
          onMoveUp();
        }}
        className={buttonClassName()}
      >
        Up
      </button>
      <button
        type="button"
        disabled={!canMoveDown}
        onClick={(event) => {
          event.stopPropagation();
          onMoveDown();
        }}
        className={buttonClassName()}
      >
        Down
      </button>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onDuplicate();
        }}
        className={buttonClassName()}
      >
        Duplicate
      </button>
      <button
        type="button"
        disabled={!canDelete}
        onClick={(event) => {
          event.stopPropagation();
          onDelete();
        }}
        className="min-w-0 truncate rounded-md border border-red-400/40 px-2.5 py-1.5 text-xs font-semibold text-red-200 transition hover:border-red-300 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Delete
      </button>
    </div>
  );
}

function StepEditor({
  ftp,
  step,
  depth,
  index,
  siblingCount,
  selected,
  selectedStepId,
  collapsedStepIds,
  onSelect,
  onToggleCollapsedStep,
  onPruneCollapsedSteps,
  onChange,
  onMove,
  onDuplicate,
  onDelete,
}: {
  ftp: number;
  step: WorkoutStep;
  depth: number;
  index: number;
  siblingCount: number;
  selected: boolean;
  selectedStepId?: string;
  collapsedStepIds: Set<string>;
  onSelect: (stepId?: string) => void;
  onToggleCollapsedStep: (stepId: string) => void;
  onPruneCollapsedSteps: (stepIds: string[]) => void;
  onChange: (step: WorkoutStep) => void;
  onMove: (fromIndex: number, toIndex: number) => void;
  onDuplicate: (step: WorkoutStep, index: number) => void;
  onDelete: (stepId: string) => void;
}) {
  const isRepeat = step.type === "repeat";
  const targetMode = step.targetMode ?? (isRepeat ? "single" : "single");
  const durationSeconds = step.durationSeconds ?? 1;
  const useMinutes = depth === 0 && !isRepeat;
  const durationValue = useMinutes ? Number((durationSeconds / 60).toFixed(2)) : durationSeconds;
  const durationSuffix = useMinutes ? "min" : "sec";
  const collapsed = collapsedStepIds.has(step.id);
  const childCount = step.children?.length ?? 0;

  const updateTargetMode = (mode: TargetMode) => {
    if (mode === "single") {
      onChange({
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
      });
      return;
    }

    if (mode === "range") {
      const target = step.targetPercentFTP ?? step.startPercentFTP ?? 75;
      onChange({
        ...step,
        targetMode: "range",
        minPercentFTP: step.minPercentFTP ?? Math.max(0, target - 3),
        maxPercentFTP: step.maxPercentFTP ?? target + 3,
        targetPercentFTP: undefined,
        startPercentFTP: undefined,
        endPercentFTP: undefined,
      });
      return;
    }

    const target = step.targetPercentFTP ?? step.minPercentFTP ?? 75;
    onChange({
      ...step,
      targetMode: "ramp",
      startPercentFTP: step.startPercentFTP ?? Math.max(0, target - 10),
      endPercentFTP: step.endPercentFTP ?? target,
      targetPercentFTP: undefined,
      minPercentFTP: undefined,
      maxPercentFTP: undefined,
    });
  };

  return (
    <article
      className={`rounded-lg border p-4 transition ${
        selected ? "border-cyan-300 bg-cyan-300/5" : "border-slate-800 bg-slate-950/70"
      }`}
      tabIndex={0}
      aria-label={`Select ${step.label}`}
      onClick={() => onSelect(step.id)}
      onKeyDown={(event) => {
        if (event.currentTarget !== event.target) return;

        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(step.id);
        }
      }}
    >
      <div className="grid gap-3">
        <div className="flex flex-wrap items-start gap-2">
          <button
            type="button"
            aria-label={`${collapsed ? "Expand" : "Collapse"} ${step.label}`}
            onClick={(event) => {
              event.stopPropagation();
              onToggleCollapsedStep(step.id);
            }}
            className={buttonClassName()}
          >
            {collapsed ? "Expand" : "Collapse"}
          </button>
          <div className="min-w-0 flex-1">
            <input
              value={step.label}
              onChange={(event) => onChange({ ...step, label: event.target.value })}
              className="w-full truncate bg-transparent text-base font-semibold text-slate-50 outline-none"
              aria-label="Step label"
            />
            <p className="mt-1 break-words text-xs uppercase tracking-[0.16em] text-slate-500">
              <span>{step.type}</span>
              {isRepeat && step.repeatCount ? <span> · {step.repeatCount} repeats</span> : null}
              {!isRepeat ? <span> · {formatDuration(durationSeconds)}</span> : null}
              <span> · {estimateStepWatts(ftp, step)}</span>
              {isRepeat && childCount > 0 ? (
                <span>
                  {" "}
                  · {childCount} {childCount === 1 ? "child" : "children"}
                </span>
              ) : null}
            </p>
          </div>
        </div>

        <StepControls
          canMoveUp={index > 0}
          canMoveDown={index < siblingCount - 1}
          canDelete={siblingCount > 1 || depth > 0}
          onMoveUp={() => onMove(index, index - 1)}
          onMoveDown={() => onMove(index, index + 1)}
          onDuplicate={() => onDuplicate(step, index)}
          onDelete={() => {
            onPruneCollapsedSteps(getRemovedStepIds(step));
            if (stepIncludesId(step, selectedStepId)) onSelect(undefined);
            onDelete(step.id);
          }}
        />
      </div>

      {!collapsed ? (
        <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(10.5rem,1fr))] gap-3">
          {isRepeat ? (
            <NumberField
              label="Repeat count"
              min={1}
              value={step.repeatCount ?? 1}
              onChange={(value) => onChange({ ...step, repeatCount: Math.round(value) })}
            />
          ) : (
            <NumberField
              label="Duration"
              min={useMinutes ? 0.25 : 1}
              step={useMinutes ? 0.25 : 1}
              suffix={durationSuffix}
              value={durationValue}
              onChange={(value) =>
                onChange({
                  ...step,
                  durationSeconds: Math.round(useMinutes ? value * 60 : value),
                })
              }
            />
          )}

          {!isRepeat ? (
            <label className="block">
              <span className="text-xs font-medium text-slate-400">Target mode</span>
              <select
                value={targetMode}
                onChange={(event) => updateTargetMode(event.target.value as TargetMode)}
                className={inputClassName()}
              >
                <option value="single">Single target</option>
                <option value="range">Target range</option>
                <option value="ramp">Ramp</option>
              </select>
            </label>
          ) : null}

          {!isRepeat && targetMode === "single" ? (
            <NumberField
              label="Target"
              min={0}
              suffix="%"
              value={step.targetPercentFTP ?? 0}
              onChange={(value) => onChange({ ...step, targetPercentFTP: value })}
            />
          ) : null}

          {!isRepeat && targetMode === "range" ? (
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

          {!isRepeat && targetMode === "ramp" ? (
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
      ) : null}

      {!collapsed && step.children ? (
        <div className="mt-4 space-y-3 border-l border-slate-800 pl-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Repeat children
            </p>
            <button
              type="button"
              className={buttonClassName()}
              onClick={(event) => {
                event.stopPropagation();
                onChange({
                  ...step,
                  children: [...(step.children ?? []), createBlockFromTemplate("steady")],
                });
              }}
            >
              Add child
            </button>
          </div>
          {step.children.map((child, childIndex) => (
            <StepEditor
              key={child.id}
              ftp={ftp}
              step={child}
              depth={depth + 1}
              index={childIndex}
              siblingCount={step.children?.length ?? 0}
              selected={child.id === selectedStepId}
              selectedStepId={selectedStepId}
              collapsedStepIds={collapsedStepIds}
              onSelect={onSelect}
              onToggleCollapsedStep={onToggleCollapsedStep}
              onPruneCollapsedSteps={onPruneCollapsedSteps}
              onChange={(updatedChild) =>
                onChange({
                  ...step,
                  children: step.children?.map((item) =>
                    item.id === updatedChild.id ? updatedChild : item,
                  ),
                })
              }
              onMove={(fromIndex, toIndex) =>
                onChange({ ...step, children: moveItem(step.children ?? [], fromIndex, toIndex) })
              }
              onDuplicate={(childStep, duplicateIndex) => {
                const children = [...(step.children ?? [])];
                children.splice(duplicateIndex + 1, 0, duplicateStep(childStep));
                onChange({ ...step, children });
              }}
              onDelete={(stepId) =>
                onChange({ ...step, children: removeStepById(step.children ?? [], stepId) })
              }
            />
          ))}
        </div>
      ) : null}
    </article>
  );
}

function CueEditor({
  cues,
  onChange,
}: {
  cues: WorkoutCue[];
  onChange: (cues: WorkoutCue[]) => void;
}) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-950/70 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">Text cues</h3>
          <p className="mt-1 text-xs text-slate-500">Exported in ERG/MRC where supported.</p>
        </div>
        <button
          type="button"
          className={buttonClassName()}
          onClick={() =>
            onChange([
              ...cues,
              {
                id: createId("cue"),
                atSeconds: 60,
                text: "Settle in.",
                durationSeconds: 10,
              },
            ])
          }
        >
          Add cue
        </button>
      </div>

      {cues.length > 0 ? (
        <div className="mt-3 space-y-2">
          {cues.map((cue) => (
            <div
              key={cue.id}
              className="grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-2"
            >
              <input
                type="number"
                min={0}
                value={cue.atSeconds}
                onChange={(event) =>
                  onChange(
                    cues.map((item) =>
                      item.id === cue.id
                        ? { ...item, atSeconds: clampNumber(Number(event.target.value), 0) }
                        : item,
                    ),
                  )
                }
                className={inputClassName()}
                aria-label="Cue start seconds"
              />
              <input
                value={cue.text}
                onChange={(event) =>
                  onChange(
                    cues.map((item) =>
                      item.id === cue.id ? { ...item, text: event.target.value } : item,
                    ),
                  )
                }
                className={inputClassName()}
                aria-label="Cue text"
              />
              <input
                type="number"
                min={1}
                value={cue.durationSeconds}
                onChange={(event) =>
                  onChange(
                    cues.map((item) =>
                      item.id === cue.id
                        ? { ...item, durationSeconds: clampNumber(Number(event.target.value), 1) }
                        : item,
                    ),
                  )
                }
                className={inputClassName()}
                aria-label="Cue duration seconds"
              />
              <button
                type="button"
                className="min-w-0 truncate rounded-lg border border-red-400/40 px-3 py-2 text-xs font-semibold text-red-200"
                onClick={() => onChange(cues.filter((item) => item.id !== cue.id))}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function WorkoutEditor({
  workout,
  selectedStepId,
  collapsedStepIds,
  onSelectStep,
  onToggleCollapsedStep,
  onExpandAllSteps,
  onCollapseAllSteps,
  onPruneCollapsedSteps,
  onChange,
}: WorkoutEditorProps) {
  const selectedStep = findStepById(workout.blocks, selectedStepId);

  const updateWorkout = (patch: Partial<Workout>) => {
    onChange({ ...workout, ...patch });
  };

  const appendBlock = (templateId: BlockTemplateId) => {
    const nextBlock = createBlockFromTemplate(templateId);
    updateWorkout({ blocks: [...workout.blocks, nextBlock] });
    onSelectStep(nextBlock.id);
  };

  return (
    <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/80 p-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
          Builder
        </p>
        <p className="mt-1 text-sm text-slate-400">
          Add blocks, repeats, ranges, ramps, and cues. Percentages stay reusable.
        </p>
      </div>

      <div className="grid gap-3">
        <label className="block">
          <span className="text-xs font-medium text-slate-400">Workout name</span>
          <input
            value={workout.name}
            onChange={(event) => updateWorkout({ name: event.target.value })}
            className={inputClassName()}
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-400">Description</span>
          <textarea
            value={workout.description}
            rows={3}
            onChange={(event) => updateWorkout({ description: event.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm leading-6 text-slate-100 outline-none transition focus:border-cyan-300"
          />
        </label>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          Add block
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {blockTemplateIds.map((templateId) => (
            <button
              key={templateId}
              type="button"
              onClick={() => appendBlock(templateId)}
              className={buttonClassName()}
            >
              {blockTemplateLabels[templateId]}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Workout blocks
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onExpandAllSteps} className={buttonClassName()}>
              Expand all
            </button>
            <button type="button" onClick={onCollapseAllSteps} className={buttonClassName()}>
              Collapse all
            </button>
          </div>
        </div>

        {workout.blocks.map((step, index) => (
          <StepEditor
            key={step.id}
            ftp={workout.ftp}
            step={step}
            depth={0}
            index={index}
            siblingCount={workout.blocks.length}
            selected={selectedStep?.id === step.id || selectedStepId === step.id}
            selectedStepId={selectedStepId}
            collapsedStepIds={collapsedStepIds}
            onSelect={onSelectStep}
            onToggleCollapsedStep={onToggleCollapsedStep}
            onPruneCollapsedSteps={onPruneCollapsedSteps}
            onChange={(updatedStep) =>
              updateWorkout({
                blocks: updateStepById(workout.blocks, updatedStep.id, () => updatedStep),
              })
            }
            onMove={(fromIndex, toIndex) =>
              updateWorkout({ blocks: moveItem(workout.blocks, fromIndex, toIndex) })
            }
            onDuplicate={(stepToDuplicate, duplicateIndex) => {
              const nextBlocks = [...workout.blocks];
              const duplicated = duplicateStep(stepToDuplicate);
              nextBlocks.splice(duplicateIndex + 1, 0, duplicated);
              updateWorkout({ blocks: nextBlocks });
              onSelectStep(duplicated.id);
            }}
            onDelete={(stepId) => {
              const nextBlocks = removeStepById(workout.blocks, stepId);
              updateWorkout({ blocks: nextBlocks });
              if (selectedStepId === stepId) onSelectStep(undefined);
            }}
          />
        ))}
      </div>

      <CueEditor cues={workout.cues ?? []} onChange={(cues) => updateWorkout({ cues })} />
    </section>
  );
}
