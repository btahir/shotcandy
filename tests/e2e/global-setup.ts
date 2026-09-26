/**
 * Builds the browser harness (engine + test entry, and the export worker) with
 * esbuild into tests/e2e/.harness, alongside fixture images, so the engine
 * suites run in real browsers without the app.
 */
import { cpSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";

const here = __dirname;
const root = resolve(here, "../..");
const out = resolve(here, ".harness");

export default async function globalSetup(): Promise<void> {
  mkdirSync(`${out}/fixtures`, { recursive: true });
  const common = {
    bundle: true,
    format: "esm" as const,
    target: "es2022",
    sourcemap: false,
    alias: { "@": resolve(root, "src") },
    loader: { ".json": "json" as const },
    logLevel: "warning" as const,
  };
  await build({
    ...common,
    entryPoints: [resolve(here, "harness/entry.ts")],
    outfile: `${out}/harness.js`,
  });
  await build({
    ...common,
    entryPoints: [resolve(root, "src/engine/export/export.worker.ts")],
    outfile: `${out}/export.worker.js`,
  });
  writeFileSync(
    `${out}/index.html`,
    `<!doctype html><meta charset="utf-8"><title>Shotcandy harness</title><body><script type="module" src="./harness.js"></script></body>`,
  );
  for (const f of readdirSync(resolve(root, "brand/samples"))) {
    if (f.endsWith(".png")) cpSync(resolve(root, "brand/samples", f), `${out}/fixtures/${f}`);
  }
  for (const f of readdirSync(resolve(root, "brand/backgrounds"))) {
    if (f.endsWith(".webp")) cpSync(resolve(root, "brand/backgrounds", f), `${out}/fixtures/${f}`);
  }
}
