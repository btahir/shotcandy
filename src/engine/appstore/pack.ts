/**
 * Packing App Store sets: an opaque PNG encoder (App Store screenshots must
 * not have an alpha channel, and canvas PNGs always carry one) and a ZIP of
 * all slides, both with fflate (MIT). Import this module lazily.
 */
import { crc32 } from "./crc32";
import { zipSync, zlibSync } from "fflate";

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/**
 * Encode RGBA pixels as a 24-bit RGB PNG (colour type 2, no alpha), with the
 * "Sub" filter on every row. Pixels are composited over white if any alpha
 * is left (there shouldn't be: slides always have a background).
 */
export function encodePngRgb(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const stride = width * 3 + 1;
  const raw = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    raw[row] = 1; // Sub
    let pr = 0;
    let pg = 0;
    let pb = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = rgba[i + 3]! / 255;
      const r = Math.round(rgba[i]! * a + 255 * (1 - a));
      const g = Math.round(rgba[i + 1]! * a + 255 * (1 - a));
      const b = Math.round(rgba[i + 2]! * a + 255 * (1 - a));
      const o = row + 1 + x * 3;
      raw[o] = (r - pr) & 255;
      raw[o + 1] = (g - pg) & 255;
      raw[o + 2] = (b - pb) & 255;
      pr = r;
      pg = g;
      pb = b;
    }
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour, no alpha
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlibSync(raw, { level: 6 })),
    chunk("IEND", new Uint8Array()),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** ZIP the files (already-compressed images are stored, not deflated again). */
export function zipFiles(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const tree: Record<string, [Uint8Array, { level: 0 }]> = {};
  for (const f of files) tree[f.name] = [f.data, { level: 0 }];
  return zipSync(tree, { level: 0 });
}
