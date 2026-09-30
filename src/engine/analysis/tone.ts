/**
 * Screenshot analysis used to adapt the design to the capture: is the app
 * light or dark where it meets the window chrome? Deterministic and cached.
 */
import { type AssetSource, pickImage } from "../assets/types";
import { rgbToOklab } from "../math/color";
import type { CropRect, FrameTheme } from "../scene/types";
import type { RenderCache } from "../render/cache";
import { type RenderEnvironment, get2d } from "../render/env";

/** OKLab lightness below which the top band reads as a dark UI. */
export const DARK_TOP_THRESHOLD = 0.6;

/**
 * Mean OKLab lightness (0..1) of the top band (top 5 %) of the visible crop,
 * or null when it is mostly transparent. Sampled from the smallest decoded
 * image at a fixed 64 x 6 grid, so preview and export agree.
 */
export function topBandLightness(
  env: RenderEnvironment,
  cache: RenderCache,
  src: AssetSource,
  crop: CropRect,
): number | null {
  // Recordings read their poster, so the chrome theme can't flicker per frame.
  src = src.still ?? src;
  const img = pickImage(src, 0);
  if (!img) return null;
  const key = `tone:${src.id}:${img.width}:${crop.x},${crop.y},${crop.width},${crop.height}`;
  return cache.get(key, () => {
    const W = 64;
    const H = 6;
    const sx = crop.x * img.width;
    const sy = crop.y * img.height;
    const sw = Math.max(1, crop.width * img.width);
    const sh = Math.max(
      1,
      Math.min(crop.height * img.height, Math.max(2, 0.05 * crop.height * img.height)),
    );
    const c = env.createCanvas(W, H);
    const g = get2d(c, { willReadFrequently: true });
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    g.drawImage(img.image, sx, sy, sw, sh, 0, 0, W, H);
    const d = g.getImageData(0, 0, W, H).data;
    let sum = 0;
    let weight = 0;
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3]! / 255;
      if (a < 0.05) continue;
      sum += rgbToOklab(d[i]!, d[i + 1]!, d[i + 2]!).L * a;
      weight += a;
    }
    const value = weight < W * H * 0.25 ? null : sum / weight;
    return { value, bytes: 64 };
  });
}

/** Colours of a solid redaction whose colour is "auto", on light and on dark surroundings. */
export const REDACT_ON_LIGHT = "#1c1c1e";
export const REDACT_ON_DARK = "#f2f2f7";

/**
 * Mean OKLab lightness (0..1) of the pixels around a box on the source image
 * (a ring half the box's short side wide, clipped to the image), or null when
 * they are mostly transparent. The box itself is used when it covers the whole
 * image. `box` is in normalized source coordinates, so the answer doesn't
 * depend on crop, layout or output size; sampled from the smallest decoded
 * image at a fixed 48 x 48 grid, so preview and export agree.
 */
export function surroundLightness(
  env: RenderEnvironment,
  cache: RenderCache,
  src: AssetSource,
  box: { x0: number; y0: number; x1: number; y1: number },
): number | null {
  src = src.still ?? src;
  const img = pickImage(src, 0);
  if (!img) return null;
  const q = (n: number) => n.toFixed(5);
  const key = `surround:${src.id}:${img.width}:${q(box.x0)},${q(box.y0)},${q(box.x1)},${q(box.y1)}`;
  return cache.get(key, () => {
    const N = 48;
    const bx0 = box.x0 * img.width;
    const by0 = box.y0 * img.height;
    const bx1 = box.x1 * img.width;
    const by1 = box.y1 * img.height;
    const m = Math.max(2, 0.5 * Math.min(bx1 - bx0, by1 - by0));
    const sx0 = Math.max(0, bx0 - m);
    const sy0 = Math.max(0, by0 - m);
    const sx1 = Math.min(img.width, bx1 + m);
    const sy1 = Math.min(img.height, by1 + m);
    if (sx1 - sx0 < 0.5 || sy1 - sy0 < 0.5) return { value: null, bytes: 64 };
    const c = env.createCanvas(N, N);
    const g = get2d(c, { willReadFrequently: true });
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    g.drawImage(img.image, sx0, sy0, sx1 - sx0, sy1 - sy0, 0, 0, N, N);
    const d = g.getImageData(0, 0, N, N).data;
    let ringSum = 0;
    let ringWeight = 0;
    let allSum = 0;
    let allWeight = 0;
    for (let j = 0; j < N; j++) {
      const y = sy0 + ((j + 0.5) / N) * (sy1 - sy0);
      for (let i = 0; i < N; i++) {
        const x = sx0 + ((i + 0.5) / N) * (sx1 - sx0);
        const k = (j * N + i) * 4;
        const a = d[k + 3]! / 255;
        if (a < 0.05) continue;
        const L = rgbToOklab(d[k]!, d[k + 1]!, d[k + 2]!).L * a;
        allSum += L;
        allWeight += a;
        if (x < bx0 || x >= bx1 || y < by0 || y >= by1) {
          ringSum += L;
          ringWeight += a;
        }
      }
    }
    // Judge by the ring when there is one; else the box covers (nearly) everything.
    const [sum, weight] = ringWeight >= 8 ? [ringSum, ringWeight] : [allSum, allWeight];
    return { value: weight < 4 ? null : sum / weight, bytes: 64 };
  });
}

/** A solid redaction's "auto" colour: dark on light surroundings, light on dark ones. */
export function redactAutoFill(L: number | null): string {
  return L !== null && L < DARK_TOP_THRESHOLD ? REDACT_ON_DARK : REDACT_ON_LIGHT;
}

/** Light or dark window chrome for a screenshot whose top band has lightness L. */
export function themeForLightness(L: number | null): FrameTheme {
  return L !== null && L < DARK_TOP_THRESHOLD ? "dark" : "light";
}

// ----------------------------------------------------------------------------
// Source size advice (tiny inputs)
// ----------------------------------------------------------------------------

export interface SourceAdvice {
  /** The source is small enough that exports would be unusable at native size. */
  small: boolean;
  /** Whole-number upscale auto canvases apply (1 = none). */
  upscale: number;
  /** Nearest-neighbour upscaling keeps it crisp (pixel art, small UI captures). */
  crisp: boolean;
  /** One-line note for the UI, or null when nothing needs saying. */
  message: string | null;
}

/**
 * What to tell the user about a source of this size. Auto canvases upscale
 * sources under 1000 px on the long side by a whole number (to at least
 * 1200 px), drawn with nearest-neighbour sampling so text and pixel art stay
 * crisp instead of going soft.
 */
export function sourceAdvice(size: { width: number; height: number }): SourceAdvice {
  const long = Math.max(size.width, size.height);
  if (long >= 1000) return { small: false, upscale: 1, crisp: false, message: null };
  const upscale = Math.min(8, Math.max(1, Math.ceil(1200 / Math.max(1, long))));
  return {
    small: true,
    upscale,
    crisp: upscale >= 2,
    message: `Small image: upscaled ${upscale}× with crisp pixels`,
  };
}
