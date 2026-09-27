/**
 * Animated GIF encoding with gifenc (MIT). One global palette is quantized
 * from pixels sampled across the whole clip (no palette flicker between
 * frames), and an optional 8x8 ordered (Bayer) dither hides banding in
 * gradients. Everything is deterministic: same frames in, same bytes out.
 */
import { GIFEncoder, type Palette, nearestColorIndex, quantize } from "gifenc";

import type { GifColors } from "../plan";

export type { GifColors };

export interface GifOptions {
  width: number;
  height: number;
  /** Per-frame delays in centiseconds (see timeline.gifDelays). */
  delays: number[];
  colors: GifColors;
  dither: boolean;
  /** 0 = loop forever (default). */
  repeat?: number;
}

const BAYER8 = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28,
  52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7,
  39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
];

/**
 * Collects a sparse, evenly spread sample of pixels from sample frames for
 * the global palette (about `budget` pixels in total).
 */
export class PaletteSampler {
  private readonly chunks: Uint8Array[] = [];
  private count = 0;
  constructor(
    private readonly frames: number,
    private readonly budget = 400_000,
  ) {}

  add(rgba: Uint8ClampedArray | Uint8Array): void {
    const px = rgba.length >> 2;
    const want = Math.max(1, Math.floor(this.budget / Math.max(1, this.frames)));
    const step = Math.max(1, Math.floor(px / want));
    const out = new Uint8Array(Math.ceil(px / step) * 4);
    let o = 0;
    // A prime-ish offset per frame keeps samples from lining up on a grid.
    for (let i = this.chunks.length % step; i < px; i += step) {
      const j = i << 2;
      out[o++] = rgba[j]!;
      out[o++] = rgba[j + 1]!;
      out[o++] = rgba[j + 2]!;
      out[o++] = 255;
    }
    this.chunks.push(out.subarray(0, o));
    this.count += o;
  }

  palette(colors: GifColors): Palette {
    const all = new Uint8Array(this.count);
    let o = 0;
    for (const c of this.chunks) {
      all.set(c, o);
      o += c.length;
    }
    const p = quantize(all, colors, { format: "rgb565" });
    // gifenc needs at least 2 colours in a table.
    while (p.length < 2) p.push([0, 0, 0]);
    return p;
  }
}

/** Maps RGBA pixels to palette indices, with optional ordered dithering. */
export class PaletteMapper {
  private readonly lut = new Int16Array(65536).fill(-1);
  private readonly spread: number;
  constructor(
    private readonly palette: Palette,
    private readonly dither: boolean,
  ) {
    const n = palette.length;
    this.spread = n >= 256 ? 10 : n >= 128 ? 14 : n >= 64 ? 20 : 28;
  }

  private lookup(r: number, g: number, b: number): number {
    const key = ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3);
    let idx = this.lut[key]!;
    if (idx < 0) {
      // Match against the centre of the 565 bucket so the LUT is order-independent.
      idx = nearestColorIndex(this.palette, [
        ((r >> 3) << 3) | 4,
        ((g >> 2) << 2) | 2,
        ((b >> 3) << 3) | 4,
      ]);
      this.lut[key] = idx;
    }
    return idx;
  }

  map(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): Uint8Array {
    const out = new Uint8Array(width * height);
    const s = this.spread;
    for (let y = 0; y < height; y++) {
      const row = (y & 7) << 3;
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const j = i << 2;
        let r = rgba[j]!;
        let g = rgba[j + 1]!;
        let b = rgba[j + 2]!;
        if (this.dither) {
          const o = ((BAYER8[row | (x & 7)]! + 0.5) / 64 - 0.5) * s;
          r = r + o < 0 ? 0 : r + o > 255 ? 255 : r + o;
          g = g + o < 0 ? 0 : g + o > 255 ? 255 : g + o;
          b = b + o < 0 ? 0 : b + o > 255 ? 255 : b + o;
        }
        out[i] = this.lookup(r | 0, g | 0, b | 0);
      }
    }
    return out;
  }
}

/** Streams frames into a GIF. */
export class GifWriter {
  private readonly gif = GIFEncoder({ initialCapacity: 1 << 20 });
  private readonly mapper: PaletteMapper;
  private n = 0;

  constructor(
    private readonly opts: GifOptions,
    private readonly palette: Palette,
  ) {
    this.mapper = new PaletteMapper(palette, opts.dither);
  }

  addFrame(rgba: Uint8ClampedArray | Uint8Array): void {
    const { width, height } = this.opts;
    const index = this.mapper.map(rgba, width, height);
    const cs = this.opts.delays[this.n] ?? this.opts.delays[this.opts.delays.length - 1] ?? 4;
    this.gif.writeFrame(index, width, height, {
      ...(this.n === 0 ? { palette: this.palette, repeat: this.opts.repeat ?? 0 } : {}),
      delay: cs * 10,
    });
    this.n++;
  }

  finish(): Uint8Array {
    this.gif.finish();
    return this.gif.bytes();
  }
}
