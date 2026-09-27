/**
 * Animated export: options, output planning and results. Free of encoder
 * imports so the UI can size and describe exports without loading them.
 */
import type { AssetResolver } from "../assets/types";
import { outputSize } from "../layout/layout";
import { layoutScene } from "../render/render";
import type { Scene } from "../scene/types";
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
  const frames = frameCount(spec?.duration ?? 3, fps);
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
