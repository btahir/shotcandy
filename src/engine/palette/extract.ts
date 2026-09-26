/**
 * Palette extraction from a screenshot's pixels: quantize, then pick roles
 * (dominant, vibrant, muted, dark, light, edge) used by auto backgrounds and the
 * inset "auto" colour.
 */
import { type OKLCH, oklabToOklch, rgbToOklab, toHex } from "../math/color";
import { type Cluster, quantize } from "./quantize";

export interface Swatch {
  hex: string;
  lch: OKLCH;
  /** Share of pixels, 0..1 */
  weight: number;
}

export interface Palette {
  swatches: Swatch[];
  dominant: Swatch;
  vibrant: Swatch;
  muted: Swatch;
  dark: Swatch;
  light: Swatch;
  /** Average colour of the outermost pixel ring (for "extend edge" insets). */
  edge: string;
  /** True when no swatch has meaningful chroma (a grey UI). */
  achromatic: boolean;
}

export interface PixelBuffer {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

const CHROMA_MIN = 0.045;

function toSwatch(c: Cluster): Swatch {
  return { hex: c.hex, lch: oklabToOklch(c.lab), weight: c.weight };
}

/** Deterministic box downsample so palette work is O(1) in image size. */
export function downsample(buf: PixelBuffer, maxSide = 128): PixelBuffer {
  const { width: w, height: h, data } = buf;
  const s = Math.max(w, h) / maxSide;
  if (s <= 1) return buf;
  const ow = Math.max(1, Math.round(w / s));
  const oh = Math.max(1, Math.round(h / s));
  const out = new Uint8ClampedArray(ow * oh * 4);
  for (let oy = 0; oy < oh; oy++) {
    const y0 = Math.floor((oy * h) / oh);
    const y1 = Math.max(y0 + 1, Math.floor(((oy + 1) * h) / oh));
    for (let ox = 0; ox < ow; ox++) {
      const x0 = Math.floor((ox * w) / ow);
      const x1 = Math.max(x0 + 1, Math.floor(((ox + 1) * w) / ow));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      // Sub-sample large cells on a fixed grid (max 4x4 taps) to bound cost.
      const sy = Math.max(1, Math.floor((y1 - y0) / 4));
      const sx = Math.max(1, Math.floor((x1 - x0) / 4));
      for (let y = y0; y < y1; y += sy) {
        for (let x = x0; x < x1; x += sx) {
          const i = (y * w + x) * 4;
          r += data[i]!;
          g += data[i + 1]!;
          b += data[i + 2]!;
          a += data[i + 3]!;
          n++;
        }
      }
      const o = (oy * ow + ox) * 4;
      out[o] = r / n;
      out[o + 1] = g / n;
      out[o + 2] = b / n;
      out[o + 3] = a / n;
    }
  }
  return { data: out, width: ow, height: oh };
}

/** Mean colour of the 1px border ring of an image (opaque pixels only). */
export function edgeColor(buf: PixelBuffer): string {
  const { width: w, height: h, data } = buf;
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  const add = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    if (data[i + 3]! < 128) return;
    r += data[i]!;
    g += data[i + 1]!;
    b += data[i + 2]!;
    n++;
  };
  for (let x = 0; x < w; x++) {
    add(x, 0);
    if (h > 1) add(x, h - 1);
  }
  for (let y = 1; y < h - 1; y++) {
    add(0, y);
    if (w > 1) add(w - 1, y);
  }
  if (!n) return "#ffffff";
  return toHex({ r: r / n, g: g / n, b: b / n, a: 1 });
}

export function extractPalette(input: PixelBuffer): Palette {
  const small = downsample(input, 128);
  const clusters = quantize(small.data, { k: 10 });
  const swatches = clusters.map(toSwatch);
  const fallback: Swatch = { hex: "#ffffff", lch: { L: 1, C: 0, h: 0 }, weight: 1 };
  if (swatches.length === 0) {
    return {
      swatches: [fallback],
      dominant: fallback,
      vibrant: fallback,
      muted: fallback,
      dark: fallback,
      light: fallback,
      edge: "#ffffff",
      achromatic: true,
    };
  }
  const dominant = swatches[0]!;
  const chromatic = swatches.filter((s) => s.lch.C >= CHROMA_MIN);
  const achromatic = chromatic.length === 0;
  // Vibrant: favour chroma, then population; avoid near-black/near-white.
  const vibrantPool = chromatic.filter((s) => s.lch.L > 0.3 && s.lch.L < 0.92);
  const vibrant =
    maxBy(
      vibrantPool.length ? vibrantPool : chromatic,
      (s) => s.lch.C * Math.pow(s.weight, 0.25),
    ) ?? dominant;
  const muted =
    maxBy(
      swatches.filter((s) => s.lch.C < 0.08 && s.lch.L > 0.25 && s.lch.L < 0.9),
      (s) => s.weight,
    ) ?? dominant;
  const dark = minBy(swatches, (s) => s.lch.L)!;
  const light = maxBy(swatches, (s) => s.lch.L)!;
  return {
    swatches,
    dominant,
    vibrant,
    muted,
    dark,
    light,
    edge: edgeColor(input),
    achromatic,
  };
}

/** OKLCH of a hex colour; convenience for callers. */
export function lchOf(hex: string): OKLCH {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return oklabToOklch(rgbToOklab(r, g, b));
}

function maxBy<T>(list: T[], f: (t: T) => number): T | undefined {
  let best: T | undefined;
  let bestV = -Infinity;
  for (const t of list) {
    const v = f(t);
    if (v > bestV) {
      bestV = v;
      best = t;
    }
  }
  return best;
}

function minBy<T>(list: T[], f: (t: T) => number): T | undefined {
  return maxBy(list, (t) => -f(t));
}
