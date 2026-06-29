import { useDraggable } from "@dnd-kit/core";
import {
  ReusableBlockEditorModal,
  reusableBlockCategories,
  type ReusableBlockModalMode,
} from "@/components/ReusableBlockEditorModal";
import { cloneStepWithNewIds } from "@/lib/workout/editor";
import { createId, formatDuration } from "@/lib/workout/math";
import type { ReusableBlockCategory, ReusableWorkoutBlock, WorkoutStep } from "@/lib/workout/types";
import { useMemo, useState } from "react";

interface ReusableBlockManagerProps {
  reusableBlocks: ReusableWorkoutBlock[];
  activeDragBlockId?: string;
  onInsertBlock: (block: ReusableWorkoutBlock) => void;
  onSaveReusableBlock: (block: ReusableWorkoutBlock) => void;
  onDeleteReusableBlock: (id: string) => void;
}

interface ModalState {
  mode: ReusableBlockModalMode;
  block?: ReusableWorkoutBlock;
}

const categoryLabels = new Map(reusableBlockCategories.map((category) => [category.id, category.label]));

const starterCategoryOrder: ReusableBlockCategory[] = [
  "warmup",
  "endurance",
  "tempo",
  "sweet-spot",
  "threshold",
  "vo2",
  "anaerobic",
  "recovery",
  "cooldown",
  "general",
];

const categoryAccentClassNames: Record<ReusableBlockCategory, string> = {
  warmup: "border-amber-300/35 bg-amber-300/10 text-amber-100",
  endurance: "border-emerald-300/35 bg-emerald-300/10 text-emerald-100",
  tempo: "border-sky-300/35 bg-sky-300/10 text-sky-100",
  "sweet-spot": "border-pink-300/35 bg-pink-300/10 text-pink-100",
  threshold: "border-orange-300/35 bg-orange-300/10 text-orange-100",
  vo2: "border-cyan-300/35 bg-cyan-300/10 text-cyan-100",
  anaerobic: "border-red-300/35 bg-red-300/10 text-red-100",
  recovery: "border-lime-300/35 bg-lime-300/10 text-lime-100",
  cooldown: "border-indigo-300/35 bg-indigo-300/10 text-indigo-100",
  general: "border-slate-500/45 bg-slate-700/30 text-slate-200",
};

function buttonClassName() {
  return "min-w-0 truncate rounded-md border border-slate-700 px-2.5 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-cyan-300 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-40";
}

function inputClassName() {
  return "h-10 w-full min-w-0 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none transition focus:border-cyan-300";
}

function getStepDurationSeconds(step: WorkoutStep): number {
  if (step.type !== "repeat") {
    return step.durationSeconds ?? 0;
  }

  const childDuration = (step.children ?? []).reduce(
    (total, child) => total + getStepDurationSeconds(child),
    0,
  );
  return Math.max(1, Math.round(step.repeatCount ?? 1)) * childDuration;
}

function describeTarget(step: WorkoutStep): string {
  if (step.type === "repeat") {
    const childTargets = (step.children ?? []).map(describeTarget).filter(Boolean);
    return childTargets.length ? childTargets.join(" / ") : `${step.repeatCount ?? 1}x`;
  }

  if (step.targetMode === "range") {
    return `${step.minPercentFTP ?? 0}-${step.maxPercentFTP ?? 0}%`;
  }

  if (step.targetMode === "ramp") {
    return `${step.startPercentFTP ?? 0}-${step.endPercentFTP ?? 0}%`;
  }

  return `${step.targetPercentFTP ?? 0}%`;
}

function describeDuration(step: WorkoutStep): string {
  if (step.type === "repeat") {
    const childCount = step.children?.length ?? 0;
    return `${step.repeatCount ?? 1}x · ${childCount} ${childCount === 1 ? "child" : "children"} · ${formatDuration(getStepDurationSeconds(step))}`;
  }

  return formatDuration(step.durationSeconds ?? 0);
}

function blockSearchText(block: ReusableWorkoutBlock): string {
  return [
    block.name,
    block.notes ?? "",
    ...(block.tags ?? []),
    block.category,
    categoryLabels.get(block.category) ?? "",
    block.block.label,
    ...(block.block.children ?? []).map((child) => child.label),
  ]
    .join(" ")
    .toLowerCase();
}

function sortReusableBlocks(blocks: ReusableWorkoutBlock[]): ReusableWorkoutBlock[] {
  return [...blocks].sort((a, b) => {
    const categoryCompare = starterCategoryOrder.indexOf(a.category) - starterCategoryOrder.indexOf(b.category);
    if (categoryCompare !== 0) return categoryCompare;
    return a.name.localeCompare(b.name);
  });
}

