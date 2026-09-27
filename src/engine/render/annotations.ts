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
import { easeBack, easeInOut, window01 } from "../animation/easing";
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
  if (a.kind !== "redact" && a.reveal !== undefined && a.reveal <= 0) return;
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
  const reveal = a.reveal ?? 1;
  const size = a.size * box.unit;
  const p = px(box, a.x, a.y);
  withState(ctx, () => {
    ctx.font = `${a.weight} ${size}px ${fontStack(a.font)}`;
    ctx.textBaseline = "middle";
    const lines = a.text.split("\n");
    const lh = size * 1.2;
    const widths = lines.map((l) => ctx.measureText(l).width);
    const maxW = Math.max(...widths);
    const totalH = lh * lines.length;
    const top = p.y - totalH / 2;
    // Draw-on: the pill pops in, then the text types itself.
    const pill = a.background ? window01(reveal, 0, 0.22) : 1;
    const typed = a.background ? window01(reveal, 0.14, 1) : reveal;
    if (a.background && pill > 0) {
      const padX = size * 0.5;
      const padY = size * 0.28;
      const left = a.align === "left" ? p.x : a.align === "right" ? p.x - maxW : p.x - maxW / 2;
      const rectH = totalH + padY * 2;
      const r = { x: left - padX, y: top - padY, width: maxW + padX * 2, height: rectH };
      if (pill < 1) {
        const k = 0.6 + 0.4 * easeBack(pill);
        const cx = r.x + r.width / 2;
        const cy = r.y + r.height / 2;
        ctx.globalAlpha *= Math.min(1, pill * 2.5);
        ctx.translate(cx, cy);
        ctx.scale(k, k);
        ctx.translate(-cx, -cy);
      }
      fillRoundedRect(ctx, r, Math.min(rectH / 2, size * 0.7), a.background, 0.6);
    }
    ctx.fillStyle = toCss(a.color);
    if (typed >= 1) {
      ctx.textAlign = a.align;
      lines.forEach((line, i) => ctx.fillText(line, p.x, top + lh * (i + 0.5)));
      return;
    }
    // Typewriter: characters appear in reading order at their final positions.
    const chars = Array.from(a.text.replace(/\n/g, ""));
    let left = Math.ceil(chars.length * typed);
    ctx.textAlign = "left";
    lines.forEach((line, i) => {
      if (left <= 0) return;
      const glyphs = Array.from(line);
      const shown = glyphs.slice(0, left).join("");
      left -= glyphs.length;
      const w = widths[i]!;
      const x = a.align === "left" ? p.x : a.align === "right" ? p.x - w : p.x - w / 2;
      ctx.fillText(shown, x, top + lh * (i + 0.5));
    });
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
  const reveal = a.reveal ?? 1;
  // Draw-on: the shaft grows along the curve, then the head pops out at the tip.
  const shaft = easeInOut(window01(reveal, 0, a.head === "none" ? 1 : 0.78));
  const head = a.head === "none" ? 0 : window01(reveal, 0.7, 1);
  const hk = head >= 1 ? 1 : easeBack(head);
  // Shorten the shaft so its round cap does not poke through a triangle head.
  const inset = a.head === "triangle" ? headLen * 0.8 * Math.min(1, hk) : 0;
  const end = { x: p2.x - dir.x * inset, y: p2.y - dir.y * inset };
  withState(ctx, () => {
    ctx.strokeStyle = toCss(a.color);
    ctx.fillStyle = toCss(a.color);
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    if (shaft >= 1) ctx.quadraticCurveTo(ctrl.x, ctrl.y, end.x, end.y);
    else {
      // De Casteljau split of the quadratic at `shaft`.
      const t = shaft;
      const q0 = { x: p1.x + (ctrl.x - p1.x) * t, y: p1.y + (ctrl.y - p1.y) * t };
      const q1 = { x: ctrl.x + (end.x - ctrl.x) * t, y: ctrl.y + (end.y - ctrl.y) * t };
      const q = { x: q0.x + (q1.x - q0.x) * t, y: q0.y + (q1.y - q0.y) * t };
      ctx.quadraticCurveTo(q0.x, q0.y, q.x, q.y);
    }
    if (shaft > 0) ctx.stroke();
    if (head <= 0) return;
    const hl = headLen * hk;
    const hh = headHalf * hk;
    const base = { x: p2.x - dir.x * hl, y: p2.y - dir.y * hl };
    const left = { x: base.x - dir.y * hh, y: base.y + dir.x * hh };
    const right = { x: base.x + dir.y * hh, y: base.y - dir.x * hh };
    if (a.head === "triangle") {
      ctx.beginPath();
      ctx.moveTo(p2.x, p2.y);
      ctx.lineTo(left.x, left.y);
      ctx.lineTo(right.x, right.y);
      ctx.closePath();
      ctx.lineWidth = width * 0.5 * Math.min(1, hk);
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
  const reveal = a.reveal ?? 1;
  withState(ctx, () => {
    if (reveal < 1 && a.style !== "spotlight") {
      // Draw-on: pop in from the centre with a small overshoot.
      const k = 0.55 + 0.45 * easeBack(reveal);
      const cx = r.x + r.width / 2;
      const cy = r.y + r.height / 2;
      ctx.globalAlpha *= Math.min(1, reveal * 2.5);
      ctx.translate(cx, cy);
      ctx.scale(k, k);
      ctx.translate(-cx, -cy);
    }
    if (a.style === "spotlight") {
      if (box.clip)
        clipPath(ctx, roundedRectPath(box.clip.rect, box.clip.radii, box.clip.smoothing));
      const c = parseColor(a.color);
      // Dim everything but the highlighted region (even-odd fill of box + rect).
      ctx.beginPath();
      const outer = box.clip?.rect ?? box.rect;
      ctx.rect(outer.x - 1, outer.y - 1, outer.width + 2, outer.height + 2);
      tracePath(ctx, path);
      const alpha = (c.a < 1 ? c.a : 0.5) * easeInOut(reveal);
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
