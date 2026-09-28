// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadFitFile } from "./downloadFit";

describe("downloadFitFile", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("saves the bytes as a FIT blob under the given name", async () => {
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
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:ride");
  });
});
