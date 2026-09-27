// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TrainerDiagnostics } from "./TrainerDiagnostics";

describe("TrainerDiagnostics browser support", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("explains that the browser has no Web Bluetooth and offers the simulated trainer", async () => {
    render(<TrainerDiagnostics fake={false} />);
    expect(await screen.findByRole("heading", { name: "This browser cannot talk to a trainer" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Preview this page with a simulated trainer" })).toHaveAttribute(
      "href",
      "/ride/devices?device=fake",
    );
  });

  it("explains the secure context requirement", async () => {
    vi.stubGlobal("isSecureContext", false);
    render(<TrainerDiagnostics fake={false} />);
    expect(await screen.findByRole("heading", { name: "This page needs a secure connection" })).toBeInTheDocument();
  });

  it("shows the full page with the simulated trainer", () => {
    render(<TrainerDiagnostics fake />);
    expect(screen.getByRole("button", { name: "Connect trainer" })).toBeEnabled();
    expect(screen.getByText(/Simulated trainer: no Bluetooth is used/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set 150 W" })).toBeDisabled();
  });
});
