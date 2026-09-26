// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDemoActivityDetail } from "@/lib/activity/demoFixture";
import { createPeakDemandPrescription } from "@/lib/activity/prescription";
import { saveActivityPrescriptionDraft } from "@/lib/activity/prescriptionStorage";
import { apiRequest } from "@/lib/client/api";
import { cloneDefaultWorkout } from "@/lib/workout/defaultWorkout";
import { defaultProfile } from "@/lib/workout/storage";
import type { Workout } from "@/lib/workout/types";
import type { ImportedWorkout } from "./ImportWorkoutButton";
import { WorkoutWorkspace } from "./WorkoutWorkspace";

vi.mock("@/lib/client/api", () => ({ apiRequest: vi.fn() }));
vi.mock("@/components/WorkoutChart", () => ({ WorkoutChart: () => null }));
vi.mock("@/components/WorkoutSummary", () => ({ WorkoutSummary: () => null }));
vi.mock("@/components/ExportPanel", () => ({ ExportPanel: () => null }));
vi.mock("@/components/ProfilePanel", () => ({ ProfilePanel: () => null }));
vi.mock("@/components/WorkoutEditor", () => ({
  WorkoutEditor: ({ workout, onChange }: { workout: Workout; onChange: (workout: Workout) => void }) => (
    <div>
      <span>Current: {workout.name}</span>
      <button type="button" onClick={() => onChange({ ...workout, name: `${workout.name}!` })}>Edit draft</button>
    </div>
  ),
}));
vi.mock("@/components/WorkoutLibrary", () => ({
  WorkoutLibrary: ({ workouts, onDeleteWorkout, onToggleFavorite, onImportWorkout }: {
    workouts: Workout[];
    onDeleteWorkout: (id: string) => void;
    onToggleFavorite: (id: string) => void;
    onImportWorkout: (draft: ImportedWorkout) => void;
  }) => (
    <div>
      <button type="button" onClick={() => onDeleteWorkout(workouts[0].id)}>Delete active</button>
      <button type="button" onClick={() => onToggleFavorite(workouts[0].id)}>Favorite active</button>
      <button
        type="button"
        onClick={() => onImportWorkout({
          workout: { ...cloneDefaultWorkout(), id: "imported-1", name: "Imported ride" },
          warnings: ["Free ride block: no ERG target."],
          fileName: "ride.zwo",
          format: "zwo",
        })}
      >
        Import fixture
      </button>
    </div>
  ),
}));

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

const serverWorkout = { ...cloneDefaultWorkout(), id: "saved-1", name: "Server workout" };