function createEmptyCustomBlock(): ReusableWorkoutBlock {
  const timestamp = new Date().toISOString();
  return {
    id: createId("reusable-block"),
    name: "Custom block",
    category: "general",
    notes: "",
    tags: [],
    source: "user",
    block: {
      id: createId("steady"),
      type: "steady",
      label: "Custom block",
      targetMode: "single",
      durationSeconds: 5 * 60,
      targetPercentFTP: 85,
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function ReusableBlockActions({
  block,
  onInsertBlock,
  onDuplicateBlock,
  onEditBlock,
  onDeleteBlock,
}: {
  block: ReusableWorkoutBlock;
  onInsertBlock: (block: ReusableWorkoutBlock) => void;
  onDuplicateBlock: (block: ReusableWorkoutBlock) => void;
  onEditBlock: (block: ReusableWorkoutBlock) => void;
  onDeleteBlock: (block: ReusableWorkoutBlock) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      <button type="button" onClick={() => onInsertBlock(block)} className={buttonClassName()}>
        Insert
      </button>
      <button type="button" onClick={() => onDuplicateBlock(block)} className={buttonClassName()}>
        Duplicate
      </button>
      <button
        type="button"
        disabled={block.source !== "user"}
        onClick={() => onEditBlock(block)}
        className={buttonClassName()}
      >
        Edit
      </button>
      <button
        type="button"
        disabled={block.source !== "user"}
        onClick={() => onDeleteBlock(block)}
        className="min-w-0 truncate rounded-md border border-red-400/40 px-2.5 py-1.5 text-xs font-semibold text-red-200 transition hover:border-red-300 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Delete
      </button>
    </div>
  );
}

export function ReusableBlockPaletteItem({
  block,
  active,
  onInsertBlock,
  onDuplicateBlock,
  onEditBlock,
  onDeleteBlock,
}: {
  block: ReusableWorkoutBlock;
  active: boolean;
  onInsertBlock: (block: ReusableWorkoutBlock) => void;
  onDuplicateBlock: (block: ReusableWorkoutBlock) => void;
  onEditBlock: (block: ReusableWorkoutBlock) => void;
  onDeleteBlock: (block: ReusableWorkoutBlock) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `library-block:${block.id}`,
    data: {
      kind: "library-block",
      reusableBlockId: block.id,
    },
  });
  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`rounded-lg border bg-slate-950/70 p-2.5 transition ${
        active || isDragging
          ? "border-cyan-300 opacity-60"
          : "border-slate-800 hover:border-slate-600"
      }`}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          className="mt-0.5 grid h-7 w-7 shrink-0 cursor-grab place-items-center rounded-md border border-slate-700 text-xs font-bold text-slate-400 transition hover:border-cyan-300 hover:text-cyan-100 active:cursor-grabbing"
          aria-label={`Drag ${block.name}`}
          {...attributes}
          {...listeners}
        >
          ::
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h4 className="min-w-0 truncate text-sm font-semibold text-slate-100">
              {block.name}
            </h4>
            <span className={`rounded-full border px-1.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.1em] ${categoryAccentClassNames[block.category]}`}>
              {block.source === "system" ? "Starter" : "Custom"}
            </span>
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            {describeDuration(block.block)} · {describeTarget(block.block)}
          </p>
          <p className="text-xs text-slate-500">{categoryLabels.get(block.category)}</p>
          {block.notes ? (
            <details className="mt-1 text-xs text-slate-400">
              <summary className="cursor-pointer text-slate-500 transition hover:text-slate-300">
                Details
              </summary>
              <p className="mt-1 leading-5">{block.notes}</p>
            </details>
          ) : null}
        </div>
      </div>
      <div className="mt-2">
        <ReusableBlockActions
          block={block}
          onInsertBlock={onInsertBlock}
          onDuplicateBlock={onDuplicateBlock}
          onEditBlock={onEditBlock}
          onDeleteBlock={onDeleteBlock}
        />
      </div>
    </article>
  );
}

