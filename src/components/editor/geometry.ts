/**
 * Screen <-> scene coordinate helpers for the annotation overlay. Works for
 * content-anchored annotations under 3D tilt (through the layout homography)
 * and for canvas-anchored ones.
 *
 * "Anchor units" are isotropic: card units for content anchors, 1x canvas
 * pixels for canvas anchors. `unit` converts annotation card-unit lengths
 * (stroke widths, font sizes) into anchor units.
 */
import {
  type Annotation,
  type AnnotationAnchor,
  type Point,
  type SceneLayout,
  type TextAnnotation,
  canvasToContent,
  notesRect,
  contentToCanvas,
  getFont,
} from "@/engine";

export interface Geo {
  layout: SceneLayout;
  zoom: number;
}

export function anchorSize(g: Geo, anchor: AnnotationAnchor): { w: number; h: number } {
  if (anchor === "content") {
    const r = notesRect(g.layout.card);
    return { w: r.width, h: r.height };
  }
  return { w: g.layout.canvas.width, h: g.layout.canvas.height };
}

export function anchorUnit(g: Geo, anchor: AnnotationAnchor): number {
  return anchor === "content" ? 1 : g.layout.k;
}

/** Normalized anchor coords -> screen px relative to the composition's top-left. */
export function toScreen(g: Geo, anchor: AnnotationAnchor, u: number, v: number): Point {
  if (anchor === "content") {
    const p = contentToCanvas(g.layout, u, v);
    return { x: p.x * g.zoom, y: p.y * g.zoom };
  }
  return { x: u * g.layout.canvas.width * g.zoom, y: v * g.layout.canvas.height * g.zoom };
}

/** Screen px (relative to the composition) -> normalized anchor coords. */
export function fromScreen(g: Geo, anchor: AnnotationAnchor, x: number, y: number): Point | null {
  if (anchor === "content") return canvasToContent(g.layout, x / g.zoom, y / g.zoom);
  return { x: x / g.zoom / g.layout.canvas.width, y: y / g.zoom / g.layout.canvas.height };
}

let measureCtx: CanvasRenderingContext2D | null = null;
function ctx(): CanvasRenderingContext2D | null {
  if (!measureCtx && typeof document !== "undefined")
    measureCtx = document.createElement("canvas").getContext("2d");
  return measureCtx;
}

/** Text box in anchor units, centred per alignment like the renderer draws it. */
export function textBox(
  g: Geo,
  a: TextAnnotation,
): { left: number; top: number; width: number; height: number; size: number; lines: string[] } {
  const unit = anchorUnit(g, a.anchor);
  const size = a.size * unit;
  const c = ctx();
  const lines = (a.text || " ").split("\n");
  let maxW = size * 0.6 * Math.max(...lines.map((l) => l.length), 1);
  if (c) {
    c.font = `${a.weight} 100px ${getFont(a.font).stack}`;
    maxW = Math.max(...lines.map((l) => c.measureText(l || " ").width)) * (size / 100);
  }
  const lh = size * 1.2;
  const totalH = lh * lines.length;
  const S = anchorSize(g, a.anchor);
  const px = a.x * S.w;
  const py = a.y * S.h;
  const padX = a.background ? size * 0.5 : size * 0.1;
  const padY = a.background ? size * 0.28 : size * 0.05;
  const left = a.align === "left" ? px : a.align === "right" ? px - maxW : px - maxW / 2;
  return {
    left: left - padX,
    top: py - totalH / 2 - padY,
    width: maxW + padX * 2,
    height: totalH + padY * 2,
    size,
    lines,
  };
}

/** Quad corners (tl, tr, br, bl) of an anchor-space rect, in screen px. */
export function quad(
  g: Geo,
  anchor: AnnotationAnchor,
  r: { left: number; top: number; width: number; height: number },
): Point[] {
  const S = anchorSize(g, anchor);
  const pts = [
    [r.left, r.top],
    [r.left + r.width, r.top],
    [r.left + r.width, r.top + r.height],
    [r.left, r.top + r.height],
  ];
  return pts.map(([x, y]) => toScreen(g, anchor, x! / S.w, y! / S.h));
}

/** Bounding rect of an annotation in anchor units. */
export function annotationRect(g: Geo, a: Annotation) {
  const S = anchorSize(g, a.anchor);
  if (a.kind === "text") return textBox(g, a);
  if (a.kind === "arrow") {
    const x1 = a.x1 * S.w;
    const y1 = a.y1 * S.h;
    const x2 = a.x2 * S.w;
    const y2 = a.y2 * S.h;
    return {
      left: Math.min(x1, x2),
      top: Math.min(y1, y2),
      width: Math.abs(x2 - x1),
      height: Math.abs(y2 - y1),
    };
  }
  return { left: a.x * S.w, top: a.y * S.h, width: a.w * S.w, height: a.h * S.h };
}

/** Arrow control point and curve midpoint in anchor units (mirrors render/annotations.ts). */
export function arrowPoints(g: Geo, a: Extract<Annotation, { kind: "arrow" }>) {
  const S = anchorSize(g, a.anchor);
  const p1 = { x: a.x1 * S.w, y: a.y1 * S.h };
  const p2 = { x: a.x2 * S.w, y: a.y2 * S.h };
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const bend = a.curve * len * 0.5;
  const ctrl = { x: (p1.x + p2.x) / 2 + nx * bend, y: (p1.y + p2.y) / 2 + ny * bend };
  const mid = {
    x: 0.25 * p1.x + 0.5 * ctrl.x + 0.25 * p2.x,
    y: 0.25 * p1.y + 0.5 * ctrl.y + 0.25 * p2.y,
  };
  return { p1, p2, ctrl, mid, len, nx, ny, S };
}

/** Curve value for a dragged midpoint (anchor units). */
export function curveFromMid(p1: Point, p2: Point, mid: Point): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const ctrl = { x: 2 * mid.x - 0.5 * (p1.x + p2.x), y: 2 * mid.y - 0.5 * (p1.y + p2.y) };
  const off = (ctrl.x - (p1.x + p2.x) / 2) * nx + (ctrl.y - (p1.y + p2.y) / 2) * ny;
  return Math.max(-1, Math.min(1, off / (len * 0.5)));
}
