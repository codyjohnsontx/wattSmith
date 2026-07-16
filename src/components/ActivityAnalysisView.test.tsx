// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { getDemoActivityDetail } from "@/lib/activity/demoFixture";
import { ActivityAnalysisView } from "./ActivityAnalysisView";

describe("ActivityAnalysisView", () => {
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
});
