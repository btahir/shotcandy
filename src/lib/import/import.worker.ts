/// <reference lib="webworker" />
/**
 * Import worker: reads, validates, hashes and decodes screenshots, and makes
 * the palette, the editing proxy and a small thumbnail off the main thread
 * (the same engine code as a main-thread import, on OffscreenCanvas).
 */
import { ImportError, importImage } from "@/engine";
import type { DecodeRequest, DecodeResponse } from "./protocol";

declare const self: DedicatedWorkerGlobalScope;

function post(msg: DecodeResponse, transfer: Transferable[] = []) {
  self.postMessage(msg, transfer);
}

async function toBitmap(img: CanvasImageSource): Promise<ImageBitmap> {
  if (img instanceof ImageBitmap) return img;
  if (img instanceof OffscreenCanvas) return img.transferToImageBitmap();
  return createImageBitmap(img as ImageBitmapSource);
}

// One image at a time keeps memory flat (a 5K screenshot decodes to ~60 MB).
let chain: Promise<unknown> = Promise.resolve();

self.onmessage = (e: MessageEvent<DecodeRequest>) => {
  const req = e.data;
  chain = chain.then(async () => {
    try {
      const img = await importImage(req.blob);
      const s = Math.min(1, req.thumbSide / Math.max(img.width, img.height));
      const thumb = await createImageBitmap(img.proxy as ImageBitmapSource, {
        resizeWidth: Math.max(1, Math.round(img.width * s)),
        resizeHeight: Math.max(1, Math.round(img.height * s)),
        resizeQuality: "medium",
      });
      let proxy: ImageBitmap | null = null;
      if (req.proxy) proxy = await toBitmap(img.proxy);
      else (img.proxy as { close?: () => void }).close?.();
      post(
        {
          job: req.job,
          ok: true,
          id: img.id,
          mime: img.mime,
          width: img.width,
          height: img.height,
          palette: req.palette ? img.palette : null,
          thumb,
          proxy,
        },
        proxy ? [thumb, proxy] : [thumb],
      );
    } catch (err) {
      post({
        job: req.job,
        ok: false,
        code: err instanceof ImportError ? err.code : null,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });
};