describe("WorkoutWorkspace save reliability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    (apiRequest as unknown as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url === "/api/profile") return Promise.resolve(defaultProfile);
      if (url === "/api/workouts") return Promise.resolve([serverWorkout]);
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it("consumes a selected activity demand as an unsaved builder draft", async () => {
    const detail = getDemoActivityDetail();
    const effort = detail.analysis.peakEfforts.find((item) => item.durationSeconds === 300);
    expect(effort).toBeDefined();
    const draft = createPeakDemandPrescription({
      effort: effort!,
      ftp: detail.analysis.ftp,
      sourcePath: `/demo/activities/${detail.activity.id}`,
      sourceType: "synthetic-demo",
    });
    expect(draft).not.toBeNull();
    saveActivityPrescriptionDraft(draft!);

    render(<WorkoutWorkspace initialTab="library" />);

    expect(await screen.findByText("Current: 5 min demand rehearsal")).toBeInTheDocument();
    expect(screen.getByText("Draft from selected demand")).toBeInTheDocument();
    expect(screen.getByText("Unsaved")).toBeInTheDocument();
    expect(window.sessionStorage.getItem("wattsmith.activity-prescription-draft.v1")).toBeNull();
  });

  it("preserves edits made after a workout save was submitted", async () => {
    const user = userEvent.setup();
    const save = deferred<Workout>();
    (apiRequest as unknown as ReturnType<typeof vi.fn>).mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/profile") return Promise.resolve(defaultProfile);
      if (url === "/api/workouts" && !init) return Promise.resolve([serverWorkout]);
      if (url === "/api/workouts" && init?.method === "POST") return save.promise;
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });
    render(<WorkoutWorkspace />);
    expect(await screen.findByText("Current: Server workout")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit draft" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await user.click(screen.getByRole("button", { name: "Edit draft" }));
    await act(async () => save.resolve({ ...serverWorkout, name: "Server workout!" }));
    expect(screen.getByText("Current: Server workout!!")).toBeInTheDocument();
    expect(screen.getByText("Unsaved")).toBeInTheDocument();
  });

  it("does not delete a dirty active workout when discard is rejected", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<WorkoutWorkspace />);
    expect(await screen.findByText("Current: Server workout")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit draft" }));
    await user.click(screen.getByRole("button", { name: "Library" }));
    await user.click(screen.getByRole("button", { name: "Delete active" }));
    expect(confirm).toHaveBeenCalled();
    expect(apiRequest).not.toHaveBeenCalledWith("/api/workouts/saved-1", { method: "DELETE" });
  });

  it("keeps favorite changes outside the dirty fingerprint", async () => {
    const user = userEvent.setup();
    (apiRequest as unknown as ReturnType<typeof vi.fn>).mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/profile") return Promise.resolve(defaultProfile);
      if (url === "/api/workouts") return Promise.resolve([serverWorkout]);
      if (url === "/api/workouts/saved-1" && init?.method === "PATCH") {
        return Promise.resolve({ ...serverWorkout, favorite: true, updatedAt: "2026-07-16T00:00:00.000Z" });
      }
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });
    render(<WorkoutWorkspace />);
    expect(await screen.findByText("Current: Server workout")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Library" }));
    await user.click(screen.getByRole("button", { name: "Favorite active" }));
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  it("opens an imported file as an unsaved builder draft with its warnings", async () => {
    const user = userEvent.setup();
    render(<WorkoutWorkspace initialTab="library" />);
    await user.click(await screen.findByRole("button", { name: "Import fixture" }));

    expect(screen.getByText("Current: Imported ride")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Import report" })).toHaveTextContent("ride.zwo · 1 warning");
    expect(screen.getByText("Free ride block: no ERG target.")).toBeInTheDocument();
    expect(screen.getByText("Unsaved")).toBeInTheDocument();
    expect(apiRequest).not.toHaveBeenCalledWith("/api/workouts", expect.objectContaining({ method: "POST" }));

    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("region", { name: "Import report" })).not.toBeInTheDocument();
  });

  it("drops the unsaved draft notice from the import report once the draft is saved", async () => {
    const user = userEvent.setup();
    (apiRequest as unknown as ReturnType<typeof vi.fn>).mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/profile") return Promise.resolve(defaultProfile);
      if (url === "/api/workouts" && !init) return Promise.resolve([serverWorkout]);
      if (url === "/api/workouts" && init?.method === "POST") return Promise.resolve(JSON.parse(String(init.body)));
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });
    render(<WorkoutWorkspace initialTab="library" />);
    await user.click(await screen.findByRole("button", { name: "Import fixture" }));
    const report = screen.getByRole("region", { name: "Import report" });
    expect(report).toHaveTextContent("This is an unsaved draft.");

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(report).not.toHaveTextContent("This is an unsaved draft.");
    expect(report).toHaveTextContent("Free ride block: no ERG target.");

    await user.click(screen.getByRole("button", { name: "Edit draft" }));
    expect(report).toHaveTextContent("This is an unsaved draft.");
  });

  it("keeps the current draft when discarding it for an import is rejected", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<WorkoutWorkspace />);
    expect(await screen.findByText("Current: Server workout")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit draft" }));
    await user.click(screen.getByRole("button", { name: "Library" }));
    await user.click(screen.getByRole("button", { name: "Import fixture" }));
    await user.click(screen.getByRole("button", { name: "Builder" }));
    expect(screen.getByText("Current: Server workout!")).toBeInTheDocument();
  });
});
