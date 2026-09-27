"use client";
/**
 * Style thumbnails of the user's own screenshot, rendered in a worker with
 * OffscreenCanvas (falls back to idle-time main-thread rendering). Results are
 * cached as ImageBitmaps per (style, image, aspect, size) key.
 */
import {
  type AssetResolver,
  type ImageLike,
  type Palette,
  type Scene,
  listFonts,
  renderToCanvas,
  RenderCache,
} from "@/engine";
import type { ThumbRequest, ThumbResponse } from "./protocol";

type Job = {
  key: string;
  scene: Scene;
  scale: number;
  priority: number;
  resolve: (b: ImageBitmap) => void;
  reject: (e: Error) => void;
};

const MAX_ENTRIES = 160;
/** Longest side of the content bitmap shipped to the worker. */
const WORKER_IMAGE_SIDE = 720;

export class ThumbService {
  private worker: Worker | null = null;
  private workerOk = false;
  private readonly cache = new Map<string, ImageBitmap>();
  private readonly inflight = new Map<string, Promise<ImageBitmap>>();
  private readonly queue: Job[] = [];
  private active = 0;
  private seq = 0;
  private readonly pending = new Map<number, Job>();
  private readonly sentAssets = new Set<string>();
  private readonly assetJobs = new Map<string, Promise<void>>();
  private readonly mainCache = new RenderCache();
  private readonly listeners = new Set<() => void>();
  version = 0;

  constructor(private readonly resolver: AssetResolver) {
    if (
      typeof Worker !== "undefined" &&
      typeof OffscreenCanvas !== "undefined" &&
      "transferToImageBitmap" in OffscreenCanvas.prototype
    ) {
      try {
        this.worker = new Worker(new URL("./thumbs.worker.ts", import.meta.url), {
          type: "module",
          name: "shotcandy-thumbs",
        });
        this.worker.onmessage = (e: MessageEvent<ThumbResponse>) => this.onMessage(e.data);
        this.worker.onerror = () => {
          this.workerOk = false;
          this.worker?.terminate();
          this.worker = null;
          for (const job of this.pending.values()) this.queue.unshift(job);
          this.pending.clear();
          this.active = 0;
          this.pump();
        };
        this.workerOk = true;
        this.post({ type: "init", fonts: listFonts() });
      } catch {
        this.worker = null;
      }
    }
  }

  /** Re-register fonts after the page registered brand fonts. */
  syncFonts(): void {
    this.post({ type: "init", fonts: listFonts() });
  }

  get usesWorker(): boolean {
    return this.workerOk;
  }

  private post(msg: ThumbRequest, transfer: Transferable[] = []) {
    this.worker?.postMessage(msg, transfer);
  }

  /** Ship a content image (downscaled) to the worker. */
  async setAsset(
    id: string,
    image: ImageLike,
    width: number,
    height: number,
    palette?: Palette,
  ): Promise<void> {
    if (!this.worker || this.sentAssets.has(id)) return this.assetJobs.get(id);
    this.sentAssets.add(id);
    const job = this.sendAsset(id, image, width, height, palette);
    this.assetJobs.set(id, job);
    return job;
  }

  private async sendAsset(
    id: string,
    image: ImageLike,
    width: number,
    height: number,
    palette?: Palette,
  ): Promise<void> {
    const s = Math.min(1, WORKER_IMAGE_SIDE / Math.max(width, height));
    try {
      const bitmap = await createImageBitmap(image as ImageBitmapSource, {
        resizeWidth: Math.max(1, Math.round(width * s)),
        resizeHeight: Math.max(1, Math.round(height * s)),
        resizeQuality: "high",
      });
      this.post({ type: "asset", id, bitmap, width, height, ...(palette ? { palette } : {}) }, [
        bitmap,
      ]);
    } catch {
      this.sentAssets.delete(id);
    }
  }

