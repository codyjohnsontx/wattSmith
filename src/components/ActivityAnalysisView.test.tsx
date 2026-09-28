// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDemoActivityDetail } from "@/lib/activity/demoFixture";
import { ActivityAnalysisView } from "./ActivityAnalysisView";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

describe("ActivityAnalysisView", () => {
  beforeEach(() => {
    push.mockClear();
    window.sessionStorage.clear();
  });

  it("renders deterministic UTC metadata and starts a new path after a stream gap", () => {
    const detail = getDemoActivityDetail();
    detail.analysis.chart = [
      { second: 0, segment: 0, power: 100, heartRate: null, cadence: null, altitude: null },
      { second: 1, segment: 0, power: 200, heartRate: null, cadence: null, altitude: null },
      { second: 2, segment: 1, power: 400, heartRate: null, cadence: null, altitude: null },
      { second: 3, segment: 1, power: 300, heartRate: null, cadence: null, altitude: null },
    ];
    const { container } = render(<ActivityAnalysisView detail={detail} demo />);
    expect(screen.getByText(/Jun 21, 2026, 2:00 PM/)).toBeInTheDocument();
    const powerPath = container.querySelector("svg path");
    expect(powerPath?.getAttribute("d")?.match(/M/g)).toHaveLength(2);
  });

  it("shows the deterministic mapping before creating a builder draft", async () => {
    const user = userEvent.setup();
    render(<ActivityAnalysisView detail={getDemoActivityDetail()} demo />);
    const fiveMinuteRow = screen.getByRole("row", { name: /5 min 237W 28:13/i });

    await user.click(within(fiveMinuteRow).getByRole("button", { name: "Select" }));

    expect(screen.getByText("225W · 84% FTP")).toBeInTheDocument();
    expect(screen.getByText(/3 × 5:00/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create unsaved workout" }));

    expect(push).toHaveBeenCalledWith("/workouts");
    expect(window.sessionStorage.getItem("wattsmith.activity-prescription-draft.v1")).toContain("5 min demand rehearsal");
  });

  it("offers a plain sign-in from the demo when Strava is off", () => {
    render(<ActivityAnalysisView detail={getDemoActivityDetail()} demo />);

    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
    expect(screen.queryByText(/connect Strava/i)).not.toBeInTheDocument();
  });

  it("invites connecting Strava from the demo when Strava is on", () => {
    render(<ActivityAnalysisView detail={getDemoActivityDetail()} demo stravaEnabled />);

    expect(screen.getByRole("link", { name: "Sign in and connect Strava" })).toHaveAttribute("href", "/sign-in");
  });
});
