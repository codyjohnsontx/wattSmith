import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import vm from "node:vm";

// Every browser and Node global Next's config declares, minus the ECMAScript
// built-ins (read from an empty V8 context), is off limits in the ride engine.
const ecmaScriptGlobals = new Set(Object.getOwnPropertyNames(vm.runInNewContext("globalThis")));
const platformGlobals = [
  ...new Set(nextVitals.flatMap((config) => Object.keys(config.languageOptions?.globals ?? {}))),
].filter((name) => !ecmaScriptGlobals.has(name));
const platformMessage = "The ride engine is platform neutral: pass time and platform services in through events.";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // The ride engine, file formats and Bluetooth byte codec are shared with a future phone app, so
  // they stay platform neutral: no React, Next, DOM, Node, timers or wall
  // clock. Time enters only through event timestamps.
  {
    files: ["src/lib/ride/engine/**", "src/lib/ride/formats/**", "src/lib/ride/trainer/web/codec.ts"],
    // Tests run only under Vitest and may import it.
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              // Allow-list: sibling files and platform-neutral app modules only.
              // Packages, Node built-ins, "../" escapes and every other alias fail.
              regex: "^(?!\\./|@/lib/(workout|ride/engine|ride/formats)(/|$)|@/lib/activity/types$)",
              message:
                "The ride engine is platform neutral: import only ./siblings, @/lib/workout, @/lib/activity/types and @/lib/ride/{engine,formats}.",
            },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        { name: "globalThis", message: platformMessage },
        ...platformGlobals.map((name) => ({ name, message: platformMessage })),
      ],
      "no-restricted-properties": [
        "error",
        { object: "Date", property: "now", message: "Use the event's nowMs instead of the wall clock." },
        { object: "Math", property: "random", message: "The engine must be deterministic." },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: "Use the event's nowMs instead of the wall clock.",
        },
        { selector: "ImportExpression", message: "The ride engine does not load code dynamically." },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
