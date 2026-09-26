/**
 * Browser test harness: exposes the engine on `window.harness` so Playwright
 * can render reference scenes, export, and benchmark in a real browser with
 * no app UI involved. Bundled by tests/e2e/global-setup.ts.
 */
import {
  Exporter,
  RenderCache,
  exportScene,
  importImage,
  layoutScene,
  outputSize,
  renderScene,
  type AssetSource,
  type ExportFormat,
  type Scene,
} from "@/engine";

const sources = new Map<string, AssetSource>();
const originals = new Map<string, { blob: Blob; width: number; height: number }>();
const resolver = { get: (id: string) => sources.get(id) };
const cache = new RenderCache();
const exporter = new Exporter({
  createWorker: () => new Worker("./export.worker.js", { type: "module" }),
});

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.readAsDataURL(blob);
  });
}

function pngDims(bytes: Uint8Array): { width: number; height: number } {
  const v = new DataView(bytes.buffer, bytes.byteOffset);
  return { width: v.getUint32(16), height: v.getUint32(20) };
}

const harness = {
  /** Load an image by URL as asset `id` (through the real import pipeline). */
  async load(id: string, url: string, maxProxySide?: number) {
    const blob = await (await fetch(url)).blob();
    const img = await importImage(blob, maxProxySide ? { maxProxySide } : {});
    const images = [{ image: img.proxy, width: img.proxyWidth, height: img.proxyHeight }];
    if (img.original && img.original !== img.proxy)
      images.push({ image: img.original, width: img.width, height: img.height });
    sources.set(id, { id, width: img.width, height: img.height, images, palette: img.palette });
    originals.set(id, { blob: img.blob, width: img.width, height: img.height });
    return { width: img.width, height: img.height, proxyWidth: img.proxyWidth };
  },

  /** Make a synthetic large image (drawn from an existing asset, upscaled). */
  async synth(id: string, fromId: string, width: number, height: number) {
    const src = sources.get(fromId)!;
    const c = new OffscreenCanvas(width, height);
    const g = c.getContext("2d")!;
    g.imageSmoothingQuality = "high";
    g.drawImage(src.images[src.images.length - 1]!.image, 0, 0, width, height);
    const blob = await c.convertToBlob({ type: "image/png" });
    const img = await importImage(blob);
    const images = [{ image: img.proxy, width: img.proxyWidth, height: img.proxyHeight }];
    if (img.original && img.original !== img.proxy)
      images.push({ image: img.original, width: img.width, height: img.height });
    sources.set(id, { id, width, height, images, palette: img.palette });
    originals.set(id, { blob: img.blob, width, height });
    return { width, height, proxyWidth: img.proxyWidth };
  },

  /** Render to a PNG data URL (for visual baselines). */
  async render(scene: Scene, scale = 1, fresh = false) {
    const layout = layoutScene(scene, resolver);
    const size = outputSize(layout, scale);
    const canvas = new OffscreenCanvas(size.width, size.height);
    const t0 = performance.now();
    renderScene(canvas.getContext("2d")!, scene, resolver, {
      scale,
      cache: fresh ? new RenderCache() : cache,
    });
    const ms = performance.now() - t0;
    const blob = await canvas.convertToBlob({ type: "image/png" });
    return { dataUrl: await blobToDataUrl(blob), width: size.width, height: size.height, ms };
  },

  /** Time repeated preview renders (interaction latency). */
  previewTimings(scenes: Scene[], maxSide: number) {
    const times: number[] = [];
    const canvas = document.createElement("canvas");
    for (const scene of scenes) {
      const t0 = performance.now();
      const layout = layoutScene(scene, resolver);
      const s = maxSide / Math.max(layout.canvas.width, layout.canvas.height);
      const size = outputSize(layout, s);
      canvas.width = size.width;
      canvas.height = size.height;
      renderScene(canvas.getContext("2d")!, scene, resolver, { scale: s, cache });
      // Force the GPU work to finish like a real frame would.
      canvas.getContext("2d")!.getImageData(0, 0, 1, 1);
      times.push(performance.now() - t0);
    }
    return times;
  },

  /** Export through the main thread or the worker; returns dims decoded from the file. */
  async export(
    scene: Scene,
    format: ExportFormat,
    scale: number,
    via: "main" | "worker",
    withPixels = false,
  ) {
    const assets = [...originals.entries()]
      .filter(([id]) => JSON.stringify(scene).includes(id))
      .map(([id, o]) => ({
        id,
        ...o,
        ...(sources.get(id)?.palette ? { palette: sources.get(id)!.palette } : {}),
      }));
    const t0 = performance.now();
    const r =
      via === "worker"
        ? await exporter.export(scene, assets, { format, scale })
        : await exportScene(scene, assets, { format, scale });
    const total = performance.now() - t0;
    const bytes = new Uint8Array(await r.blob.arrayBuffer());
    const bmp = await createImageBitmap(r.blob);
    const out: Record<string, unknown> = {
      mime: r.mime,
      via: r.via,
      width: r.width,
      height: r.height,
      decodedWidth: bmp.width,
      decodedHeight: bmp.height,
      headerDims: r.mime === "image/png" ? pngDims(bytes) : null,
      bytes: bytes.length,
      renderMs: r.renderMs,
      encodeMs: r.encodeMs,
      totalMs: total,
    };
    if (withPixels) {
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const g = c.getContext("2d")!;
      g.drawImage(bmp, 0, 0);
      const d = g.getImageData(0, 0, bmp.width, bmp.height).data;
      let h = 0x811c9dc5;
      for (let i = 0; i < d.length; i++) h = Math.imul(h ^ d[i]!, 0x01000193);
      out.pixelHash = (h >>> 0).toString(16);
    }
    bmp.close();
    return out;
  },
};

(window as unknown as { harness: typeof harness }).harness = harness;
(window as unknown as { harnessReady: boolean }).harnessReady = true;
export type Harness = typeof harness;
