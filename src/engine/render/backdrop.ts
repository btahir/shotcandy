/**
 * Backdrop finishing: dithering (no gradient banding), surface textures
 * (paper fibres, canvas weave, halftone) and a vignette with a soft spotlight
 * behind the card. All procedural and seeded, so renders stay deterministic.
 */
import { parseColor } from "../math/color";
import { mulberry32 } from "../math/random";
import type { TextureSpec, VignetteSpec } from "../scene/types";
import type { RenderCache } from "./cache";
import { type Ctx2D, type RenderEnvironment, get2d, makeImageData } from "./env";

// ----------------------------------------------------------------------------
// Dither
// ----------------------------------------------------------------------------

const DITHER_TILE = 64;
let ditherOffsets: Int8Array | null = null;

/** 64x64 tile of triangular-distributed offsets in [-1, 1] LSB (seeded). */
function ditherTile(): Int8Array {
  if (ditherOffsets) return ditherOffsets;
  const rng = mulberry32(0xd17e);
  const t = new Int8Array(DITHER_TILE * DITHER_TILE * 3);
  for (let i = 0; i < t.length; i++) t[i] = Math.round(rng() + rng() - 1);
  ditherOffsets = t;
  return t;
}

/**
 * Add +-1 LSB triangular noise to a region, per channel: breaks the 8-bit
 * steps of smooth gradients into invisible grain.
 */
export function ditherRegion(ctx: Ctx2D, w: number, h: number): void {
  const W = Math.floor(w);
  const H = Math.floor(h);
  if (W < 1 || H < 1) return;
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  const t = ditherTile();
  for (let y = 0; y < H; y++) {
    const row = (y & (DITHER_TILE - 1)) * DITHER_TILE;
    let i = y * W * 4;
    for (let x = 0; x < W; x++, i += 4) {
      const k = (row + (x & (DITHER_TILE - 1))) * 3;
      d[i] = d[i]! + t[k]!;
      d[i + 1] = d[i + 1]! + t[k + 1]!;
      d[i + 2] = d[i + 2]! + t[k + 2]!;
    }
  }
  ctx.putImageData(img, 0, 0);
}

// ----------------------------------------------------------------------------
// Textures
// ----------------------------------------------------------------------------

/** Periodic value noise on a lattice of `cells` per tile side, smoothstep-interpolated. */
function valueNoise(size: number, cells: number, rng: () => number): Float32Array {
  const lattice = new Float32Array(cells * cells);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rng() * 2 - 1;
  const out = new Float32Array(size * size);
  const s = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < size; y++) {
    const fy = (y / size) * cells;
    const y0 = Math.floor(fy) % cells;
    const y1 = (y0 + 1) % cells;
    const ty = s(fy - Math.floor(fy));
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * cells;
      const x0 = Math.floor(fx) % cells;
      const x1 = (x0 + 1) % cells;
      const tx = s(fx - Math.floor(fx));
      const a = lattice[y0 * cells + x0]!;
      const b = lattice[y0 * cells + x1]!;
      const c = lattice[y1 * cells + x0]!;
      const d = lattice[y1 * cells + x1]!;
      out[y * size + x] = a + (b - a) * tx + (c - a + (a - b - c + d) * tx) * ty;
    }
  }
  return out;
}

