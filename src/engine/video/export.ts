/**
 * Exporting a design whose content is a screen recording. Every output frame
 * is the unchanged renderer drawing the scene pose at time t with the
 * recording's frame at t in place of the screenshot (withVideoFrame).
 *
 * MP4 and WebM go through a Mediabunny Conversion: it decodes the trimmed
 * recording at the output frame rate, hands each frame to `process` (which
 * returns the rendered design), encodes it, and copies or re-encodes the
 * sound alongside (see audioPlan). GIFs pull frames with a CanvasSink and
 * feed the existing GIF encoder.
 */
import { type AssetResolver, withVideoFrame } from "../assets/types";
import {
  AnimationCancelledError,
  type AnimationExportOptions,
  type AnimationExportResult,
  type AnimationHooks,
  MIME_BY_FORMAT,
  planAnimation,
  videoBitrate,
} from "../animation/plan";
import { evaluateScene, gifDelays } from "../animation/timeline";
import type { MotionContext } from "../animation/types";
import { GifWriter, PaletteSampler } from "../animation/encode/gif";
import { RenderCache } from "../render/cache";
import { type RenderEnvironment, defaultEnvironment, get2d } from "../render/env";
import { renderScene, scenePalette } from "../render/render";
import type { Scene } from "../scene/types";
import { audioPlan, sceneClip } from "./clip";

/** Longest side of the decoded frames fed to the renderer. */
const MAX_FRAME_SIDE = 3840;

const now = () => (typeof performance !== "undefined" ? performance.now() : 0);

