import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // The ride engine and file formats are shared with a future phone app, so
  // they stay platform neutral: no React, Next, DOM, timers or wall clock.
  // Time enters only through event timestamps.
  {
    files: ["src/lib/ride/engine/**", "src/lib/ride/formats/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["react", "react/*", "react-dom", "react-dom/*", "next", "next/*", "next-auth", "next-auth/*"],
              message: "The ride engine is platform neutral; keep React and Next out of it.",
            },
            {
              group: ["@/components/*", "@/app/*", "@/lib/server/*", "@/lib/ride/trainer/*"],
              message: "The ride engine must not depend on UI, server or trainer code.",
            },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        ...[
          "window",
          "document",
          "navigator",
          "localStorage",
          "sessionStorage",
          "indexedDB",
          "setTimeout",
          "setInterval",
          "clearTimeout",
          "clearInterval",
          "requestAnimationFrame",
          "performance",
        ].map((name) => ({ name, message: "Pass time and platform services in through events." })),
      ],
      "no-restricted-properties": [
        "error",
        { object: "Date", property: "now", message: "Use the event's nowMs instead of the wall clock." },
        { object: "Math", property: "random", message: "The engine must be deterministic." },
        { object: "globalThis", message: "Pass platform services in through events." },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: "Use the event's nowMs instead of the wall clock.",
        },
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
