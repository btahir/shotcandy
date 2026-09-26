/** Background layer: fills (solid, gradients, mesh, image) and grain. */
import { pickImage, type AssetResolver } from "../assets/types";
import {
  type OKLab,
  oklabToLinearRgb,
  linearToSrgbByte,
  parseColor,
  rgbToOklab,
  toCss,
} from "../math/color";
import { gaussianBlurRGBA } from "../math/blur";
import { coverRect, containRect, degToRad } from "../math/geometry";
import { mulberry32, stableStringify } from "../math/random";
import type { Palette } from "../palette/extract";
import { resolveAutoFill } from "../palette/suggest";
import type { BackgroundFill, GradientStop, GrainSpec, MeshPoint } from "../scene/types";
import type { RenderCache } from "./cache";
import { type Ctx2D, type RenderEnvironment, get2d, makeImageData } from "./env";

export interface BackgroundDeps {
  env: RenderEnvironment;
  cache: RenderCache;
  assets: AssetResolver;
  palette: Palette | null;
  /** Device pixels per card unit. */
  unit: number;
  /** Export scale (device px per canvas px). */
  scale: number;
}

function addStops(g: CanvasGradient, stops: GradientStop[]): CanvasGradient {
  for (const s of stops) g.addColorStop(Math.min(1, Math.max(0, s.offset)), toCss(s.color));
  return g;
}

/** CSS linear-gradient geometry: the gradient line passes through the centre. */
export function linearGradientLine(angleDeg: number, w: number, h: number) {
  const a = degToRad(angleDeg);
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const len = Math.abs(w * dx) + Math.abs(h * dy);
  const cx = w / 2;
  const cy = h / 2;
  return {
    x0: cx - (dx * len) / 2,
    y0: cy - (dy * len) / 2,
    x1: cx + (dx * len) / 2,
    y1: cy + (dy * len) / 2,
  };
}

export function drawBackground(
  ctx: Ctx2D,
  fill: BackgroundFill,
  grain: GrainSpec,
  w: number,
  h: number,
  deps: BackgroundDeps,
): void {
  drawFill(ctx, fill, w, h, deps);
  if (grain.amount > 0 && fill.kind !== "none") drawGrain(ctx, grain, w, h, deps);
}

function drawFill(
  ctx: Ctx2D,
  fill: BackgroundFill,
  w: number,
  h: number,
  deps: BackgroundDeps,
): void {
  switch (fill.kind) {
    case "none":
      return;
    case "solid":
      ctx.fillStyle = toCss(fill.color);
      ctx.fillRect(0, 0, w, h);
      return;
    case "linear": {
      const l = linearGradientLine(fill.angle, w, h);
      ctx.fillStyle = addStops(ctx.createLinearGradient(l.x0, l.y0, l.x1, l.y1), fill.stops);
      ctx.fillRect(0, 0, w, h);
      return;
    }
    case "radial": {
      const r = (fill.radius * Math.hypot(w, h)) / 2;
      const cx = fill.cx * w;
      const cy = fill.cy * h;
      ctx.fillStyle = addStops(
        ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1e-3, r)),
        fill.stops,
      );
      ctx.fillRect(0, 0, w, h);
      return;
    }
    case "conic": {
      const g = ctx.createConicGradient(degToRad(fill.angle - 90), fill.cx * w, fill.cy * h);
      ctx.fillStyle = addStops(g, fill.stops);
      ctx.fillRect(0, 0, w, h);
      return;
    }
    case "mesh":
      drawMesh(ctx, fill.base, fill.points, w, h, deps);
      return;
    case "image":
      drawImageFill(ctx, fill, w, h, deps);
      return;
    case "auto":
      drawFill(ctx, resolveAutoFill(fill, deps.palette), w, h, deps);
      return;
  }
}

// ----------------------------------------------------------------------------
// Mesh gradient: Gaussian radial-basis blend of colour points in OKLab,
// computed at reduced resolution and upscaled (the field is smooth).
// ----------------------------------------------------------------------------

/** Resolution of the computed mesh field for an output size. */
export function meshFieldSize(w: number, h: number): { fw: number; fh: number } {
  const long = Math.max(w, h);
  const target = Math.min(640, Math.max(32, Math.ceil(long / 3)));
  const s = target / long;
  return { fw: Math.max(2, Math.round(w * s)), fh: Math.max(2, Math.round(h * s)) };
}

export function computeMeshField(
  base: string,
  points: MeshPoint[],
  fw: number,
  fh: number,
  aspect: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(fw * fh * 4);
  const toLab = (hex: string): OKLab => {
    const c = parseColor(hex);
    return rgbToOklab(c.r, c.g, c.b);
  };
  const baseLab = toLab(base);
  const pts = points.map((p) => ({ ...p, lab: toLab(p.color) }));
  // Work in a space where x is scaled by the aspect so blobs stay round.
  const diag = Math.hypot(aspect, 1);
  const wb = 0.12;
  const rng = mulberry32(0x5eed);
  for (let y = 0; y < fh; y++) {
    const ny = (y + 0.5) / fh;
    for (let x = 0; x < fw; x++) {
      const nx = (x + 0.5) / fw;
      let L = baseLab.L * wb;
      let A = baseLab.a * wb;
      let B = baseLab.b * wb;
      let W = wb;
      for (const p of pts) {
        const dx = (nx - p.x) * aspect;
        const dy = ny - p.y;
        const sigma = p.radius * diag * 0.5;
        const wgt = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
        L += p.lab.L * wgt;
        A += p.lab.a * wgt;
        B += p.lab.b * wgt;
        W += wgt;
      }
      const [r, g, b] = oklabToLinearRgb({ L: L / W, a: A / W, b: B / W });
      const i = (y * fw + x) * 4;
      // +-0.5 LSB ordered noise reduces banding once upscaled (seeded => deterministic).
      const d = rng() - 0.5;
      out[i] = linearToSrgbByte(r) + d;
      out[i + 1] = linearToSrgbByte(g) + d;
      out[i + 2] = linearToSrgbByte(b) + d;
      out[i + 3] = 255;
    }
  }
  return out;
}