export async function renderVideoAnimation(
  scene: Scene,
  assets: AssetResolver,
  options: AnimationExportOptions,
  env: RenderEnvironment = defaultEnvironment(),
  hooks: AnimationHooks = {},
): Promise<AnimationExportResult> {
  const clip = sceneClip(scene);
  const assetId = scene.content.kind === "image" ? scene.content.assetId : null;
  const source = assetId ? assets.get(assetId) : undefined;
  if (!clip || !assetId || !source?.video) throw new Error("This design has no recording");
  if (!scene.animation) throw new Error("This design has no timeline");
  const t0 = now();
  const cache = new RenderCache(384 * 1024 * 1024);
  const palette = scenePalette(scene, assets, env, cache);
  const plan = planAnimation(scene, assets, options, palette);
  const { width, height, fps, frames } = plan;
  const mctx: MotionContext = { assets, palette };
  const canvas = env.createCanvas(width, height);
  const g = get2d(canvas, { willReadFrequently: options.format === "gif" });
  const check = () => {
    if (hooks.isCancelled?.()) throw new AnimationCancelledError();
  };

  // Decoded frames are drawn into this canvas at the recording's display size
  // (capped), so rotation is applied once and the renderer sees a plain image.
  const k = Math.min(1, MAX_FRAME_SIDE / Math.max(source.width, source.height));
  const fw = Math.max(1, Math.round(source.width * k));
  const fh = Math.max(1, Math.round(source.height * k));
  const frameCanvas = env.createCanvas(fw, fh);
  const fg = get2d(frameCanvas);
  const frameImage = { image: frameCanvas, width: fw, height: fh };

  /** Render output frame n (time n / fps) over the frame now in frameCanvas. */
  const draw = (n: number) => {
    const t = n / fps;
    const resolver = withVideoFrame(assets, assetId, frameImage, n);
    const pose = evaluateScene(scene, t, { ...mctx, assets: resolver });
    renderScene(g, pose, resolver, { scale: options.scale, env, cache, matte: "#ffffff" });
  };

  const mb = await import("mediabunny");
  const input = new mb.Input({
    source: new mb.BlobSource(source.video.blob),
    formats: mb.ALL_FORMATS,
  });
  const warnings: string[] = [];
  let bytes: Uint8Array;
  let mime: string;
  let codec: string;
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error("The recording has no video track");

    if (options.format === "gif") {
      const sink = new mb.CanvasSink(track, { width: fw, height: fh, fit: "fill", poolSize: 1 });
      const first = await track.getFirstTimestamp();
      // The frame shown at output time t is the last one starting at or before it.
      const at = (n: number) => Math.max(first, clip.start + n / fps + 1e-4);
      const drawFrame = (c: unknown) => {
        fg.clearRect(0, 0, fw, fh);
        fg.drawImage(c as CanvasImageSource, 0, 0, fw, fh);
      };
      const colors =
        options.gifColors ??
        (options.quality === "small" ? 64 : options.quality === "best" ? 256 : 128);
      const samples = Math.min(frames, 8);
      const total = samples + frames;
      let done = 0;
      const sampler = new PaletteSampler(samples);
      const picks = Array.from({ length: samples }, (_, i) =>
        samples === 1 ? 0 : Math.round((i * (frames - 1)) / (samples - 1)),
      );
      let i = 0;
      for await (const wc of sink.canvasesAtTimestamps(picks.map(at))) {
        check();
        if (wc) drawFrame(wc.canvas);
        draw(picks[i++]!);
        sampler.add(g.getImageData(0, 0, width, height).data);
        hooks.onProgress?.({ stage: "palette", done: ++done, total });
      }
      const writer = new GifWriter(
        { width, height, delays: gifDelays(frames, fps), colors, dither: options.dither ?? true },
        sampler.palette(colors),
      );
      let n = 0;
      for await (const wc of sink.canvasesAtTimestamps(
        Array.from({ length: frames }, (_, j) => at(j)),
      )) {
        check();
        if (wc) drawFrame(wc.canvas);
        draw(n++);
        writer.addFrame(g.getImageData(0, 0, width, height).data);
        hooks.onProgress?.({ stage: "frames", done: ++done, total });
        await (hooks.yieldNow?.() ?? Promise.resolve());
      }
      hooks.onProgress?.({ stage: "finishing", done: total, total });
      bytes = writer.finish();
      mime = MIME_BY_FORMAT.gif;
      codec = "gif";
    } else {
      const format = options.format;
      const audioTrack = await input.getPrimaryAudioTrack().catch(() => null);
      const ap = audioPlan(format, audioTrack?.codec ?? null, clip);
      const output = new mb.Output({
        format:
          format === "mp4"
            ? new mb.Mp4OutputFormat({ fastStart: "in-memory" })
            : new mb.WebMOutputFormat(),
        target: new mb.BufferTarget(),
      });
      let n = 0;
      let cancelled = false;
      const conversion = await mb.Conversion.init({
        input,
        output,
        tracks: "primary",
        trim: { start: clip.start, end: clip.end },
        showWarnings: false,
        video: {
          codec: format === "mp4" ? "avc" : "vp9",
          frameRate: fps,
          bitrate: videoBitrate(options.quality, width, height, fps),
          keyFrameInterval: 2,
          forceTranscode: true,
          allowTransformationMetadata: false,
          processedWidth: width,
          processedHeight: height,
          process: (sample) => {
            if (hooks.isCancelled?.()) {
              cancelled = true;
              void conversion.cancel();
              return null;
            }
            // Timestamps are output times (trim start = 0) on the fps grid.
            const i = Math.round(sample.timestamp * fps);
            if (i >= frames) return null;
            fg.clearRect(0, 0, fw, fh);
            sample.drawWithFit(fg as CanvasRenderingContext2D, { fit: "fill" });
            draw(i);
            n = Math.max(n, i + 1);
            hooks.onProgress?.({ stage: "frames", done: Math.min(n, frames), total: frames });
            // Snapshot now: the canvas is reused for the next frame.
            return new mb.VideoSample(canvas as CanvasImageSource, {
              timestamp: sample.timestamp,
              duration: sample.duration,
            });
          },
        },
        audio:
          ap.mode === "none"
            ? { discard: true }
            : ap.mode === "copy"
              ? {}
              : { codec: ap.codec, bitrate: ap.bitrate, forceTranscode: true },
      });
      if (!conversion.isValid) {
        const why = conversion.discardedTracks.find((d) => d.track.isVideoTrack())?.reason;
        throw new Error(
          why === "no_encodable_target_codec"
            ? `This browser can't encode ${format === "mp4" ? "H.264 video. Try WebM" : "WebM video. Try MP4"}.`
            : "This recording can't be converted in this browser.",
        );
      }
      if (ap.mode !== "none" && conversion.discardedTracks.some((d) => d.track.isAudioTrack()))
        warnings.push("The sound was left out: this browser can't encode it for this format.");
      try {
        await conversion.execute();
      } catch (e) {
        if (cancelled || hooks.isCancelled?.()) throw new AnimationCancelledError();
        throw e;
      }
      if (cancelled) throw new AnimationCancelledError();
      check();
      hooks.onProgress?.({ stage: "finishing", done: frames, total: frames });
      const buf = (output.target as InstanceType<typeof mb.BufferTarget>).buffer;
      if (!buf) throw new Error("The encoder produced no data");
      bytes = new Uint8Array(buf);
      mime = MIME_BY_FORMAT[format];
      codec = format === "mp4" ? "avc" : "vp9";
    }
  } finally {
    input.dispose();
    cache.clear();
  }
  return {
    ...plan,
    blob: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime }),
    mime,
    codec,
    renderMs: now() - t0,
    via: hooks.via ?? "main",
    ...(warnings.length ? { warnings } : {}),
  };
}
