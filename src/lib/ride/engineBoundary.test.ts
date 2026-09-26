import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// The engine is shared with a future phone app, so lint must reject React,
// Next, DOM, timers and the wall clock inside src/lib/ride/engine.

const engineDir = join(process.cwd(), "src/lib/ride/engine");
const probePath = join(engineDir, "boundaryProbe.ts");

async function ruleIds(code: string): Promise<string[]> {
  const eslint = new ESLint({ cwd: process.cwd() });
  const [result] = await eslint.lintText(code, { filePath: probePath });
  return result.messages.map((message) => message.ruleId ?? message.message);
}

describe("ride engine platform boundary", () => {
  it("has no React imports", () => {
    const offenders = readdirSync(engineDir).filter((file) =>
      /from ["']react/.test(readFileSync(join(engineDir, file), "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it.each([
    ['import { useState } from "react";\nexport const x = useState;', "no-restricted-imports"],
    ['import Link from "next/link";\nexport const x = Link;', "no-restricted-imports"],
    ['import { SimulatedTrainer } from "@/lib/ride/trainer/SimulatedTrainer";\nexport const x = SimulatedTrainer;', "no-restricted-imports"],
    ["export const x = window.innerWidth;", "no-restricted-globals"],
    ["export const x = navigator.bluetooth;", "no-restricted-globals"],
    ["export const x = setTimeout(() => {}, 1);", "no-restricted-globals"],
    ["export const x = Date.now();", "no-restricted-properties"],
    ["export const x = Math.random();", "no-restricted-properties"],
    ["export const x = new Date();", "no-restricted-syntax"],
  ])("lint rejects %s", async (code, rule) => {
    expect(await ruleIds(code)).toContain(rule);
  }, 30_000);

  it("lint accepts plain engine code", async () => {
    expect(await ruleIds('import { flattenWorkout } from "@/lib/workout/flatten";\nexport const x = flattenWorkout;')).toEqual([]);
  }, 30_000);
});
