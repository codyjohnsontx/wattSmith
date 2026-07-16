// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProfilePanel } from "./ProfilePanel";
import { cloneDefaultWorkout } from "@/lib/workout/defaultWorkout";
import { defaultProfile } from "@/lib/workout/storage";
import { ApiError } from "@/lib/client/api";

describe("ProfilePanel save reliability", () => {
  it("keeps typing local and prevents concurrent saves", async () => {
    const user = userEvent.setup();
    let resolveSave: (value: typeof defaultProfile) => void = () => undefined;
    const onSave = vi.fn(() => new Promise<typeof defaultProfile>((resolve) => { resolveSave = resolve; }));
    render(<ProfilePanel profile={defaultProfile} workout={cloneDefaultWorkout()} integrations={[]} onSave={onSave} onReload={vi.fn()} />);
    const ftp = screen.getByLabelText("FTP");
    await user.clear(ftp);
    await user.type(ftp, "275");
    expect(onSave).not.toHaveBeenCalled();
    const save = screen.getByRole("button", { name: "Save profile" });
    fireEvent.click(save);
    fireEvent.click(save);
    expect(onSave).toHaveBeenCalledTimes(1);
    resolveSave({ ...defaultProfile, ftp: 275 });
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  it("preserves the draft on 409 and offers reload latest", async () => {
    const user = userEvent.setup();
    const onReload = vi.fn().mockResolvedValue(defaultProfile);
    render(<ProfilePanel profile={defaultProfile} workout={cloneDefaultWorkout()} integrations={[]} onSave={vi.fn().mockRejectedValue(new ApiError(409, "Profile changed."))} onReload={onReload} />);
    const goal = screen.getByLabelText("Primary goal");
    await user.clear(goal);
    await user.type(goal, "Race sharper");
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    expect(await screen.findByDisplayValue("Race sharper")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reload latest profile" }));
    expect(onReload).toHaveBeenCalledOnce();
  });

  it("preserves edits made while a profile save is in flight", async () => {
    const user = userEvent.setup();
    let resolveSave: (value: typeof defaultProfile) => void = () => undefined;
    const onSave = vi.fn(() => new Promise<typeof defaultProfile>((resolve) => { resolveSave = resolve; }));
    render(<ProfilePanel profile={defaultProfile} workout={cloneDefaultWorkout()} integrations={[]} onSave={onSave} onReload={vi.fn()} />);
    const goal = screen.getByLabelText("Primary goal");
    await user.clear(goal);
    await user.type(goal, "Submitted goal");
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    await user.clear(goal);
    await user.type(goal, "Newer draft");
    resolveSave({ ...defaultProfile, primaryGoal: "Submitted goal" });
    expect(await screen.findByDisplayValue("Newer draft")).toBeInTheDocument();
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
  });
});
