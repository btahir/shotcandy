"use client";
/**
 * Decoding screenshots for batches off the main thread. Each result carries
 * a small thumbnail (always kept) and, when asked, the editing proxy (only
 * kept for the image on stage and its neighbours). Without worker support it
 * decodes on the main thread, yielding between images so the page stays
 * responsive.
 */
import { type ImportErrorCode, type Palette, ImportError, importImage } from "@/engine";
import type { DecodeRequest, DecodeResponse } from "./protocol";

export interface Decoded {
  id: string;
  mime: string;
  width: number;
  height: number;
  palette: Palette | null;
  thumb: ImageBitmap | CanvasImageSource;
  proxy: CanvasImageSource | null;
  proxyWidth: number;
  proxyHeight: number;
}

export const THUMB_SIDE = 320;

type Pending = { resolve: (d: Decoded) => void; reject: (e: Error) => void };

const yieldToPage = () => new Promise<void>((r) => setTimeout(r, 0));

function sizeOf(img: CanvasImageSource): { width: number; height: number } {
  const i = img as unknown as { width: number; height: number };
  return { width: i.width, height: i.height };
}

export class ImportService {
  private worker: Worker | null = null;
  private seq = 0;
  private readonly pending = new Map<number, Pending>();
  /** Time spent blocking the main thread on imports (ms), for tests and tuning. */
  mainThreadMs = 0;

  constructor() {
    if (
      typeof Worker !== "undefined" &&
      typeof OffscreenCanvas !== "undefined" &&
      typeof createImageBitmap === "function"
    ) {
      try {
        this.worker = new Worker(new URL("./import.worker.ts", import.meta.url), {
          type: "module",
          name: "shotcandy-import",
        });
        this.worker.onmessage = (e: MessageEvent<DecodeResponse>) => this.onMessage(e.data);
        this.worker.onerror = () => this.fail();
      } catch {
        this.worker = null;
      }
    }
  }

  get usesWorker(): boolean {
    return !!this.worker;
  }

  private fail() {
    this.worker?.terminate();
    this.worker = null;
    for (const p of this.pending.values()) p.reject(new Error("worker failed"));
    this.pending.clear();
  }

  private onMessage(msg: DecodeResponse) {
    const p = this.pending.get(msg.job);
    if (!p) return;
    this.pending.delete(msg.job);
    if (!msg.ok) {
      p.reject(
        msg.code
          ? new ImportError(msg.code as ImportErrorCode, msg.message)
          : new Error(msg.message),
      );
      return;
    }
    p.resolve({
      id: msg.id,
      mime: msg.mime,
      width: msg.width,
      height: msg.height,
      palette: msg.palette,
      thumb: msg.thumb,
      proxy: msg.proxy,
      proxyWidth: msg.proxy?.width ?? 0,
      proxyHeight: msg.proxy?.height ?? 0,
    });
  }

  /** Decode one image: always a thumbnail and palette, the proxy when `proxy`. */
  async decode(blob: Blob, opts: { proxy: boolean; palette?: boolean }): Promise<Decoded> {
    if (this.worker) {
      const job = ++this.seq;
      const req: DecodeRequest = {
        job,
        blob,
        thumbSide: THUMB_SIDE,
        proxy: opts.proxy,
        palette: opts.palette !== false,
      };
      try {
        return await new Promise<Decoded>((resolve, reject) => {
          this.pending.set(job, { resolve, reject });
          this.worker!.postMessage(req);
        });
      } catch (e) {
        if (e instanceof ImportError) throw e;
        // The worker can't decode here (e.g. no 2D OffscreenCanvas in workers):
        // stop using it and decode on the main thread from now on.
        this.fail();
      }
    }
    await yieldToPage();
    const t0 = performance.now();
    try {
      const img = await importImage(blob);
      const s = Math.min(1, THUMB_SIDE / Math.max(img.width, img.height));
      const thumb = await createImageBitmap(img.proxy as ImageBitmapSource, {
        resizeWidth: Math.max(1, Math.round(img.width * s)),
        resizeHeight: Math.max(1, Math.round(img.height * s)),
        resizeQuality: "medium",
      });
      const size = sizeOf(img.proxy);
      if (!opts.proxy) (img.proxy as { close?: () => void }).close?.();
      return {
        id: img.id,
        mime: img.mime,
        width: img.width,
        height: img.height,
        palette: img.palette,
        thumb,
        proxy: opts.proxy ? img.proxy : null,
        proxyWidth: size.width,
        proxyHeight: size.height,
      };
    } finally {
      this.mainThreadMs += performance.now() - t0;
    }
  }

  dispose(): void {
    this.fail();
  }
}
