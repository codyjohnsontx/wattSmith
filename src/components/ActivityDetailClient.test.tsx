// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { apiRequest } from "@/lib/client/api";
import type { ActivityDetail } from "@/lib/activity/types";
import { ActivityDetailClient } from "./ActivityDetailClient";

vi.mock("@/lib/client/api", () => ({ apiRequest: vi.fn() }));
vi.mock("@/components/ActivityAnalysisView", () => ({
  ActivityAnalysisView: ({ detail }: { detail: ActivityDetail }) => <div>{detail.activity.name}</div>,
}));

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

describe("ActivityDetailClient", () => {
  it("ignores a superseded activity response", async () => {
    const first = deferred<ActivityDetail>();
    const second = deferred<ActivityDetail>();
    (apiRequest as unknown as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { rerender } = render(<ActivityDetailClient activityId="1" />);
    rerender(<ActivityDetailClient activityId="2" />);
    first.resolve({ activity: { name: "Old ride" } } as ActivityDetail);
    second.resolve({ activity: { name: "Current ride" } } as ActivityDetail);
    expect(await screen.findByText("Current ride")).toBeInTheDocument();
    expect(screen.queryByText("Old ride")).not.toBeInTheDocument();
  });
});
