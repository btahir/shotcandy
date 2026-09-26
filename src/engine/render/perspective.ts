/**
 * Deterministic perspective warp for 3D tilt.
 *
 * Canvas 2D only supports affine transforms, so a tilted card is rendered flat
 * into an offscreen canvas and then resampled through the inverse homography
 * in plain JavaScript: for every destination pixel we find its source position
 * and sample it. This is exact (no triangle seams), identical across browsers,
 * and fast enough (a 4K frame is a few million samples).
 *
 * Sampling is bilinear on premultiplied alpha, with a small mip chain chosen per
 * pixel from the local minification (derived from the homography's Jacobian),
 * so foreshortened areas stay smooth instead of aliasing.
 */
import { type Mat3, applyMat3, invert } from "../math/matrix";
import { boundsOfPoints } from "../math/geometry";
import { type CanvasLike, type RenderEnvironment, get2d, makeImageData } from "./env";

interface Level {
  data: Uint8ClampedArray; // premultiplied RGBA
  w: number;
  h: number;
}

function premultiply(src: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    const a = src[i + 3]!;
    if (a === 0) continue;
    if (a === 255) {
      out[i] = src[i]!;
      out[i + 1] = src[i + 1]!;
      out[i + 2] = src[i + 2]!;
      out[i + 3] = 255;
      continue;
    }
    const f = a / 255;
    out[i] = src[i]! * f + 0.5;
    out[i + 1] = src[i + 1]! * f + 0.5;
    out[i + 2] = src[i + 2]! * f + 0.5;
    out[i + 3] = a;
  }
  return out;
}

function halve(l: Level): Level {
  const w = Math.max(1, l.w >> 1);
  const h = Math.max(1, l.h >> 1);
  const out = new Uint8ClampedArray(w * h * 4);
  const s = l.data;
  for (let y = 0; y < h; y++) {
    const y0 = Math.min(l.h - 1, y * 2);
    const y1 = Math.min(l.h - 1, y * 2 + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.min(l.w - 1, x * 2);
      const x1 = Math.min(l.w - 1, x * 2 + 1);
      const a = (y0 * l.w + x0) * 4;
      const b = (y0 * l.w + x1) * 4;
      const c = (y1 * l.w + x0) * 4;
      const d = (y1 * l.w + x1) * 4;
      const o = (y * w + x) * 4;
      out[o] = (s[a]! + s[b]! + s[c]! + s[d]! + 2) >> 2;
      out[o + 1] = (s[a + 1]! + s[b + 1]! + s[c + 1]! + s[d + 1]! + 2) >> 2;
      out[o + 2] = (s[a + 2]! + s[b + 2]! + s[c + 2]! + s[d + 2]! + 2) >> 2;
      out[o + 3] = (s[a + 3]! + s[b + 3]! + s[c + 3]! + s[d + 3]! + 2) >> 2;
    }
  }
  return { data: out, w, h };
}

/** Bilinear sample of a premultiplied level at continuous pixel coords (centres at +0.5). */
function sample(l: Level, u: number, v: number, out: Float64Array): void {
  const x = u - 0.5;
  const y = v - 0.5;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const w = l.w;
  const h = l.h;
  const d = l.data;
  out[0] = out[1] = out[2] = out[3] = 0;
  for (let j = 0; j < 2; j++) {
    const yy = y0 + j;
    if (yy < 0 || yy >= h) continue;
    const wy = j ? fy : 1 - fy;
    for (let i = 0; i < 2; i++) {
      const xx = x0 + i;
      if (xx < 0 || xx >= w) continue;
      const wgt = wy * (i ? fx : 1 - fx);
      if (wgt === 0) continue;
      const k = (yy * w + xx) * 4;
      out[0] += d[k]! * wgt;
      out[1] += d[k + 1]! * wgt;
      out[2] += d[k + 2]! * wgt;
      out[3] += d[k + 3]! * wgt;
    }
  }
}

export interface WarpResult {
  canvas: CanvasLike;
  x: number;
  y: number;
}

/**
 * Warp `src` (srcW x srcH pixels) through `destFromSrc` into a canvas covering
 * the destination bounding box (clipped to destW x destH).
 */
