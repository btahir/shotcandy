/// <reference lib="webworker" />
/**
 * Thumbnail worker: renders style previews of the user's own screenshot off
 * the main thread (OffscreenCanvas), with the same engine as the preview and
 * export. Assets arrive as small ImageBitmaps; built-in wallpapers are loaded
 * here from their thumbnail files.
 */
import {
  type AssetSource,
  type FontDefinition,
  RenderCache,
  isBuiltinAssetId,
  registerFont,
  renderToCanvas,
  sceneAssetIds,
} from "@/engine";
import type { ThumbRequest, ThumbResponse } from "./protocol";

declare const self: DedicatedWorkerGlobalScope;

const assets = new Map<string, AssetSource>();
const pendingBuiltins = new Map<string, Promise<void>>();
const cache = new RenderCache();
let fontsReady: Promise<unknown> = Promise.resolve();

const resolver = { get: (id: string) => assets.get(id) };

function post(msg: ThumbResponse, transfer: Transferable[] = []) {
  self.postMessage(msg, transfer);
}

function loadFonts(fonts: FontDefinition[]) {
  for (const f of fonts) registerFont(f);
  const set = (self as unknown as { fonts?: FontFaceSet }).fonts;
  if (!set || typeof FontFace === "undefined") return Promise.resolve();
  const jobs: Promise<unknown>[] = [];
  for (const f of fonts) {
    const family = f.stack.split(",")[0]!.trim().replace(/^["']|["']$/g, "");
    for (const src of f.sources ?? []) {
      const face = new FontFace(family, `url(${src.url})`, src.weight ? { weight: src.weight } : {});
      set.add(face);
      jobs.push(face.load().catch(() => null));
    }
  }
  return Promise.all(jobs);
}

function loadBuiltin(id: string): Promise<void> {
  let p = pendingBuiltins.get(id);
  if (!p) {
    const name = id.slice("builtin:".length).replace(/[^a-z0-9-]/gi, "");
    p = fetch(`/backgrounds/thumbs/${name}.webp`)
      .then((r) => {
        if (!r.ok) throw new Error(`wallpaper ${name} missing`);
        return r.blob();
      })
      .then((b) => createImageBitmap(b))
      .then((bmp) => {
        assets.set(id, {
          id,
          width: bmp.width,
          height: bmp.height,
          images: [{ image: bmp, width: bmp.width, height: bmp.height }],
        });
      })
      .catch(() => {
        pendingBuiltins.delete(id);
      });
    pendingBuiltins.set(id, p);
  }
  return p;
}

let chain: Promise<unknown> = Promise.resolve();

self.onmessage = (e: MessageEvent<ThumbRequest>) => {
  const msg = e.data;
  if (msg.type === "init") {
    fontsReady = loadFonts(msg.fonts);
    return;
  }
  if (msg.type === "asset") {
    const old = assets.get(msg.id);
    (old?.images[0]?.image as ImageBitmap | undefined)?.close?.();
    assets.set(msg.id, {
      id: msg.id,
      width: msg.width,
      height: msg.height,
      images: [{ image: msg.bitmap, width: msg.bitmap.width, height: msg.bitmap.height }],
      ...(msg.palette ? { palette: msg.palette } : {}),
    });
    return;
  }
  if (msg.type === "drop-asset") {
    const old = assets.get(msg.id);
    (old?.images[0]?.image as ImageBitmap | undefined)?.close?.();
    assets.delete(msg.id);
    return;
  }
  if (msg.type === "render") {
    // Serialize renders: one at a time keeps memory flat and order predictable.
    chain = chain.then(async () => {
      try {
        await fontsReady;
        const builtins = sceneAssetIds(msg.scene).filter(
          (id) => isBuiltinAssetId(id) && !assets.has(id),
        );
        if (builtins.length) await Promise.all(builtins.map(loadBuiltin));
        const { canvas } = renderToCanvas(msg.scene, resolver, { scale: msg.scale, cache });
        const bitmap = (canvas as OffscreenCanvas).transferToImageBitmap();
        post({ type: "done", job: msg.job, bitmap }, [bitmap]);
      } catch (err) {
        post({
          type: "error",
          job: msg.job,
          message: err instanceof Error ? err.message : String(err),
        });
      }
      cache.trim();
    });
  }
};

post({ type: "ready", offscreen: typeof OffscreenCanvas !== "undefined" });