/** Tileable texture, `size` px square: translucent dark and light texels. */
export function textureTile(
  kind: TextureSpec["kind"],
  seed: number,
  size: number,
): Uint8ClampedArray {
  const rng = mulberry32(seed * 7919 + (kind === "paper" ? 1 : kind === "canvas" ? 2 : 3));
  const v = new Float32Array(size * size);
  const px = size / 256; // tile is authored at 256 px
  if (kind === "paper") {
    const blotch = valueNoise(size, 5, rng);
    const mid = valueNoise(size, 22, rng);
    const fine = valueNoise(size, 96, rng);
    for (let i = 0; i < v.length; i++) {
      v[i] = blotch[i]! * 3.2 + mid[i]! * 2.2 + fine[i]! * 3 + (rng() * 2 - 1) * 3.2;
    }
    // Fibres: short, slightly curved strokes, light and dark, wrapped at the edges.
    const fibres = 110;
    for (let f = 0; f < fibres; f++) {
      let x = rng() * size;
      let y = rng() * size;
      let a = rng() * Math.PI * 2;
      const len = (12 + rng() * 38) * px;
      const amp = (rng() < 0.7 ? 1 : -1) * (3 + rng() * 5);
      const bend = (rng() - 0.5) * 0.08;
      for (let s = 0; s < len; s += 0.5) {
        a += bend / px;
        x += Math.cos(a) * 0.5;
        y += Math.sin(a) * 0.5;
        const xi = ((Math.round(x) % size) + size) % size;
        const yi = ((Math.round(y) % size) + size) % size;
        const fade = Math.sin((s / len) * Math.PI);
        v[yi * size + xi] = v[yi * size + xi]! + amp * fade * 0.5;
      }
    }
  } else if (kind === "canvas") {
    const period = Math.max(3, Math.round(4 * px));
    const n = valueNoise(size, 48, rng);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const wx = Math.cos((2 * Math.PI * x) / period);
        const wy = Math.cos((2 * Math.PI * y) / period);
        const i = y * size + x;
        v[i] = (wx > 0 === wy > 0 ? 1 : -1) * Math.abs(wx * wy) * 9 + n[i]! * 5 + (rng() - 0.5) * 4;
      }
    }
  } else {
    // Halftone: a 45 degree dot screen whose dot size drifts with low-frequency noise.
    const cell = 14 * px;
    const n = valueNoise(size, 4, rng);
    const c = Math.SQRT1_2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = (x * c + y * c) / cell;
        const w = (-x * c + y * c) / cell;
        const du = u - Math.round(u);
        const dw = w - Math.round(w);
        const dist = Math.hypot(du, dw);
        const i = y * size + x;
        const r = 0.28 + n[i]! * 0.12;
        v[i] = dist < r ? -14 : dist < r + 0.08 ? -14 * (1 - (dist - r) / 0.08) : 0;
      }
    }
  }
  // Deviations become translucent black (darker) or white (lighter) texels, so
  // the texture reads on pale and deep backgrounds alike.
  const out = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < v.length; i++) {
    const d = v[i]!;
    const o = i * 4;
    out[o] = out[o + 1] = out[o + 2] = d < 0 ? 0 : 255;
    out[o + 3] = Math.min(255, Math.abs(d) * (d < 0 ? 1.7 : 1.9));
  }
  return out;
}

export function drawTexture(
  ctx: Ctx2D,
  spec: TextureSpec,
  w: number,
  h: number,
  deps: { env: RenderEnvironment; cache: RenderCache; scale: number },
): void {
  if (spec.amount <= 0) return;
  // The tile scales with the export scale so 1x and 2x exports look alike.
  const size = Math.max(64, Math.min(1024, Math.round(256 * deps.scale)));
  const key = `texture:${spec.kind}:${spec.seed}:${size}`;
  const tile = deps.cache.get(key, () => {
    const c = deps.env.createCanvas(size, size);
    get2d(c).putImageData(
      makeImageData(deps.env, textureTile(spec.kind, spec.seed, size), size, size),
      0,
      0,
    );
    return { value: c, bytes: size * size * 4 };
  });
  const pattern = ctx.createPattern(tile, "repeat");
  if (!pattern) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, spec.amount);
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

// ----------------------------------------------------------------------------
// Vignette and spotlight
// ----------------------------------------------------------------------------

export function drawVignette(
  ctx: Ctx2D,
  spec: VignetteSpec,
  w: number,
  h: number,
  focus: { x: number; y: number },
): void {
  const c = parseColor(spec.color);
  ctx.save();
  if (spec.spotlight > 0) {
    const r = Math.max(w, h) * 0.62;
    const g = ctx.createRadialGradient(focus.x, focus.y, 0, focus.x, focus.y, r);
    const a = Math.min(1, spec.spotlight) * 0.55;
    g.addColorStop(0, `rgba(255, 255, 255, ${a})`);
    g.addColorStop(0.45, `rgba(255, 255, 255, ${a * 0.42})`);
    g.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.globalCompositeOperation = "soft-light";
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  if (spec.amount > 0) {
    // Elliptical: the gradient is drawn in a space squashed to the canvas aspect.
    const r = (w / 2) * Math.SQRT2;
    ctx.translate(w / 2, h / 2);
    ctx.scale(1, h / w);
    const g = ctx.createRadialGradient(0, 0, r * 0.25, 0, 0, r);
    const a = Math.min(1, spec.amount);
    g.addColorStop(0, `rgba(${c.r}, ${c.g}, ${c.b}, 0)`);
    g.addColorStop(0.45, `rgba(${c.r}, ${c.g}, ${c.b}, ${a * 0.12})`);
    g.addColorStop(0.8, `rgba(${c.r}, ${c.g}, ${c.b}, ${a * 0.55})`);
    g.addColorStop(1, `rgba(${c.r}, ${c.g}, ${c.b}, ${a * 0.85})`);
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = g;
    ctx.fillRect(-w / 2, -w / 2, w, w);
  }
  ctx.restore();
}
