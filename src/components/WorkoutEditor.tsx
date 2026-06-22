import { clampNumber, formatDuration, percentToWatts } from "@/lib/workout/math";
import type { Workout, WorkoutStep } from "@/lib/workout/types";

interface WorkoutEditorProps {
  workout: Workout;
  onChange: (workout: Workout) => void;
}

function inputClassName() {
  return "mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none transition focus:border-cyan-300";
}

function updateStepById(
  steps: WorkoutStep[],
  stepId: string,
  updater: (step: WorkoutStep) => WorkoutStep,
): WorkoutStep[] {
  return steps.map((step) => {
    if (step.id === stepId) {
      return updater(step);
    }

    if (step.children) {
      return {
        ...step,
        children: updateStepById(step.children, stepId, updater),
      };
    }

    return step;
  });
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

function StepEditor({
  ftp,
  step,
  depth,
  onChange,
}: {
  ftp: number;
  step: WorkoutStep;
  depth: number;
  onChange: (step: WorkoutStep) => void;
}) {
  const isRepeat = step.type === "repeat";
  const isRamp = step.startPercentFTP !== undefined || step.endPercentFTP !== undefined;
  const durationSeconds = step.durationSeconds ?? 1;
  const useMinutes = depth === 0 && !isRepeat;
  const durationValue = useMinutes ? Number((durationSeconds / 60).toFixed(2)) : durationSeconds;
  const durationSuffix = useMinutes ? "min" : "sec";

  return (
    <article className="rounded-lg border border-slate-800 bg-slate-950/70 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <input
            value={step.label}
            onChange={(event) => onChange({ ...step, label: event.target.value })}
            className="w-full bg-transparent text-base font-semibold text-slate-50 outline-none"
            aria-label="Step label"
          />
          <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">
            {step.type}
            {isRepeat && step.repeatCount ? ` · ${step.repeatCount} repeats` : ""}
            {!isRepeat ? ` · ${formatDuration(durationSeconds)}` : ""}
          </p>
        </div>
        {!isRepeat && step.targetPercentFTP !== undefined ? (
          <div className="rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-200">
            {percentToWatts(ftp, step.targetPercentFTP)}W
          </div>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
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

        {!isRepeat && isRamp ? (
          <>
            <NumberField
              label="Start"
              min={0}
              suffix="%"
              value={step.startPercentFTP ?? step.targetPercentFTP ?? 0}
              onChange={(value) => onChange({ ...step, startPercentFTP: value })}
            />
            <NumberField
              label="End"
              min={0}
              suffix="%"
              value={step.endPercentFTP ?? step.targetPercentFTP ?? 0}
              onChange={(value) => onChange({ ...step, endPercentFTP: value })}
            />
          </>
        ) : null}

        {!isRepeat && !isRamp ? (
          <NumberField
            label="Target"
            min={0}
            suffix="%"
            value={step.targetPercentFTP ?? 0}
            onChange={(value) => onChange({ ...step, targetPercentFTP: value })}
          />
        ) : null}
      </div>

      {step.children ? (
        <div className="mt-4 space-y-3 border-l border-slate-800 pl-3">
          {step.children.map((child) => (
            <StepEditor
              key={child.id}
              ftp={ftp}
              step={child}
              depth={depth + 1}
              onChange={(updatedChild) =>
                onChange({
                  ...step,
                  children: step.children?.map((item) =>
                    item.id === updatedChild.id ? updatedChild : item,
                  ),
                })
              }
            />
          ))}
        </div>
      ) : null}
    </article>
  );
}

export function WorkoutEditor({ workout, onChange }: WorkoutEditorProps) {
  const updateWorkout = (patch: Partial<Workout>) => {
    onChange({ ...workout, ...patch });
  };

  return (
    <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/80 p-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
          Workout Editor
        </p>
        <p className="mt-1 text-sm text-slate-400">
          Edit the starter structure. Watts stay calculated from FTP percentages.
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

      <div className="space-y-3">
        {workout.blocks.map((step) => (
          <StepEditor
            key={step.id}
            ftp={workout.ftp}
            step={step}
            depth={0}
            onChange={(updatedStep) =>
              updateWorkout({
                blocks: updateStepById(workout.blocks, updatedStep.id, () => updatedStep),
              })
            }
          />
        ))}
      </div>
    </section>
  );
}