  get(key: string): ImageBitmap | undefined {
    const b = this.cache.get(key);
    if (b) {
      // LRU touch
      this.cache.delete(key);
      this.cache.set(key, b);
    }
    return b;
  }

  request(key: string, scene: Scene, scale: number, priority = 0): Promise<ImageBitmap> {
    const hit = this.get(key);
    if (hit) return Promise.resolve(hit);
    const existing = this.inflight.get(key);
    if (existing) return existing;
    const p = new Promise<ImageBitmap>((resolve, reject) => {
      this.queue.push({ key, scene, scale, priority, resolve, reject });
      this.queue.sort((a, b) => b.priority - a.priority);
    });
    this.inflight.set(key, p);
    p.then(
      (b) => {
        this.inflight.delete(key);
        this.cache.set(key, b);
        while (this.cache.size > MAX_ENTRIES) {
          const first = this.cache.keys().next().value as string;
          this.cache.get(first)?.close();
          this.cache.delete(first);
        }
      },
      () => this.inflight.delete(key),
    );
    this.pump();
    return p;
  }

  /** Drop queued work that no mounted tile wants any more. */
  cancelQueued(pred: (key: string) => boolean): void {
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const j = this.queue[i]!;
      if (pred(j.key)) {
        this.queue.splice(i, 1);
        this.inflight.delete(j.key);
        j.reject(new Error("cancelled"));
      }
    }
  }

  private pump() {
    const limit = this.workerOk ? 3 : 1;
    while (this.active < limit && this.queue.length) {
      const job = this.queue.shift()!;
      this.active++;
      if (this.workerOk && this.worker) {
        const id = ++this.seq;
        this.pending.set(id, job);
        // Never render before the content image has reached the worker.
        const c = job.scene.content;
        const waitFor = c.kind === "image" && c.assetId ? this.assetJobs.get(c.assetId) : undefined;
        const send = () => this.post({ type: "render", job: id, scene: job.scene, scale: job.scale });
        if (waitFor) void waitFor.then(send);
        else send();
      } else {
        this.renderOnMain(job);
      }
    }
  }

  private renderOnMain(job: Job) {
    const run = () => {
      try {
        const { canvas } = renderToCanvas(job.scene, this.resolver, {
          scale: job.scale,
          cache: this.mainCache,
        });
        createImageBitmap(canvas as HTMLCanvasElement).then(job.resolve, job.reject);
      } catch (e) {
        job.reject(e instanceof Error ? e : new Error(String(e)));
      }
      this.mainCache.trim();
      this.active--;
      this.pump();
    };
    const ric = (
      window as unknown as { requestIdleCallback?: (cb: () => void, o?: object) => number }
    ).requestIdleCallback;
    if (ric) ric(run, { timeout: 300 });
    else setTimeout(run, 16);
  }

  private onMessage(msg: ThumbResponse) {
    if (msg.type === "ready") {
      if (!msg.offscreen) {
        this.workerOk = false;
        this.worker?.terminate();
        this.worker = null;
      }
      return;
    }
    const job = this.pending.get(msg.job);
    if (!job) return;
    this.pending.delete(msg.job);
    this.active--;
    if (msg.type === "done") job.resolve(msg.bitmap);
    else {
      // A worker-side failure (e.g. a missing asset): try the main thread once.
      this.renderOnMainFallback(job);
    }
    this.pump();
  }

  private renderOnMainFallback(job: Job) {
    this.active++;
    this.renderOnMain(job);
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  dispose(): void {
    this.worker?.terminate();
    for (const b of this.cache.values()) b.close();
    this.cache.clear();
  }
}

/**
 * Thumbnail scale: at most 1/8 of the 1x canvas (cheap to render) unless the
 * image is so small that 1/8 would look soft; never above what the tile needs.
 */
export function thumbScale(canvasLong: number, targetLong: number): number {
  const needed = targetLong / canvasLong;
  if (canvasLong / 8 >= targetLong * 0.5) return Math.min(1 / 8, needed);
  return Math.min(1, needed);
}
