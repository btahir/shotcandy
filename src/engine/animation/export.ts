/**
 * Animated export pipeline (runs identically in the animation worker and on
 * the main thread): evaluate frame n -> render with the normal renderer ->
 * feed the encoder. Heavy encoder modules are imported by this file only, so
 * they stay out of the page bundle until the first animated export.
 */
import type { AssetResolver } from "../assets/types";
import { RenderCache } from "../render/cache";
import { type RenderEnvironment, defaultEnvironment, get2d } from "../render/env";
import { renderScene, scenePalette } from "../render/render";
import type { Scene } from "../scene/types";
import { isVideoScene } from "../video/clip";
import { GifWriter, PaletteSampler } from "./encode/gif";
import { VideoWriter, videoBitrate } from "./encode/video";
import {
  type AnimationExportOptions,
  type AnimationExportResult,
  type AnimationHooks,
  AnimationCancelledError,
  MIME_BY_FORMAT,
  planAnimation,
} from "./plan";
import { evaluateScene, gifDelays } from "./timeline";
import type { MotionContext } from "./types";

export * from "./plan";

const macrotask = () => new Promise<void>((r) => setTimeout(r, 0));

/** Render every frame of `scene` and encode it. */
export async function renderAnimation(
  scene: Scene,
  assets: AssetResolver,
  options: AnimationExportOptions,
  env: RenderEnvironment = defaultEnvironment(),
  hooks: AnimationHooks = {},
): Promise<AnimationExportResult> {
  if (!scene.animation) throw new Error("This design has no motion");
  if (isVideoScene(scene)) {
    const { renderVideoAnimation } = await import("../video/export");
    return renderVideoAnimation(scene, assets, options, env, hooks);
  }
  const t0 = typeof performance !== "undefined" ? performance.now() : 0;
  const cache = new RenderCache(384 * 1024 * 1024);
  const palette = scenePalette(scene, assets, env, cache);
  const plan = planAnimation(scene, assets, options, palette);
  const { width, height, fps, frames } = plan;
  // Evaluate against the exact loop length so seamless loops close perfectly.
  const timed: Scene = { ...scene, animation: { ...scene.animation, duration: frames / fps, fps } };
  const mctx: MotionContext = { assets, palette };
  const canvas = env.createCanvas(width, height);
  const g = get2d(canvas, { willReadFrequently: options.format === "gif" });
  const yieldNow = hooks.yieldNow ?? macrotask;
  const check = () => {
    if (hooks.isCancelled?.()) throw new AnimationCancelledError();
  };
  const draw = (n: number) => {
    const pose = evaluateScene(timed, n / fps, mctx);
    renderScene(g, pose, assets, { scale: options.scale, env, cache, matte: "#ffffff" });
  };

  let bytes: Uint8Array;
  let mime: string;
  let codec: string;

  if (options.format === "gif") {
    const colors =
      options.gifColors ??
      (options.quality === "small" ? 64 : options.quality === "best" ? 256 : 128);
    const samples = Math.min(frames, 8);
    const total = samples + frames;
    let done = 0;
    const sampler = new PaletteSampler(samples);
    for (let i = 0; i < samples; i++) {
      check();
      const n = samples === 1 ? 0 : Math.round((i * (frames - 1)) / (samples - 1));
      draw(n);
      sampler.add(g.getImageData(0, 0, width, height).data);
      hooks.onProgress?.({ stage: "palette", done: ++done, total });
      await yieldNow();
    }
    const writer = new GifWriter(
      { width, height, delays: gifDelays(frames, fps), colors, dither: options.dither ?? true },
      sampler.palette(colors),
    );
    for (let n = 0; n < frames; n++) {
      check();
      draw(n);
      writer.addFrame(g.getImageData(0, 0, width, height).data);
      hooks.onProgress?.({ stage: "frames", done: ++done, total });
      await yieldNow();
    }
    hooks.onProgress?.({ stage: "finishing", done: total, total });
    bytes = writer.finish();
    mime = MIME_BY_FORMAT.gif;
    codec = "gif";
  } else {
    const writer = await VideoWriter.create({
      format: options.format,
      width,
      height,
      fps,
      bitrate: videoBitrate(options.quality, width, height, fps),
    });
    try {
      for (let n = 0; n < frames; n++) {
        check();
        draw(n);
        await writer.addFrame(canvas);
        hooks.onProgress?.({ stage: "frames", done: n + 1, total: frames });
        await yieldNow();
      }
      check();
      hooks.onProgress?.({ stage: "finishing", done: frames, total: frames });
      bytes = await writer.finish();
    } catch (e) {
      writer.abort();
      throw e;
    }
    mime = writer.mime;
    codec = writer.codec;
  }
  cache.clear();
  return {
    ...plan,
    blob: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime }),
    mime,
    codec,
    renderMs: (typeof performance !== "undefined" ? performance.now() : 0) - t0,
    via: hooks.via ?? "main",
  };
}
