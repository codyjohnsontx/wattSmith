import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  characteristicDecoders,
  CodecError,
  crankCadenceRpm,
  decodeIndoorBikeData,
  encodeRequestControl,
  encodeReset,
  encodeSetIndoorBikeSimulation,
  encodeSetTargetPower,
  encodeStartOrResume,
  encodeStopOrPause,
  encodeWahooSetErg,
  encodeWahooUnlock,
  fromHex,
  toHex,
} from "./codec";
import type { CharacteristicName, IndoorBikeSimulation } from "./codec";
import { CAPTURE_FILE_PATTERN, parseCaptureFile } from "./capture";

const fixturesDir = join(__dirname, "fixtures");

interface DecodeVector {
  name: string;
  characteristic: CharacteristicName;
  hex: string;
  expected?: unknown;
  error?: boolean;
}

interface EncodeVector {
  name: string;
  encoder: keyof typeof encoders;
  args: unknown[];
  hex: string;
}

const vectors = JSON.parse(readFileSync(join(fixturesDir, "spec-vectors.json"), "utf8")) as {
  decode: DecodeVector[];
  encode: EncodeVector[];
};

const encoders = {
  requestControl: () => encodeRequestControl(),
  reset: () => encodeReset(),
  startOrResume: () => encodeStartOrResume(),
  stopOrPause: (action: unknown) => encodeStopOrPause(action as "stop" | "pause"),
  setTargetPower: (watts: unknown) => encodeSetTargetPower(watts as number),
  setIndoorBikeSimulation: (sim: unknown) => encodeSetIndoorBikeSimulation(sim as IndoorBikeSimulation),
  wahooUnlock: () => encodeWahooUnlock(),
  wahooSetErg: (watts: unknown) => encodeWahooSetErg(watts as number),
};

describe("spec byte vectors", () => {
  it.each(vectors.decode.map((v) => [v.name, v] as const))("decodes %s", (_name, vector) => {
    const decode = characteristicDecoders[vector.characteristic];
    const view = fromHex(vector.hex);
    if (vector.error) {
      expect(() => decode(view)).toThrow(CodecError);
    } else {
      expect(decode(view)).toEqual(vector.expected);
    }
  });

  it.each(vectors.encode.map((v) => [v.name, v] as const))("encodes %s", (_name, vector) => {
    const encode = encoders[vector.encoder] as (...args: unknown[]) => DataView;
    expect(toHex(encode(...vector.args))).toBe(vector.hex);
  });
});

// Real notifications recorded on the diagnostics page ("Record 30 s of raw
// notifications") are committed unchanged as fixtures/kickr-core-<firmware>.json.
// Every recorded payload must decode, and trainer power must be plausible.
// Until the owner records one on the KICKR CORE, this suite is skipped.
describe("recorded hardware captures", () => {
  const captures = readdirSync(fixturesDir).filter((file) => CAPTURE_FILE_PATTERN.test(file));

  if (captures.length === 0) it.skip("decodes every notification in a committed capture (none recorded yet)", () => {});
  it.each(captures)("decodes every notification in %s", (file) => {
    const capture = parseCaptureFile(readFileSync(join(fixturesDir, file), "utf8"));
    for (const { characteristic, hex } of capture.notifications) {
      const decoded = characteristicDecoders[characteristic](fromHex(hex)) as { powerWatts?: number };
      if (decoded.powerWatts !== undefined) {
        expect(decoded.powerWatts, hex).toBeGreaterThanOrEqual(0);
        expect(decoded.powerWatts, hex).toBeLessThan(2500);
      }
    }
  });
});

describe("crankCadenceRpm", () => {
  it("derives cadence from revolutions over 1/1024 s ticks", () => {
    const rpm = crankCadenceRpm(
      { cumulativeRevolutions: 500, lastEventTime1024: 51200 },
      { cumulativeRevolutions: 501, lastEventTime1024: 51883 },
    );
    expect(rpm).toBeCloseTo(89.96, 2);
  });

  it("handles rollover of both counters", () => {
    const rpm = crankCadenceRpm(
      { cumulativeRevolutions: 65535, lastEventTime1024: 65000 },
      { cumulativeRevolutions: 1, lastEventTime1024: 829 },
    );
    expect(rpm).toBeCloseTo(90.02, 2);
  });

  it("returns null when no new crank event arrived", () => {
    const reading = { cumulativeRevolutions: 10, lastEventTime1024: 2048 };
    expect(crankCadenceRpm(reading, reading)).toBeNull();
  });
});

describe("hex helpers", () => {
  it("round-trips and accepts separators", () => {
    expect(toHex(fromHex("0A:0b-FF 00"))).toBe("0a 0b ff 00");
  });

  it("rejects malformed hex", () => {
    expect(() => fromHex("abc")).toThrow(CodecError);
    expect(() => fromHex("zz")).toThrow(CodecError);
  });
});

describe("decodeIndoorBikeData", () => {
  it("ignores bytes a vendor appends after the defined fields", () => {
    expect(decodeIndoorBikeData(fromHex("44 00 b8 0b b4 00 96 00 aa"))).toEqual({
      moreData: false,
      speedKmh: 30,
      cadenceRpm: 90,
      powerWatts: 150,
    });
  });

  it("names the missing field when a notification is truncated", () => {
    expect(() => decodeIndoorBikeData(fromHex("44 00 b8 0b b4"))).toThrow(/Instantaneous Cadence/);
  });
});
