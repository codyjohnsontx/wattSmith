// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadFitFile, REVOKE_DELAY_MS } from "./downloadFit";

describe("downloadFitFile", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("saves the bytes as a FIT blob under the given name and frees the URL only later", async () => {
    vi.useFakeTimers();
    const createObjectURL = vi.fn((blob: Blob) => (void blob, "blob:ride"));
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    downloadFitFile(new Uint8Array([14, 32, 1, 2]), "wattsmith_ride_2026-09-27.fit");

    const blob = createObjectURL.mock.calls[0][0];
    expect(blob.type).toBe("application/vnd.ant.fit");
    expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual([14, 32, 1, 2]);
    const anchor = click.mock.contexts[0] as HTMLAnchorElement;
    expect(anchor.download).toBe("wattsmith_ride_2026-09-27.fit");
    expect(anchor.href).toBe("blob:ride");
    // The browser may still be reading the URL when click returns.
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(REVOKE_DELAY_MS - 1);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:ride");
  });
});
