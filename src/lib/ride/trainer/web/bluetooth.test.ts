import { describe, expect, it } from "vitest";
import { checkWebBluetoothSupport, describeUuid, fullUuid, trainerRequestOptions } from "./bluetooth";
import type { BluetoothLike } from "./bluetooth";

const bluetooth = (available: boolean): BluetoothLike => ({
  requestDevice: async () => {
    throw new Error("unused");
  },
  getAvailability: async () => available,
});

describe("checkWebBluetoothSupport", () => {
  it("requires a secure context, the API and an adapter", async () => {
    expect(await checkWebBluetoothSupport({ isSecureContext: false, navigator: { bluetooth: bluetooth(true) } })).toEqual({
      supported: false,
      reason: "insecureContext",
    });
    expect(await checkWebBluetoothSupport({ isSecureContext: true, navigator: {} })).toEqual({ supported: false, reason: "noApi" });
    expect(await checkWebBluetoothSupport({ isSecureContext: true, navigator: { bluetooth: bluetooth(false) } })).toEqual({
      supported: false,
      reason: "noAdapter",
    });
    expect((await checkWebBluetoothSupport({ isSecureContext: true, navigator: { bluetooth: bluetooth(true) } })).supported).toBe(true);
  });
});

describe("uuids", () => {
  it("expands 16-bit UUIDs and names known ones", () => {
    expect(fullUuid(0x1826)).toBe("00001826-0000-1000-8000-00805f9b34fb");
    expect(describeUuid("00002AD2-0000-1000-8000-00805f9b34fb")).toBe("indoorBikeData (0x2AD2)");
    expect(describeUuid("0000abcd-0000-1000-8000-00805f9b34fb")).toBe("0xABCD");
  });

  it("lists every service the trainer layer reads in the chooser request", () => {
    expect(trainerRequestOptions.filters).toEqual([{ services: [0x1826] }, { services: [0x1818] }]);
    expect(trainerRequestOptions.optionalServices).toEqual([0x1826, 0x1818, 0x1816, 0x180d, 0x180a, "a026ee01-0a7d-4ab3-97fa-f1500f9feb8b"]);
  });
});
