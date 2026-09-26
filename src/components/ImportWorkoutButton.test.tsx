// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { defaultProfile } from "@/lib/workout/storage";
import { validateWorkout } from "@/lib/workout/validation";
import type { ImportedWorkout } from "./ImportWorkoutButton";
import { WorkoutLibrary } from "./WorkoutLibrary";

const fixture = (...parts: string[]) => readFileSync(join(process.cwd(), "docs", ...parts), "utf8");

function renderLibrary() {
  const onImportWorkout = vi.fn<(draft: ImportedWorkout) => void>();
  render(
    <WorkoutLibrary
      workouts={[]}
      activeFtp={defaultProfile.ftp}
      profile={defaultProfile}
      onLoad={vi.fn()}
      onSaveWorkout={vi.fn()}
      onRenameWorkout={vi.fn()}
      onDeleteWorkout={vi.fn()}
      onToggleFavorite={vi.fn()}
      onImportWorkout={onImportWorkout}
    />,
  );
  return { onImportWorkout, input: screen.getByLabelText("Import workout file") };
}

describe("Library Import file button", () => {
  it("accepts only workout file types", () => {
    const { input } = renderLibrary();
    expect(input).toHaveAttribute("accept", ".zwo,.erg,.mrc");
    expect(screen.getByRole("button", { name: "Import file" })).toBeInTheDocument();
  });

  it("imports a .zwo fixture as a valid draft with its blocks", async () => {
    const user = userEvent.setup();
    const { onImportWorkout, input } = renderLibrary();
    const file = new File([fixture("import-fixtures", "zwo", "sweet_spot_2x20.zwo")], "sweet_spot_2x20.zwo");

    await user.upload(input, file);

    await waitFor(() => expect(onImportWorkout).toHaveBeenCalledTimes(1));
    const draft = onImportWorkout.mock.calls[0][0];
    expect(draft.fileName).toBe("sweet_spot_2x20.zwo");
    expect(draft.format).toBe("zwo");
    expect(draft.workout.name).toBe("Sweet Spot 2x20");
    expect(draft.workout.blocks).toHaveLength(5);
    expect(draft.workout.ftp).toBe(defaultProfile.ftp);
    expect(validateWorkout(draft.workout).filter((issue) => issue.severity === "error")).toEqual([]);
  });

  it("imports an .erg export fixture", async () => {
    const user = userEvent.setup();
    const { onImportWorkout, input } = renderLibrary();
    await user.upload(input, new File([fixture("export-fixtures", "fixture_repeats.erg")], "fixture_repeats.erg"));
    await waitFor(() => expect(onImportWorkout).toHaveBeenCalledTimes(1));
    expect(onImportWorkout.mock.calls[0][0].workout.blocks).toHaveLength(12);
  });

  it("shows a readable error for a malformed file and keeps working", async () => {
    const user = userEvent.setup();
    const { onImportWorkout, input } = renderLibrary();
    await user.upload(input, new File(["<workout_file><workout><SteadyState"], "broken.zwo"));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not import broken.zwo: The file is not valid XML");
    expect(onImportWorkout).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await user.upload(input, new File([fixture("export-fixtures", "fixture_ramps.mrc")], "fixture_ramps.mrc"));
    await waitFor(() => expect(onImportWorkout).toHaveBeenCalledTimes(1));
  });

  it("rejects oversized files before reading them", async () => {
    const user = userEvent.setup();
    const { onImportWorkout, input } = renderLibrary();
    await user.upload(input, new File(["x".repeat(1_000_001)], "huge.erg"));
    expect(await screen.findByRole("alert")).toHaveTextContent("too large");
    expect(onImportWorkout).not.toHaveBeenCalled();
  });

  it("imports a file dropped onto the library", async () => {
    const { onImportWorkout } = renderLibrary();
    const file = new File([fixture("export-fixtures", "fixture_steady_blocks.mrc")], "fixture_steady_blocks.mrc");
    const section = screen.getByRole("heading", { name: "Saved workouts and templates" }).closest("section")!;
    fireEvent.drop(section, { dataTransfer: { files: [file], types: ["Files"] } });
    await waitFor(() => expect(onImportWorkout).toHaveBeenCalledTimes(1));
    expect(onImportWorkout.mock.calls[0][0].workout.blocks).toHaveLength(3);
  });
});