export function warpPerspective(
  env: RenderEnvironment,
  src: CanvasLike,
  srcW: number,
  srcH: number,
  destFromSrc: Mat3,
  destW: number,
  destH: number,
): WarpResult | null {
  const M = invert(destFromSrc);
  if (!M) return null;
  const corners = [
    applyMat3(destFromSrc, { x: 0, y: 0 }),
    applyMat3(destFromSrc, { x: srcW, y: 0 }),
    applyMat3(destFromSrc, { x: srcW, y: srcH }),
    applyMat3(destFromSrc, { x: 0, y: srcH }),
  ];
  const bb = boundsOfPoints(corners);
  const x0 = Math.max(0, Math.floor(bb.x));
  const y0 = Math.max(0, Math.floor(bb.y));
  const x1 = Math.min(destW, Math.ceil(bb.x + bb.width));
  const y1 = Math.min(destH, Math.ceil(bb.y + bb.height));
  const ow = x1 - x0;
  const oh = y1 - y0;
  if (ow <= 0 || oh <= 0) return null;

  const raw = get2d(src, { willReadFrequently: true }).getImageData(0, 0, srcW, srcH).data;
  const levels: Level[] = [{ data: premultiply(raw), w: srcW, h: srcH }];
  const out = new Uint8ClampedArray(ow * oh * 4);
  const detM = Math.abs(
    M[0] * (M[4] * M[8] - M[5] * M[7]) -
      M[1] * (M[3] * M[8] - M[5] * M[6]) +
      M[2] * (M[3] * M[7] - M[4] * M[6]),
  );
  const s0 = new Float64Array(4);
  const s1 = new Float64Array(4);
  const getLevel = (n: number): Level => {
    while (levels.length <= n) levels.push(halve(levels[levels.length - 1]!));
    return levels[n]!;
  };
  const MAX_LEVEL = 4;

  for (let y = 0; y < oh; y++) {
    const py = y0 + y + 0.5;
    let sx = M[0] * (x0 + 0.5) + M[1] * py + M[2];
    let sy = M[3] * (x0 + 0.5) + M[4] * py + M[5];
    let sw = M[6] * (x0 + 0.5) + M[7] * py + M[8];
    for (let x = 0; x < ow; x++, sx += M[0], sy += M[3], sw += M[6]) {
      if (sw <= 1e-9) continue;
      const u = sx / sw;
      const v = sy / sw;
      if (u < -1 || v < -1 || u > srcW + 1 || v > srcH + 1) continue;
      // Linear minification factor = sqrt(|det J|), with det J = det M / w^3.
      const scale = Math.sqrt(detM / (sw * sw * sw));
      let r: number;
      let g: number;
      let b: number;
      let a: number;
      if (scale <= 1.15) {
        sample(levels[0]!, u, v, s0);
        [r, g, b, a] = [s0[0]!, s0[1]!, s0[2]!, s0[3]!];
      } else {
        const lod = Math.min(MAX_LEVEL, Math.log2(scale));
        const n = Math.floor(lod);
        const t = lod - n;
        const la = getLevel(n);
        sample(la, (u * la.w) / srcW, (v * la.h) / srcH, s0);
        if (t > 0.001 && n < MAX_LEVEL) {
          const lb = getLevel(n + 1);
          sample(lb, (u * lb.w) / srcW, (v * lb.h) / srcH, s1);
          r = s0[0]! + (s1[0]! - s0[0]!) * t;
          g = s0[1]! + (s1[1]! - s0[1]!) * t;
          b = s0[2]! + (s1[2]! - s0[2]!) * t;
          a = s0[3]! + (s1[3]! - s0[3]!) * t;
        } else {
          [r, g, b, a] = [s0[0]!, s0[1]!, s0[2]!, s0[3]!];
        }
      }
      if (a < 0.5) continue;
      const o = (y * ow + x) * 4;
      const inv = 255 / a;
      out[o] = r * inv + 0.5;
      out[o + 1] = g * inv + 0.5;
      out[o + 2] = b * inv + 0.5;
      out[o + 3] = a + 0.5;
    }
  }
  const canvas = env.createCanvas(ow, oh);
  get2d(canvas).putImageData(makeImageData(env, out, ow, oh), 0, 0);
  return { canvas, x: x0, y: y0 };
}
