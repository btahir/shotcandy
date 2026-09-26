/** Small Canvas 2D helpers shared by layers and frames. */
import { toCss } from "../math/color";
import type { Radii, Rect } from "../math/geometry";
import { type Path, roundedRectPath, tracePath } from "../math/path";
import type { Shape } from "../frames/types";
import type { Ctx2D } from "./env";

export function withState<T>(ctx: Ctx2D, fn: () => T): T {
  ctx.save();
  try {
    return fn();
  } finally {
    ctx.restore();
  }
}

export function shapePath(shape: Shape): Path {
  return roundedRectPath(shape.rect, shape.radii, shape.smoothing);
}

export function beginPath(ctx: Ctx2D, path: Path): void {
  ctx.beginPath();
  tracePath(ctx, path);
}

export function fillPath(
  ctx: Ctx2D,
  path: Path,
  style: string | CanvasGradient | CanvasPattern,
  rule: CanvasFillRule = "nonzero",
): void {
  beginPath(ctx, path);
  ctx.fillStyle = typeof style === "string" ? toCss(style) : style;
  ctx.fill(rule);
}

export function strokePath(ctx: Ctx2D, path: Path, color: string, width: number): void {
  beginPath(ctx, path);
  ctx.strokeStyle = toCss(color);
  ctx.lineWidth = width;
  ctx.stroke();
}

export function clipPath(ctx: Ctx2D, path: Path): void {
  beginPath(ctx, path);
  ctx.clip();
}

export function fillRoundedRect(
  ctx: Ctx2D,
  r: Rect,
  radii: Radii | number,
  style: string | CanvasGradient,
  smoothing = 0,
): void {
  fillPath(ctx, roundedRectPath(r, radii, smoothing), style);
}

/** Stroke drawn fully inside the shape edge (crisp hairlines on windows and devices). */
export function innerStroke(ctx: Ctx2D, path: Path, color: string, width: number): void {
  withState(ctx, () => {
    clipPath(ctx, path);
    strokePath(ctx, path, color, width * 2);
  });
}

/** Circle helper. */
export function fillCircle(ctx: Ctx2D, cx: number, cy: number, r: number, color: string): void {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = toCss(color);
  ctx.fill();
}

export function vGradient(
  ctx: Ctx2D,
  y0: number,
  y1: number,
  c0: string,
  c1: string,
): CanvasGradient {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, toCss(c0));
  g.addColorStop(1, toCss(c1));
  return g;
}
