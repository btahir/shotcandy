/**
 * Annotation drawing: text, arrows and rectangle highlights. (Redactions are
 * applied to the content raster in content.ts so they tilt and clip with it.)
 *
 * Each annotation is drawn relative to an anchor box in the context's current
 * units; `unit` converts card units (stroke widths, font sizes) to those units.
 */
import { parseColor, toCss } from "../math/color";
import type { Rect } from "../math/geometry";
import { roundedRectPath, tracePath } from "../math/path";
import type { Annotation, ArrowAnnotation, RectAnnotation, TextAnnotation } from "../scene/types";
import { beginPath, clipPath, fillRoundedRect, withState } from "./draw";
import type { Ctx2D } from "./env";
import { fontStack } from "./fonts";

export interface AnnotationBox {
  rect: Rect;
  /** Current units per card unit. */
  unit: number;
  /** Optional clip for spotlight dimming (e.g. the content's rounded rect). */
  clip?: { rect: Rect; radii: readonly [number, number, number, number]; smoothing: number };
}

export function drawAnnotation(ctx: Ctx2D, a: Annotation, box: AnnotationBox): void {
  switch (a.kind) {
    case "text":
      drawText(ctx, a, box);
      return;
    case "arrow":
      drawArrow(ctx, a, box);
      return;
    case "rect":
      drawRect(ctx, a, box);
      return;
    case "redact":
      return;
  }
}

function px(box: AnnotationBox, u: number, v: number) {
  return { x: box.rect.x + u * box.rect.width, y: box.rect.y + v * box.rect.height };
}

function drawText(ctx: Ctx2D, a: TextAnnotation, box: AnnotationBox): void {
  if (!a.text) return;
  const size = a.size * box.unit;
  const p = px(box, a.x, a.y);
  withState(ctx, () => {
    ctx.font = `${a.weight} ${size}px ${fontStack(a.font)}`;
    ctx.textAlign = a.align;
    ctx.textBaseline = "middle";
    const lines = a.text.split("\n");
    const lh = size * 1.2;
    const widths = lines.map((l) => ctx.measureText(l).width);
    const maxW = Math.max(...widths);
    const totalH = lh * lines.length;
    const top = p.y - totalH / 2;
    if (a.background) {
      const padX = size * 0.5;
      const padY = size * 0.28;
      const left = a.align === "left" ? p.x : a.align === "right" ? p.x - maxW : p.x - maxW / 2;
      const rectH = totalH + padY * 2;
      fillRoundedRect(
        ctx,
        { x: left - padX, y: top - padY, width: maxW + padX * 2, height: rectH },
        Math.min(rectH / 2, size * 0.7),
        a.background,
        0.6,
      );
    }
    ctx.fillStyle = toCss(a.color);
    lines.forEach((line, i) => ctx.fillText(line, p.x, top + lh * (i + 0.5)));
  });
}

/** Geometry of an arrow in the anchor's units; exported for hit-testing and tests. */
export function arrowGeometry(a: ArrowAnnotation, box: AnnotationBox) {
  const p1 = px(box, a.x1, a.y1);
  const p2 = px(box, a.x2, a.y2);
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy) || 1;
  // Control point offset perpendicular to the shaft.
  const nx = -dy / len;
  const ny = dx / len;
  const bend = a.curve * len * 0.5;
  const ctrl = { x: (p1.x + p2.x) / 2 + nx * bend, y: (p1.y + p2.y) / 2 + ny * bend };
  // Tangent at the tip of a quadratic Bézier is (p2 - ctrl).
  const tx = p2.x - ctrl.x;
  const ty = p2.y - ctrl.y;
  const tl = Math.hypot(tx, ty) || 1;
  const width = a.width * box.unit;
  const headLen = Math.min(len * 0.6, width * 4.2);
  const headHalf = headLen * 0.62;
  return { p1, p2, ctrl, dir: { x: tx / tl, y: ty / tl }, width, headLen, headHalf, len };
}

function drawArrow(ctx: Ctx2D, a: ArrowAnnotation, box: AnnotationBox): void {
  const g = arrowGeometry(a, box);
  if (g.len < 1e-6) return;
  const { p1, p2, ctrl, dir, width, headLen, headHalf } = g;
  // Shorten the shaft so its round cap does not poke through a triangle head.
  const inset = a.head === "triangle" ? headLen * 0.8 : 0;
  const end = { x: p2.x - dir.x * inset, y: p2.y - dir.y * inset };
  withState(ctx, () => {
    ctx.strokeStyle = toCss(a.color);
    ctx.fillStyle = toCss(a.color);
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.quadraticCurveTo(ctrl.x, ctrl.y, end.x, end.y);
    ctx.stroke();
    const base = { x: p2.x - dir.x * headLen, y: p2.y - dir.y * headLen };
    const left = { x: base.x - dir.y * headHalf, y: base.y + dir.x * headHalf };
    const right = { x: base.x + dir.y * headHalf, y: base.y - dir.x * headHalf };
    if (a.head === "triangle") {
      ctx.beginPath();
      ctx.moveTo(p2.x, p2.y);
      ctx.lineTo(left.x, left.y);
      ctx.lineTo(right.x, right.y);
      ctx.closePath();
      ctx.lineWidth = width * 0.5;
      ctx.stroke();
      ctx.fill();
    } else if (a.head === "line") {
      ctx.beginPath();
      ctx.moveTo(left.x, left.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(right.x, right.y);
      ctx.stroke();
    }
  });
}

function drawRect(ctx: Ctx2D, a: RectAnnotation, box: AnnotationBox): void {
  const p = px(box, Math.min(a.x, a.x + a.w), Math.min(a.y, a.y + a.h));
  const r: Rect = {
    x: p.x,
    y: p.y,
    width: Math.abs(a.w) * box.rect.width,
    height: Math.abs(a.h) * box.rect.height,
  };
  if (r.width <= 0 || r.height <= 0) return;
  const radius = Math.min(a.radius * box.unit, r.width / 2, r.height / 2);
  const path = roundedRectPath(r, radius, 0.6);
  withState(ctx, () => {
    if (a.style === "spotlight") {
      if (box.clip)
        clipPath(ctx, roundedRectPath(box.clip.rect, box.clip.radii, box.clip.smoothing));
      const c = parseColor(a.color);
      // Dim everything but the highlighted region (even-odd fill of box + rect).
      ctx.beginPath();
      const outer = box.clip?.rect ?? box.rect;
      ctx.rect(outer.x - 1, outer.y - 1, outer.width + 2, outer.height + 2);
      tracePath(ctx, path);
      const alpha = c.a < 1 ? c.a : 0.5;
      ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
      ctx.fill("evenodd");
      return;
    }
    if (a.style === "fill") {
      const c = parseColor(a.color);
      beginPath(ctx, path);
      ctx.fillStyle = toCss(c, c.a < 1 ? 1 : 0.3);
      ctx.fill();
      return;
    }
    beginPath(ctx, path);
    ctx.strokeStyle = toCss(a.color);
    ctx.lineWidth = a.width * box.unit;
    ctx.lineJoin = "round";
    ctx.stroke();
  });
}
