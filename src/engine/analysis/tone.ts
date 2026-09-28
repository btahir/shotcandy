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
