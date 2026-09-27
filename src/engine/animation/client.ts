/**
 * Animated export client. Runs the export in a dedicated worker when the
 * browser supports OffscreenCanvas (and WebCodecs in workers for video),
 * otherwise on the main thread with the same code. Cancelling terminates the
 * worker (or stops the main-thread loop between frames).
 *
 * The encoders (mp4-muxer, webm-muxer, gifenc) are only reached through a
 * dynamic import or the worker, so they never weigh on page load.
 */
import type { ExportAsset } from "../export/export";
import { listFonts } from "../render/fonts";
import type { Scene } from "../scene/types";
import type { AnimationExportOptions, AnimationExportResult, AnimationProgress } from "./plan";
import type { AnimationWorkerRequest, AnimationWorkerResponse } from "./protocol";

export interface AnimationExporterOptions {
  createWorker?: () => Worker;
  readyTimeoutMs?: number;
}

export interface AnimationRun {
  onProgress?: (p: AnimationProgress) => void;
  signal?: AbortSignal;
}

export function isAbortError(e: unknown): boolean {
  return e instanceof Error && (e.name === "AbortError" || e.name === "AnimationCancelledError");
}

function abortError(): Error {
  const e = new Error("Export cancelled");
  e.name = "AbortError";
  return e;
}

/** Whether this browser can encode video with WebCodecs at all. */
export function canEncodeVideo(): boolean {
  return typeof VideoEncoder !== "undefined" && typeof VideoFrame !== "undefined";
}

/** Whether `format` can be encoded here (probes a small config once per format). */
const probes = new Map<string, Promise<boolean>>();
export function canEncodeFormat(format: AnimationExportOptions["format"]): Promise<boolean> {
  if (format === "gif") return Promise.resolve(true);
  if (!canEncodeVideo()) return Promise.resolve(false);
  let p = probes.get(format);
  if (!p) {
    p = import("./encode/video").then(async (m) => {
      const codec = await m.pickCodec({
        format,
        width: 1280,
        height: 720,
        fps: 30,
        bitrate: 4_000_000,
      });
      return codec !== null;
    });
    p = p.catch(() => false);
    probes.set(format, p);
  }
  return p;
}

export class AnimationExporter {
  constructor(private readonly opts: AnimationExporterOptions = {}) {}

  async export(
    scene: Scene,
    assets: ExportAsset[],
    options: AnimationExportOptions,
    run: AnimationRun = {},
  ): Promise<AnimationExportResult> {
    if (run.signal?.aborted) throw abortError();
    const viaWorker = await this.tryWorker(scene, assets, options, run);
    if (viaWorker) return viaWorker;
    return this.onMain(scene, assets, options, run);
  }

  private tryWorker(
    scene: Scene,
    assets: ExportAsset[],
    options: AnimationExportOptions,
    run: AnimationRun,
  ): Promise<AnimationExportResult | null> {
    const factory = this.opts.createWorker;
    if (
      !factory ||
      typeof Worker === "undefined" ||
      typeof OffscreenCanvas === "undefined" ||
      typeof createImageBitmap === "undefined"
    )
      return Promise.resolve(null);
    const fonts = listFonts();
    const needsFonts = fonts.some((f) => f.sources?.length);
    return new Promise((resolve, reject) => {
      let worker: Worker;
      try {
        worker = factory();
      } catch {
        resolve(null);
        return;
      }
      let started = false;
      const done = () => {
        clearTimeout(timer);
        run.signal?.removeEventListener("abort", onAbort);
        worker.terminate();
      };
      const onAbort = () => {
        done();
        reject(abortError());
      };
      run.signal?.addEventListener("abort", onAbort, { once: true });
      const timer = setTimeout(() => {
        if (started) return;
        done();
        resolve(null);
      }, this.opts.readyTimeoutMs ?? 4000);
      worker.onmessage = (e: MessageEvent<AnimationWorkerResponse>) => {
        const msg = e.data;
        switch (msg.type) {
          case "ready": {
            const ok =
              msg.offscreen &&
              (!needsFonts || msg.fonts) &&
              (options.format === "gif" || msg.video);
            if (!ok) {
              done();
              resolve(null);
              return;
            }
            started = true;
            clearTimeout(timer);
            const req: AnimationWorkerRequest = { type: "animate", scene, assets, options, fonts };
            worker.postMessage(req);
            return;
          }
          case "progress":
            run.onProgress?.(msg.progress);
            return;
          case "result":
            done();
            resolve(msg.result);
            return;
          case "error":
            done();
            reject(new Error(msg.message));
            return;
        }
      };
      worker.onerror = (ev) => {
        ev.preventDefault?.();
        done();
        if (started) reject(new Error("The export worker crashed"));
        else resolve(null);
      };
    });
  }

  private async onMain(
    scene: Scene,
    assets: ExportAsset[],
    options: AnimationExportOptions,
    run: AnimationRun,
  ): Promise<AnimationExportResult> {
    const [{ renderAnimation }, { decodeAssets }] = await Promise.all([
      import("./export"),
      import("../export/export"),
    ]);
    const { resolver, release } = await decodeAssets(assets);
    try {
      let lastYield = performance.now();
      return await renderAnimation(scene, resolver, options, undefined, {
        via: "main",
        onProgress: run.onProgress,
        isCancelled: () => !!run.signal?.aborted,
        // Keep the page responsive: give the browser a frame roughly every 40 ms.
        yieldNow: async () => {
          if (performance.now() - lastYield < 40) return;
          await new Promise((r) => setTimeout(r, 0));
          lastYield = performance.now();
        },
      });
    } catch (e) {
      if (isAbortError(e)) throw abortError();
      throw e;
    } finally {
      release();
    }
  }
}
