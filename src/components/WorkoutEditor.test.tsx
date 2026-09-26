// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { defaultWorkout } from "@/lib/workout/defaultWorkout";
import type { Workout } from "@/lib/workout/types";
import { WorkoutEditor } from "./WorkoutEditor";

const freeRideWorkout: Workout = {
  ...defaultWorkout,
  blocks: [
    {
      id: "free",
      type: "steady",
      label: "Free ride",
      targetMode: "single",
      durationSeconds: 600,
      targetPercentFTP: 60,
      ergEnabled: false,
    },
  ],
};

function renderEditor() {
  const onChange = vi.fn<(workout: Workout) => void>();
  render(
    <WorkoutEditor
      workout={freeRideWorkout}
      selectedStepId="free"
      collapsedStepIds={new Set()}
      onSelectStep={vi.fn()}
      onToggleCollapsedStep={vi.fn()}
      onExpandAllSteps={vi.fn()}
      onCollapseAllSteps={vi.fn()}
      onPruneCollapsedSteps={vi.fn()}
      onChange={onChange}
      validationIssues={[]}
      reusableBlocks={[]}
      onSaveReusableBlock={vi.fn()}
      onDeleteReusableBlock={vi.fn()}
    />,
  );
  return onChange;
}

describe("WorkoutEditor free ride steps", () => {
  it("turns a free ride step into an ERG step when its target is edited", () => {
    const onChange = renderEditor();
    fireEvent.change(screen.getByRole("spinbutton", { name: /^Target/ }), { target: { value: "75" } });

    const edited = onChange.mock.lastCall![0].blocks[0];
    expect(edited).toMatchObject({ targetMode: "single", targetPercentFTP: 75 });
    expect(edited.ergEnabled).toBeUndefined();
  });

  it("turns a free ride step into an ERG step when its target mode changes", () => {
    const onChange = renderEditor();
    fireEvent.change(screen.getByRole("combobox", { name: "Target mode" }), { target: { value: "ramp" } });

    const edited = onChange.mock.lastCall![0].blocks[0];
    expect(edited).toMatchObject({ targetMode: "ramp" });
    expect(edited.ergEnabled).toBeUndefined();
  });

  it("keeps a free ride step free when only its duration changes", () => {
    const onChange = renderEditor();
    fireEvent.change(screen.getByRole("spinbutton", { name: /^Duration/ }), { target: { value: "12" } });

    expect(onChange.mock.lastCall![0].blocks[0]).toMatchObject({ durationSeconds: 720, ergEnabled: false });
  });
});
