/**
 * Layered drop shadows.
 *
 * Canvas shadows are drawn by filling the silhouette far outside the canvas and
 * offsetting the shadow back into view, so only the shadow lands and the
 * (possibly transparent) content is never painted over by the silhouette.
 * Shadow blur/offset are not affected by the context transform, so everything
 * here works in device pixels with an identity transform.
 */
import type { Point } from "../math/geometry";
import { type Path, tracePath } from "../math/path";
import { parseColor } from "../math/color";
import type { ShadowLayer } from "../scene/types";
import type { Ctx2D } from "./env";

export interface ShadowDrawInput {
  layers: ShadowLayer[];
  color: string;
  /** Device pixels per card unit. */
  unit: number;
  /** Silhouette in device px for a spread (in cu); called once per layer. */
  silhouette: (spreadCu: number) => Path;
  /** Canvas size in device px (to place the silhouette off-canvas). */
  canvasWidth: number;
  canvasHeight: number;
}

export function drawShadows(ctx: Ctx2D, input: ShadowDrawInput): void {
  const { layers, unit } = input;
  if (layers.length === 0) return;
  const c = parseColor(input.color);
  const off = Math.ceil(input.canvasWidth + input.canvasHeight + 10000);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (const l of layers) {
    const path = input.silhouette(l.spread);
    ctx.shadowColor = `rgba(${c.r}, ${c.g}, ${c.b}, ${Math.min(1, l.opacity * c.a)})`;
    // Canvas shadowBlur is 2x the Gaussian sigma; our blur follows CSS box-shadow
    // (blur radius = 2 sigma), so they line up directly.
    ctx.shadowBlur = l.blur * unit;
    ctx.shadowOffsetX = l.x * unit + off;
    ctx.shadowOffsetY = l.y * unit;
    ctx.beginPath();
    tracePath(ctx, translatePath(path, -off, 0));
    ctx.fillStyle = "#000";
    ctx.fill();
  }
  ctx.restore();
}

function translatePath(path: Path, dx: number, dy: number): Path {
  return path.map((c) => {
    switch (c.op) {
      case "M":
      case "L":
        return { ...c, x: c.x + dx, y: c.y + dy };
      case "C":
        return {
          ...c,
          x1: c.x1 + dx,
          y1: c.y1 + dy,
          x2: c.x2 + dx,
          y2: c.y2 + dy,
          x: c.x + dx,
          y: c.y + dy,
        };
      case "A":
        return { ...c, cx: c.cx + dx, cy: c.cy + dy };
      default:
        return c;
    }
  });
}

/** Transform a path with an affine map (a, b, c, d, e, f as in setTransform). */
export function affinePath(
  path: Path,
  m: { a: number; b: number; c: number; d: number; e: number; f: number },
): Path {
  const tp = (x: number, y: number): Point => ({
    x: m.a * x + m.c * y + m.e,
    y: m.b * x + m.d * y + m.f,
  });
  const scale = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
  const rot = Math.atan2(m.b, m.a);
  return path.map((cmd) => {
    switch (cmd.op) {
      case "M":
      case "L": {
        const p = tp(cmd.x, cmd.y);
        return { ...cmd, x: p.x, y: p.y };
      }
      case "C": {
        const p1 = tp(cmd.x1, cmd.y1);
        const p2 = tp(cmd.x2, cmd.y2);
        const p = tp(cmd.x, cmd.y);
        return { op: "C", x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, x: p.x, y: p.y };
      }
      case "A": {
        const p = tp(cmd.cx, cmd.cy);
        // Valid for similarity transforms (uniform scale + rotation), which is all the card uses.
        return { op: "A", cx: p.x, cy: p.y, r: cmd.r * scale, a0: cmd.a0 + rot, a1: cmd.a1 + rot };
      }
      default:
        return cmd;
    }
  });
}
