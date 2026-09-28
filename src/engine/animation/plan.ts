/**
 * Animated export: options, output planning and results. Free of encoder
 * imports so the UI can size and describe exports without loading them.
 */
import type { AssetResolver } from "../assets/types";
import { outputSize } from "../layout/layout";
import { layoutScene } from "../render/render";
import type { Scene } from "../scene/types";
import { timelineDuration } from "../video/clip";
import { evaluateScene, frameCount } from "./timeline";
import type { MotionContext } from "./types";

export type GifColors = 32 | 64 | 128 | 256;
export type AnimationFormat = "mp4" | "webm" | "gif";
export type AnimationQuality = "small" | "balanced" | "best";

export interface AnimationExportOptions {
  format: AnimationFormat;
  /** Output pixels per canvas pixel. */
  scale: number;
  quality: AnimationQuality;
  /** Overrides scene.animation.fps (GIFs are capped at 50 fps). */
  fps?: number;
  /** GIF palette size (default from quality). */
  gifColors?: GifColors;
  /** GIF ordered dithering (default on). */
  dither?: boolean;
}

export interface AnimationPlan {
  width: number;
  height: number;
  fps: number;
  frames: number;
  /** Seconds (frames / fps). */
  duration: number;
}

export interface AnimationProgress {
  stage: "palette" | "frames" | "finishing";
  done: number;
  total: number;
}

export interface AnimationExportResult extends AnimationPlan {
  blob: Blob;
  mime: string;
  /** Codec string for video, "gif" for GIFs. */
  codec: string;
  renderMs: number;
  via: "main" | "worker";
  /** Things the user should know about the file (e.g. sound left out). */
  warnings?: string[];
}

export interface AnimationHooks {
  onProgress?(p: AnimationProgress): void;
  isCancelled?(): boolean;
  /** Called between frames so cancel messages and UI can run (default: a macrotask). */
  yieldNow?(): Promise<void>;
  via?: "main" | "worker";
}

export class AnimationCancelledError extends Error {
  constructor() {
    super("Export cancelled");
    this.name = "AnimationCancelledError";
  }
}

export const MIME_BY_FORMAT: Record<AnimationFormat, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  gif: "image/gif",
};

export const GIF_MAX_FPS = 50;

/** Output size and frame timing of an animated export. */
export function planAnimation(
  scene: Scene,
  assets: AssetResolver,
  options: Pick<AnimationExportOptions, "format" | "scale" | "fps">,
  palette?: MotionContext["palette"],
): AnimationPlan {
  const spec = scene.animation;
  let fps = Math.round(options.fps ?? spec?.fps ?? 30);
  if (options.format === "gif") fps = Math.min(GIF_MAX_FPS, fps);
  const frames = frameCount(timelineDuration(scene), fps);
  const pose = evaluateScene(scene, 0, { assets, palette: palette ?? null });
  const size = outputSize(layoutScene(pose, assets), options.scale);
  let { width, height } = size;
  // H.264/VP9 need even dimensions: trim the odd pixel (a background edge).
  if (options.format !== "gif") {
    width = Math.max(2, width - (width % 2));
    height = Math.max(2, height - (height % 2));
  }
  return { width, height, fps, frames, duration: frames / fps };
}

/** Bitrate for a quality level: bits per pixel per frame. */
export function videoBitrate(quality: AnimationQuality, w: number, h: number, fps: number): number {
  const bpp = quality === "small" ? 0.05 : quality === "best" ? 0.2 : 0.1;
  return Math.round(Math.min(80_000_000, Math.max(600_000, w * h * fps * bpp)));
}

/**
 * Scale a video size measured on a small sample encode (same clip, same fps)
 * up to the full size. The encoders run variable bitrate against
 * `videoBitrate`; how much of the target a clip uses depends on its motion
 * (a still "Draw on" uses 10-20 %, a 3D sweep all of it) but barely on its
 * size, so the sample's share of its own target carries over. Measured on the
 * 8 presets: 480p samples predict 1080p within about ±15 %.
 */
export function extrapolateVideoBytes(
  sampleBytes: number,
  sample: AnimationPlan,
  full: AnimationPlan,
  quality: AnimationQuality,
): number {
  const target = (p: AnimationPlan) =>
    (videoBitrate(quality, p.width, p.height, p.fps) * p.duration) / 8;
  const share = Math.min(1.2, sampleBytes / Math.max(1, target(sample)));
  return Math.round(target(full) * share);
}

/**
 * Scale a GIF size measured on a small sample encode up to the full size.
 * LZW output grows slower than the pixel count (flat areas compress better
 * when they are bigger). Calibrated on the 8 presets x 2 screenshots,
 * 200 px samples -> 640 px GIFs: exponent 0.78 ± 0.03 (about ±8 % in size).
 */
export const GIF_AREA_EXPONENT = 0.78;

export function extrapolateGifBytes(
  sampleBytes: number,
  sample: { width: number; height: number },
  full: { width: number; height: number },
): number {
  const ratio = (full.width * full.height) / Math.max(1, sample.width * sample.height);
  return Math.round(sampleBytes * ratio ** GIF_AREA_EXPONENT);
}

/** Share of the video bitrate target each motion uses (measured, see extrapolateVideoBytes). */
const VIDEO_SHARE: Record<string, number> = {
  reveal: 0.68,
  focus: 0.94,
  scroll: 0.8,
  sweep: 1,
  float: 1,
  drift: 0.17,
  draw: 0.14,
  flip: 0.78,
};

/**
 * An instant size range for a motion export, before the sample encode
 * refines it: per-motion calibrated models (GIF ≈ 0.2 bytes per pixel-frame
 * at 640 px, 128 colours, dithered; video = its share of the bitrate target).
 */
export function roughAnimationBytes(
  plan: AnimationPlan,
  o: {
    format: AnimationFormat;
    quality: AnimationQuality;
    preset: string;
    gifColors?: GifColors;
    dither?: boolean;
  },
): [number, number] {
  let mid: number;
  if (o.format === "gif") {
    const area = plan.width * plan.height;
    const colours =
      o.gifColors === 256 ? 1.12 : o.gifColors === 64 ? 0.86 : o.gifColors === 32 ? 0.74 : 1;
    const g =
      0.2 *
      (area / (640 * 400)) ** (GIF_AREA_EXPONENT - 1) *
      colours *
      (o.dither === false ? 0.78 : 1);
    mid = area * plan.frames * g;
  } else {
    const target = (videoBitrate(o.quality, plan.width, plan.height, plan.fps) * plan.duration) / 8;
    mid = target * (VIDEO_SHARE[o.preset] ?? 0.8);
  }
  return [Math.round(mid * 0.8), Math.round(mid * 1.25)];
}
