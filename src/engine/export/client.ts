/**
 * Export client: uses the export worker (OffscreenCanvas) when the browser
 * supports it, otherwise renders on the main thread. Both paths run the same
 * engine code from the same original files, so output is identical.
 */
import { listFonts } from "../render/fonts";
import type { Scene } from "../scene/types";
import { type ExportAsset, type ExportResult, exportScene } from "./export";
import type { ExportOptions } from "./formats";
import type { WorkerRequest, WorkerResponse } from "./protocol";

export interface ExporterOptions {
  /** Factory for the export worker; omit to disable the worker path. */
  createWorker?: () => Worker;
  /** Worker start-up timeout before falling back to the main thread. */
  readyTimeoutMs?: number;
}

export function supportsWorkerExport(): boolean {
  return (
    typeof Worker !== "undefined" &&
    typeof OffscreenCanvas !== "undefined" &&
    typeof createImageBitmap !== "undefined" &&
    "convertToBlob" in OffscreenCanvas.prototype
  );
}

type Pending = { resolve: (r: ExportResult) => void; reject: (e: Error) => void };

export class Exporter {
  private worker: Worker | null = null;
  private ready: Promise<{ fonts: boolean } | null> | null = null;
  private seq = 0;
  private pending = new Map<number, Pending>();

  constructor(private readonly opts: ExporterOptions = {}) {}

  private startWorker(): Promise<{ fonts: boolean } | null> {
    if (this.ready) return this.ready;
    if (!this.opts.createWorker || !supportsWorkerExport()) {
      this.ready = Promise.resolve(null);
      return this.ready;
    }
    this.ready = new Promise((resolve) => {
      let worker: Worker;
      try {
        worker = this.opts.createWorker!();
      } catch {
        resolve(null);
        return;
      }
      const timer = setTimeout(() => {
        worker.terminate();
        resolve(null);
      }, this.opts.readyTimeoutMs ?? 3000);
      worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const msg = e.data;
        if (msg.type === "ready") {
          clearTimeout(timer);
          if (!msg.offscreen) {
            worker.terminate();
            resolve(null);
            return;
          }
          this.worker = worker;
          resolve({ fonts: msg.fonts });
          return;
        }
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        if (msg.type === "error") p.reject(new Error(msg.message));
        else p.resolve({ ...msg, via: "worker" });
      };
      worker.onerror = () => {
        clearTimeout(timer);
        for (const p of this.pending.values()) p.reject(new Error("Export worker crashed"));
        this.pending.clear();
        this.worker = null;
        resolve(null);
      };
    });
    return this.ready;
  }

  /** Warm the worker up ahead of the first export. */
  prewarm(): void {
    void this.startWorker();
  }

  async export(scene: Scene, assets: ExportAsset[], options: ExportOptions): Promise<ExportResult> {
    const caps = await this.startWorker();
    const hasText =
      scene.annotations.some((a) => a.kind === "text") ||
      scene.card.frame.id !== "none" ||
      (scene.content.kind !== "image" && scene.content.kind !== "placeholder");
    const fonts = listFonts();
    const needsWebFonts = fonts.some((f) => f.sources?.length);
    // Web fonts need FontFace in the worker; without it, render on the main thread.
    if (!this.worker || (hasText && needsWebFonts && !caps?.fonts)) {
      return exportScene(scene, assets, options);
    }
    const id = ++this.seq;
    const req: WorkerRequest = { type: "export", id, scene, assets, options, fonts };
    return new Promise<ExportResult>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker!.postMessage(req);
    });
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.ready = null;
    for (const p of this.pending.values()) p.reject(new Error("Exporter disposed"));
    this.pending.clear();
  }
}
