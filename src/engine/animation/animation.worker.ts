/// <reference lib="webworker" />
/**
 * Animation worker: evaluates, renders and encodes every frame off the main
 * thread with OffscreenCanvas and WebCodecs, using the same engine code as
 * the preview. One worker per export; the page terminates it to cancel.
 */
import { decodeAssets } from "../export/export";
import { ensureWorkerFonts, workerHasFonts } from "../export/worker-fonts";
import { renderAnimation } from "./export";
import type { AnimationWorkerRequest, AnimationWorkerResponse } from "./protocol";

declare const self: DedicatedWorkerGlobalScope;

function post(msg: AnimationWorkerResponse): void {
  self.postMessage(msg);
}

self.onmessage = async (e: MessageEvent<AnimationWorkerRequest>) => {
  const req = e.data;
  if (req.type !== "animate") return;
  try {
    await ensureWorkerFonts(req.fonts);
    const { resolver, release } = await decodeAssets(req.assets);
    try {
      let last = 0;
      const result = await renderAnimation(req.scene, resolver, req.options, undefined, {
        via: "worker",
        onProgress: (progress) => {
          // Throttle progress messages to ~30 per second.
          const now = performance.now();
          if (now - last > 33 || progress.done === progress.total) {
            last = now;
            post({ type: "progress", progress });
          }
        },
        yieldNow: () => Promise.resolve(),
      });
      post({ type: "result", result });
    } finally {
      release();
    }
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};

post({
  type: "ready",
  fonts: workerHasFonts(),
  offscreen: typeof OffscreenCanvas !== "undefined",
  video: typeof VideoEncoder !== "undefined" && typeof VideoFrame !== "undefined",
});