function drawMesh(
  ctx: Ctx2D,
  base: string,
  points: MeshPoint[],
  w: number,
  h: number,
  deps: BackgroundDeps,
): void {
  const { fw, fh } = meshFieldSize(w, h);
  const key = `mesh:${fw}x${fh}:${stableStringify({ base, points })}`;
  const field = deps.cache.get(key, () => {
    const canvas = deps.env.createCanvas(fw, fh);
    const c = get2d(canvas);
    const data = computeMeshField(base, points, fw, fh, w / h);
    c.putImageData(makeImageData(deps.env, data, fw, fh), 0, 0);
    return { value: canvas, bytes: fw * fh * 4 };
  });
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(field, 0, 0, w, h);
  ctx.restore();
}

// ----------------------------------------------------------------------------
// Image background with blur and tint
// ----------------------------------------------------------------------------

function drawImageFill(
  ctx: Ctx2D,
  fill: Extract<BackgroundFill, { kind: "image" }>,
  w: number,
  h: number,
  deps: BackgroundDeps,
): void {
  const src = deps.assets.get(fill.assetId);
  if (!src) {
    ctx.fillStyle = "#e5e5e5";
    ctx.fillRect(0, 0, w, h);
    return;
  }
  const dest =
    fill.fit === "stretch"
      ? { x: 0, y: 0, width: w, height: h }
      : fill.fit === "contain"
        ? containRect(src, { x: 0, y: 0, width: w, height: h })
        : coverRect(src, { x: 0, y: 0, width: w, height: h }, { x: fill.focusX, y: fill.focusY });
  const sigma = fill.blur * deps.unit;
  const img = pickImage(src, sigma > 1 ? dest.width / 4 : dest.width);
  if (!img) return;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if (sigma > 0.5) {
    // Blur at reduced resolution: a blurred image has no fine detail to lose.
    const down = Math.max(1, Math.min(8, sigma / 3));
    const bw = Math.max(1, Math.round(dest.width / down));
    const bh = Math.max(1, Math.round(dest.height / down));
    const pad = Math.ceil((sigma / down) * 3);
    const key = `bgblur:${src.id}:${img.width}:${bw}x${bh}:${pad}:${sigma.toFixed(3)}`;
    const blurred = deps.cache.get(key, () => {
      const c = deps.env.createCanvas(bw + 2 * pad, bh + 2 * pad);
      const g = get2d(c, { willReadFrequently: true });
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = "high";
      // Extend edges by drawing the image stretched into the padding first.
      g.drawImage(img.image, 0, 0, bw + 2 * pad, bh + 2 * pad);
      g.drawImage(img.image, pad, pad, bw, bh);
      const data = g.getImageData(0, 0, bw + 2 * pad, bh + 2 * pad);
      gaussianBlurRGBA(data.data, data.width, data.height, sigma / down);
      g.putImageData(data, 0, 0);
      return { value: c, bytes: (bw + 2 * pad) * (bh + 2 * pad) * 4 };
    });
    ctx.drawImage(blurred, pad, pad, bw, bh, dest.x, dest.y, dest.width, dest.height);
  } else {
    ctx.drawImage(img.image, dest.x, dest.y, dest.width, dest.height);
  }
  if (Math.abs(fill.tint) > 0.001) {
    ctx.fillStyle = fill.tint > 0 ? `rgba(255,255,255,${fill.tint})` : `rgba(0,0,0,${-fill.tint})`;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
}

// ----------------------------------------------------------------------------
// Grain
// ----------------------------------------------------------------------------

export function grainTile(
  seed: number,
  amount: number,
  cell: number,
  tile = 128,
): Uint8ClampedArray {
  const rng = mulberry32(seed);
  const data = new Uint8ClampedArray(tile * tile * 4);
  const cells = Math.ceil(tile / cell);
  const values = new Float32Array(cells * cells);
  for (let i = 0; i < values.length; i++) values[i] = rng() - 0.5;
  const spread = 255 * Math.min(1, amount) * 0.5;
  for (let y = 0; y < tile; y++) {
    for (let x = 0; x < tile; x++) {
      const v = 128 + values[Math.floor(y / cell) * cells + Math.floor(x / cell)]! * 2 * spread;
      const i = (y * tile + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return data;
}

function drawGrain(ctx: Ctx2D, grain: GrainSpec, w: number, h: number, deps: BackgroundDeps): void {
  const cell = Math.max(1, Math.round(grain.size * deps.scale));
  const tile = Math.ceil(128 / cell) * cell;
  const key = `grain:${grain.seed}:${grain.amount}:${cell}:${tile}`;
  const canvas = deps.cache.get(key, () => {
    const c = deps.env.createCanvas(tile, tile);
    get2d(c).putImageData(
      makeImageData(deps.env, grainTile(grain.seed, grain.amount, cell, tile), tile, tile),
      0,
      0,
    );
    return { value: c, bytes: tile * tile * 4 };
  });
  const pattern = ctx.createPattern(canvas, "repeat");
  if (!pattern) return;
  ctx.save();
  ctx.globalCompositeOperation = "overlay";
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}
