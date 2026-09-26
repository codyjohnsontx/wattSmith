import { join } from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// The engine is shared with a future phone app, so lint must reject React,
// Next, DOM, Node, timers and the wall clock inside src/lib/ride/engine,
// however they are reached.

const probePath = join(process.cwd(), "src/lib/ride/engine/boundaryProbe.ts");

async function ruleIds(code: string): Promise<string[]> {
  const eslint = new ESLint({ cwd: process.cwd() });
  const [result] = await eslint.lintText(code, { filePath: probePath });
  return result.messages.map((message) => message.ruleId ?? message.message);
}

describe("ride engine platform boundary", () => {
  it.each([
    ['import { useState } from "react";\nexport const x = useState;', "no-restricted-imports"],
    ['import Link from "next/link";\nexport const x = Link;', "no-restricted-imports"],
    ['import { SimulatedTrainer } from "@/lib/ride/trainer/SimulatedTrainer";\nexport const x = SimulatedTrainer;', "no-restricted-imports"],
    ["export const x = window.innerWidth;", "no-restricted-globals"],
    ["export const x = navigator.bluetooth;", "no-restricted-globals"],
    ["export const x = setTimeout(() => {}, 1);", "no-restricted-globals"],
    ['import { SimulatedTrainer } from "../trainer/SimulatedTrainer";\nexport const x = SimulatedTrainer;', "no-restricted-imports"],
    ['import { WorkoutChart } from "../../../components/WorkoutChart";\nexport const x = WorkoutChart;', "no-restricted-imports"],
    ['import { requireUser } from "@/lib/server/auth";\nexport const x = requireUser;', "no-restricted-imports"],
    ['import fs from "node:fs";\nexport const x = fs;', "no-restricted-imports"],
    ['import { EventEmitter } from "events";\nexport const x = EventEmitter;', "no-restricted-imports"],
    ['export const x = import("react");', "no-restricted-syntax"],
    ["export const x = process.env;", "no-restricted-globals"],
    ["export const x = Buffer.from([]);", "no-restricted-globals"],
    ['export const x = require("fs");', "no-restricted-globals"],
    ["export const x = location.href;", "no-restricted-globals"],
    ["export const x = history.length;", "no-restricted-globals"],
    ["export const x = HTMLElement;", "no-restricted-globals"],
    ['export const x = () => alert("hi");', "no-restricted-globals"],
    ["export const x = crypto.randomUUID();", "no-restricted-globals"],
    ["export const x = globalThis;", "no-restricted-globals"],
    ["export const x = Date.now();", "no-restricted-properties"],
    ["export const x = Math.random();", "no-restricted-properties"],
    ["export const x = new Date();", "no-restricted-syntax"],
  ])("lint rejects %s", async (code, rule) => {
    expect(await ruleIds(code)).toContain(rule);
  }, 30_000);

  it("lint accepts plain engine code", async () => {
    const code = [
      'import { flattenWorkout } from "@/lib/workout/flatten";',
      'import type { ActivityStreamSet } from "@/lib/activity/types";',
      'import { targetAt } from "./targets";',
      "export const x = [flattenWorkout, targetAt, Math.round(1.5), new Date(0), JSON.stringify({})];",
      "export type Y = ActivityStreamSet;",
    ].join("\n");
    expect(await ruleIds(code)).toEqual([]);
  }, 30_000);
});
