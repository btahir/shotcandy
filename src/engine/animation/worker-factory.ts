/**
 * Default animation-worker factory, kept out of the engine barrel because the
 * `new URL(..., import.meta.url)` pattern is bundler-specific. Import it
 * directly: `import { createAnimationWorker } from "@/engine/animation/worker-factory"`.
 */
export function createAnimationWorker(): Worker {
  return new Worker(new URL("./animation.worker.ts", import.meta.url), {
    type: "module",
    name: "shotcandy-animation",
  });
}
