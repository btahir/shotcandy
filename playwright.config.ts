import { defineConfig, devices } from "@playwright/test";

/**
 * Projects
 *  - engine: renderer in a real browser via a bundled harness (visual
 *    regression, export correctness, worker parity). Chromium.
 *  - bench: 4K export and interaction timing. Chromium.
 *  - app / app-firefox / app-webkit: the static build (`out/`) served by a
 *    plain file server; paste, drop, export, clipboard and persistence.
 */
export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  timeout: 120_000,
  expect: {
    toMatchSnapshot: { maxDiffPixelRatio: 0.002, threshold: 0.1 },
  },
  fullyParallel: true,
  reporter: [["list"]],
  snapshotPathTemplate:
    "{testDir}/__snapshots__/{testFilePath}/{arg}{-projectName}{-platform}{ext}",
  use: { trace: "retain-on-failure" },
  webServer: [
    {
      command: "node scripts/serve-static.mjs tests/e2e/.harness 4284",
      port: 4284,
      reuseExistingServer: false,
    },
    { command: "node scripts/serve-static.mjs out 4283", port: 4283, reuseExistingServer: false },
  ],
  projects: [
    {
      name: "engine",
      testMatch: /engine\/.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:4284" },
    },
    {
      name: "bench",
      testMatch: /bench\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:4284" },
    },
    {
      name: "app",
      testMatch: /app\/.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:4283" },
    },
    {
      name: "app-firefox",
      testMatch: /app\/.*\.spec\.ts/,
      use: { ...devices["Desktop Firefox"], baseURL: "http://127.0.0.1:4283" },
    },
    {
      name: "app-webkit",
      testMatch: /app\/.*\.spec\.ts/,
      use: { ...devices["Desktop Safari"], baseURL: "http://127.0.0.1:4283" },
    },
  ],
});
