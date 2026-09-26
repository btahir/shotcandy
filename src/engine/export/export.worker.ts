/// <reference lib="webworker" />
/**
 * Export worker: renders and encodes off the main thread with OffscreenCanvas,
 * using exactly the same engine code as the preview.
 */
import { decodeAssets, exportWithResolver } from "./export";
import type { WorkerRequest, WorkerResponse } from "./protocol";
import type { FontDefinition } from "../render/fonts";

declare const self: DedicatedWorkerGlobalScope;

const loadedFonts = new Set<string>();

async function ensureFonts(fonts: FontDefinition[]): Promise<void> {
  const set = (self as unknown as { fonts?: FontFaceSet }).fonts;
  if (!set || typeof FontFace === "undefined") return;
  const jobs: Promise<unknown>[] = [];
  for (const f of fonts) {
    for (const src of f.sources ?? []) {
      const key = `${f.id}|${src.url}|${src.weight ?? ""}|${src.style ?? ""}`;
      if (loadedFonts.has(key)) continue;
      loadedFonts.add(key);
      const family = f.stack
        .split(",")[0]!
        .trim()
        .replace(/^["']|["']$/g, "");
      const face = new FontFace(family, `url(${src.url})`, {
        ...(src.weight ? { weight: src.weight } : {}),
        ...(src.style ? { style: src.style } : {}),
      });
      set.add(face);
      jobs.push(face.load());
    }
  }
  await Promise.all(jobs);
}

function post(msg: WorkerResponse): void {
  self.postMessage(msg);
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  if (req.type !== "export") return;
  try {
    await ensureFonts(req.fonts);
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
  fonts: typeof (self as unknown as { fonts?: unknown }).fonts !== "undefined",
  offscreen: typeof OffscreenCanvas !== "undefined",
});
