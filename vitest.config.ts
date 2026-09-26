import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/render/**/*.test.ts"],
    environment: "node",
    testTimeout: 20000,
    coverage: {
      provider: "v8",
      include: ["src/engine/**/*.ts", "src/state/**/*.ts"],
      exclude: ["src/engine/export/export.worker.ts", "src/engine/index.ts"],
    },
  },
});
