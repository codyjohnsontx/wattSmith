// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProfileSettings } from "./ProfileSettings";
import { defaultProfile } from "@/lib/workout/storage";

describe("ProfileSettings Strava disconnect while Strava is off", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("offers only a disconnect control for a stored connection and removes it", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ProfileSettings initialProfile={defaultProfile} stravaEnabled={false} hasStoredStravaConnection />);

    expect(screen.queryByRole("link", { name: "Manage Strava connection" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Connect Strava/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Disconnect Strava" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/integrations/strava", expect.objectContaining({ method: "DELETE" }));
    expect(await screen.findByText("Strava disconnected.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Disconnect Strava" })).not.toBeInTheDocument();
  });

  it("keeps the control and shows the error when disconnect fails", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "Database unavailable." }, { status: 500 })));
    render(<ProfileSettings initialProfile={defaultProfile} stravaEnabled={false} hasStoredStravaConnection />);

    await user.click(screen.getByRole("button", { name: "Disconnect Strava" }));

    expect(await screen.findByText("Database unavailable.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Disconnect Strava" })).toBeInTheDocument();
  });

  it("shows no Strava control when no connection is stored", () => {
    render(<ProfileSettings initialProfile={defaultProfile} stravaEnabled={false} hasStoredStravaConnection={false} />);

    expect(screen.queryByRole("button", { name: "Disconnect Strava" })).not.toBeInTheDocument();
  });
});
