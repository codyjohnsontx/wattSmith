"use client";

import { useDroppable } from "@dnd-kit/core";
import type { WorkoutStepContainerId } from "@/lib/workout/editor";

interface WorkoutDropJointProps {
  containerId: WorkoutStepContainerId;
  index: number;
  active: boolean;
  disabled?: boolean;
}

export function dropJointId(containerId: WorkoutStepContainerId, index: number): string {
  return `workout-joint:${containerId}:${index}`;
}

export function WorkoutDropJoint({
  containerId,
  index,
  active,
  disabled = false,
}: WorkoutDropJointProps) {
  const { setNodeRef } = useDroppable({
    id: dropJointId(containerId, index),
    disabled,
    data: {
      type: "workout-drop-joint",
      containerId,
      index,
      disabled,
    },
  });

  return (
    <div ref={setNodeRef} className="py-1" aria-hidden={disabled}>
      <div
        className={`grid place-items-center overflow-hidden rounded-md border transition-all ${
          active
            ? "my-1 h-12 border-cyan-300/70 bg-cyan-300/10 text-cyan-100"
            : "h-2 border-transparent bg-transparent text-transparent"
        }`}
      >
        <span className="text-[0.68rem] font-semibold uppercase tracking-[0.14em]">
          Drop here
        </span>
      </div>
    </div>
  );
}
