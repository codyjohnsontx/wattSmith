// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WorkoutRow } from "./WorkoutLibrary";
import { cloneDefaultWorkout } from "@/lib/workout/defaultWorkout";
import { decorateWorkouts } from "@/lib/workout/library";

function renderRow(onRename: (name: string) => Promise<ReturnType<typeof cloneDefaultWorkout>>) {
  const workout = { ...cloneDefaultWorkout(), id: "saved-1", name: "Server name" };
  const [entry] = decorateWorkouts([workout]);
  render(<WorkoutRow entry={entry} onLoad={vi.fn()} onDuplicate={vi.fn()} onDelete={vi.fn()} onRename={onRename} onToggleFavorite={vi.fn()} />);
  return workout;
}

describe("saved workout rename", () => {
  it("commits once on Enter and cancels on Escape", async () => {
    const user = userEvent.setup();
    const onRename = vi.fn(async (name: string) => ({ ...cloneDefaultWorkout(), id: "saved-1", name }));
    renderRow(onRename);
    const input = screen.getByLabelText("Rename saved workout");
    await user.clear(input);
    await user.type(input, "Race prep{Enter}");
    expect(onRename).toHaveBeenCalledTimes(1);
    expect(onRename).toHaveBeenCalledWith("Race prep");
    await user.click(input);
    await user.clear(input);
    await user.type(input, "Cancel this{Escape}");
    expect(onRename).toHaveBeenCalledTimes(1);
    expect(input).toHaveValue("Server name");
  });

  it("restores the server name after a failed save", async () => {
    const user = userEvent.setup();
    renderRow(vi.fn().mockRejectedValue(new Error("Rename conflict")));
    const input = screen.getByLabelText("Rename saved workout");
    await user.clear(input);
    await user.type(input, "New name{Enter}");
    expect(await screen.findByText("Rename conflict")).toBeInTheDocument();
    expect(input).toHaveValue("Server name");
  });
});
