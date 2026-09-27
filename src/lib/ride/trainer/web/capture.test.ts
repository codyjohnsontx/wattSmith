import { describe, expect, it } from "vitest";
import { ManualClock } from "../SimulatedTrainer";
import { CAPTURE_FILE_PATTERN, captureFileName, CaptureRecorder, parseCaptureFile } from "./capture";
import { characteristicDecoders, fromHex } from "./codec";
import { FakeFtmsDevice } from "./FakeFtmsDevice";
import { WebBluetoothTrainer } from "./WebBluetoothTrainer";

async function settle(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
}

describe("byte capture", () => {
  it("names files so the recorded-capture test picks them up", () => {
    for (const firmware of ["4.2.1", "4.2.1 (build 7)", undefined]) {
      expect(captureFileName(firmware)).toMatch(CAPTURE_FILE_PATTERN);
    }
    expect(captureFileName("4.2.1 (build 7)")).toBe("kickr-core-4.2.1_build_7_.json");
    // A browser's duplicate-download suffix still matches.
    expect("kickr-core-4.2.1 (1).json").toMatch(CAPTURE_FILE_PATTERN);
  });

  it("records what the trainer layer sees into a file the tests can decode", async () => {
    const clock = new ManualClock();
    const trainer = new WebBluetoothTrainer(new FakeFtmsDevice(clock), { clock, wahooFallback: false });
    const recorder = new CaptureRecorder(clock.now());
    trainer.on("diagnostic", (event) => {
      if (event.type === "notification") recorder.add(event);
    });
    const connecting = trainer.connect();
    for (let i = 0; i < 50; i += 1) {
      clock.advance(10);
      await settle();
    }
    await connecting;
    for (let i = 0; i < 300; i += 1) {
      clock.advance(10);
      await settle();
    }

    const json = JSON.stringify(
      recorder.toFile({ device: trainer.name, deviceInformation: trainer.diagnostics.deviceInformation, recordedAt: "2026-09-27T00:00:00.000Z", userAgent: "test" }),
    );
    const capture = parseCaptureFile(json);
    const kinds = new Set(capture.notifications.map((n) => n.characteristic));
    expect(kinds).toEqual(
      new Set(["fitnessMachineFeature", "supportedPowerRange", "cyclingPowerFeature", "controlPointResponse", "indoorBikeData", "cyclingPowerMeasurement"]),
    );
    for (const { characteristic, hex } of capture.notifications) {
      expect(() => characteristicDecoders[characteristic](fromHex(hex))).not.toThrow();
    }
  });

  it("rejects captures the recorder would not write", () => {
    expect(() => parseCaptureFile(JSON.stringify({ notifications: [] }))).toThrow(/no notifications/);
    expect(() => parseCaptureFile(JSON.stringify({ notifications: [{ characteristic: "wahooTrainer", hex: "01", tMs: 0 }] }))).toThrow(
      /malformed/,
    );
  });
});
