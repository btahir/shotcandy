import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    files: ["src/engine/**/*.ts"],
    rules: {
      // The engine is framework-free and deterministic: no React, no DOM globals
      // that break in workers, no ambient randomness or clocks.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["react", "react-dom", "next", "next/*"],
              message: "src/engine must stay framework-free.",
            },
            {
              group: ["@/app/*", "@/components/*", "@/state/*"],
              message: "src/engine must not depend on app code.",
            },
          ],
        },
      ],
      "no-restricted-properties": [
        "error",
        {
          object: "Math",
          property: "random",
          message: "Use the seeded PRNG in engine/math/random.ts for determinism.",
        },
        {
          object: "Date",
          property: "now",
          message: "Pass time in explicitly; the engine is deterministic.",
        },
      ],
    },
  },
  {
    // Playwright fixtures call `use()`, which is not a React hook.
    files: ["tests/e2e/**/*.ts"],
    rules: { "react-hooks/rules-of-hooks": "off" },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      // Static export with unoptimized images: plain <img> is intended.
      "@next/next/no-img-element": "off",
      // Mount/unmount animation state and syncing to external stores legitimately
      // set state from effects; the compiler heuristic flags those false positives.
      "react-hooks/set-state-in-effect": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "tests/e2e/.harness/**",
    // Design and launch material is not app code.
    "docs/**",
    "brand/**",
    "notes/**",
    "public/**",
  ]),
]);
