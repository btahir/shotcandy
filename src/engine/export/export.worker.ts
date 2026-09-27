/// <reference lib="webworker" />
/**
 * Export worker: renders and encodes off the main thread with OffscreenCanvas,
 * using exactly the same engine code as the preview.
 */
import { decodeAssets, exportWithResolver } from "./export";
import type { WorkerRequest, WorkerResponse } from "./protocol";
import { ensureWorkerFonts, workerHasFonts } from "./worker-fonts";

declare const self: DedicatedWorkerGlobalScope;

function post(msg: WorkerResponse): void {
  self.postMessage(msg);
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  if (req.type !== "export") return;
  try {
    await ensureWorkerFonts(req.fonts);
    const { resolver, release } = await decodeAssets(req.assets);
    try {
      const r = await exportWithResolver(req.scene, resolver, req.options, undefined, "worker");
      post({
        type: "result",
        id: req.id,
        blob: r.blob,
        width: r.width,
        height: r.height,
        mime: r.mime,
        renderMs: r.renderMs,
        encodeMs: r.encodeMs,
      });
    } finally {
      release();
    }
  } catch (err) {
    post({ type: "error", id: req.id, message: err instanceof Error ? err.message : String(err) });
  }
};

post({
  type: "ready",
  fonts: workerHasFonts(),
  offscreen: typeof OffscreenCanvas !== "undefined",
});
