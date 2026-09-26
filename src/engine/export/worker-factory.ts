/**
 * Default export-worker factory. Kept out of the engine barrel because the
 * `new URL(..., import.meta.url)` pattern is bundler-specific (Next.js,
 * webpack, Turbopack and Vite all resolve it); import it directly from app
 * code: `import { createExportWorker } from "@/engine/export/worker-factory"`.
 */
export function createExportWorker(): Worker {
  return new Worker(new URL("./export.worker.ts", import.meta.url), {
    type: "module",
    name: "shotcandy-export",
  });
}