export function ReusableBlockPaletteGroup({
  category,
  blocks,
  activeDragBlockId,
  onInsertBlock,
  onDuplicateBlock,
  onEditBlock,
  onDeleteBlock,
}: {
  category: ReusableBlockCategory;
  blocks: ReusableWorkoutBlock[];
  activeDragBlockId?: string;
  onInsertBlock: (block: ReusableWorkoutBlock) => void;
  onDuplicateBlock: (block: ReusableWorkoutBlock) => void;
  onEditBlock: (block: ReusableWorkoutBlock) => void;
  onDeleteBlock: (block: ReusableWorkoutBlock) => void;
}) {
  if (!blocks.length) return null;

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          {categoryLabels.get(category)}
        </h3>
        <span className={`rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold ${categoryAccentClassNames[category]}`}>
          {blocks.length}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {blocks.map((block) => (
          <ReusableBlockPaletteItem
            key={block.id}
            block={block}
            active={activeDragBlockId === block.id}
            onInsertBlock={onInsertBlock}
            onDuplicateBlock={onDuplicateBlock}
            onEditBlock={onEditBlock}
            onDeleteBlock={onDeleteBlock}
          />
        ))}
      </div>
    </section>
  );
}

export function ReusableBlockManager({
  reusableBlocks,
  activeDragBlockId,
  onInsertBlock,
  onSaveReusableBlock,
  onDeleteReusableBlock,
}: ReusableBlockManagerProps) {
  const [query, setQuery] = useState("");
  const [modalState, setModalState] = useState<ModalState | undefined>();
  const normalizedQuery = query.trim().toLowerCase();

  const filteredBlocks = useMemo(() => {
    return sortReusableBlocks(reusableBlocks).filter((block) => {
      if (!normalizedQuery) return true;
      return blockSearchText(block).includes(normalizedQuery);
    });
  }, [normalizedQuery, reusableBlocks]);

  const customBlocks = filteredBlocks.filter((block) => block.source === "user");
  const starterBlocks = filteredBlocks.filter((block) => block.source === "system");
  const customCount = reusableBlocks.filter((block) => block.source === "user").length;
  const starterCount = reusableBlocks.filter((block) => block.source === "system").length;
  const hasAnyFilteredBlocks = filteredBlocks.length > 0;

  const duplicateBlock = (block: ReusableWorkoutBlock) => {
    setModalState({
      mode: "duplicate",
      block: {
        ...block,
        tags: block.tags ?? [],
        block: cloneStepWithNewIds(block.block),
      },
    });
  };

  const editBlock = (block: ReusableWorkoutBlock) => {
    if (block.source === "user") setModalState({ mode: "edit", block });
  };

  const deleteBlock = (block: ReusableWorkoutBlock) => {
    if (block.source === "user") onDeleteReusableBlock(block.id);
  };

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Reusable blocks
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {customCount} custom · {starterCount} starter
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalState({ mode: "create", block: createEmptyCustomBlock() })}
          className={buttonClassName()}
        >
          Create block
        </button>
      </div>

      <div className="mt-3">
        <input
          aria-label="Search reusable blocks"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search blocks"
          className={inputClassName()}
        />
      </div>

      <div className="mt-3 max-h-[38rem] space-y-5 overflow-y-auto pr-1">
        {customBlocks.length > 0 ? (
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Custom
              </h3>
              <span className="rounded-full border border-emerald-300/35 bg-emerald-300/10 px-2 py-0.5 text-[0.68rem] font-semibold text-emerald-100">
                {customBlocks.length}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {customBlocks.map((block) => (
                <ReusableBlockPaletteItem
                  key={block.id}
                  block={block}
                  active={activeDragBlockId === block.id}
                  onInsertBlock={onInsertBlock}
                  onDuplicateBlock={duplicateBlock}
                  onEditBlock={editBlock}
                  onDeleteBlock={deleteBlock}
                />
              ))}
            </div>
          </section>
        ) : null}

        {starterCategoryOrder.map((category) => (
          <ReusableBlockPaletteGroup
            key={category}
            category={category}
            blocks={starterBlocks.filter((block) => block.category === category)}
            activeDragBlockId={activeDragBlockId}
            onInsertBlock={onInsertBlock}
            onDuplicateBlock={duplicateBlock}
            onEditBlock={editBlock}
            onDeleteBlock={deleteBlock}
          />
        ))}
      </div>

      {!hasAnyFilteredBlocks ? (
        <p className="mt-3 rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-400">
          No blocks match.
        </p>
      ) : null}

      <ReusableBlockEditorModal
        isOpen={modalState !== undefined}
        mode={modalState?.mode ?? "create"}
        initialBlock={modalState?.block}
        onClose={() => setModalState(undefined)}
        onSave={(block) => {
          onSaveReusableBlock({ ...block, tags: block.tags ?? [] });
          setModalState(undefined);
        }}
      />
    </section>
  );
}
