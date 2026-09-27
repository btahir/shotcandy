/**
 * Layout: turns a scene plus the content's natural pixel size into concrete
 * geometry. Pure math (no canvas), so it is exhaustively unit-tested and can be
 * shared by the renderer, hit-testing in the editor, and export sizing.
 *
 * Coordinate systems
 *  - card units (cu): card-local, origin at the card's top-left (including the
 *    border ring); the content's longer side is 1000 cu.
 *  - canvas px: output pixels at scale 1. Export multiplies by an integer scale.
 */
import { resolveFrame } from "../frames/registry";
import type { FrameGeometry, Shape } from "../frames/types";
import {
  type Point,
  type Radii,
  type Rect,
  type Size,
  boundsOfPoints,
  expandRadii,
  rectCorners,
  unionRect,
} from "../math/geometry";
import {
  type Mat3,
  applyMat3,
  invert,
  isAffine,
  multiply,
  scaling,
  tiltHomography,
  translation,
} from "../math/matrix";
import type { Scene } from "../scene/types";

/** Longest side of the content, in card units. */
export const CONTENT_UNITS = 1000;
/** Largest canvas side at 1x (browsers cap canvases around 16k-32k px). */
export const MAX_CANVAS_SIDE = 16384;

export interface CardGeometry {
  /** Card bounds (including border ring), cu. */
  size: Size;
  /** Effective inset width (0 inside device frames). */
  inset: number;
  frame: { id: string; origin: Point; geometry: FrameGeometry } | null;
  /** Silhouette shapes (without the border ring), card-local cu. */
  outline: Shape[];
  /** Silhouette grown by the border width, or null without a border. */
  borderOutline: Shape[] | null;
  plate: Rect;
  plateRadii: Radii;
  smoothing: number;
  content: Rect;
  contentRadii: Radii;
}

export interface SceneLayout {
  /** Output size at scale 1, integer pixels. */
  canvas: Size;
  /** Pixels (at scale 1) per card unit. */
  k: number;
  card: CardGeometry;
  /** Card-local cu -> canvas px (scale 1). Affine unless the card is tilted in 3D. */
  cardToCanvas: Mat3;
  canvasToCard: Mat3 | null;
  /** True when cardToCanvas has a perspective component. */
  perspective: boolean;
  /** Card corners in canvas px (tl, tr, br, bl). */
  cardQuad: [Point, Point, Point, Point];
  /** Natural content size in source pixels (after crop). */
  contentPixels: Size;
}

/** Content size in cu for a natural pixel size (longer side = 1000 cu). */
export function contentUnits(px: Size): Size {
  const m = Math.max(px.width, px.height, 1e-9);
  return {
    width: (px.width / m) * CONTENT_UNITS,
    height: (px.height / m) * CONTENT_UNITS,
  };
}

function offsetShape(s: Shape, dx: number, dy: number): Shape {
  return { ...s, rect: { ...s.rect, x: s.rect.x + dx, y: s.rect.y + dy } };
}

function growShape(s: Shape, d: number): Shape {
  return {
    rect: {
      x: s.rect.x - d,
      y: s.rect.y - d,
      width: s.rect.width + 2 * d,
      height: s.rect.height + 2 * d,
    },
    radii: expandRadii(s.radii, d),
    smoothing: s.smoothing,
  };
}

/** Assemble the card: content, inset plate, frame and border ring. */
export function computeCardGeometry(scene: Scene, contentPx: Size): CardGeometry {
  const { card } = scene;
  const c = contentUnits(contentPx);
  const resolved = resolveFrame(card.frame.id);
  // Device frames have no inset plate: the screen is the content.
  const inset = resolved && !resolved.kind.supportsInset ? 0 : card.inset.width;
  const plate: Size = { width: c.width + 2 * inset, height: c.height + 2 * inset };

  let outline: Shape[];
  let plateRect: Rect;
  let plateRadii: Radii;
  let smoothing = card.smoothing;
  let frameBounds: Rect;
  let frame: CardGeometry["frame"] = null;

  if (resolved) {
    const geo = resolved.kind.layout(resolved.spec, {
      plate,
      content: c,
      radius: card.radius,
      smoothing: card.smoothing,
    });
    outline = geo.outline;
    plateRect = geo.screen;
    plateRadii = geo.screenRadii;
    smoothing = geo.screenSmoothing;
    frameBounds = { x: 0, y: 0, width: geo.size.width, height: geo.size.height };
    frame = { id: card.frame.id, origin: { x: 0, y: 0 }, geometry: geo };
  } else {
    const r = Math.min(card.radius, plate.width / 2, plate.height / 2);
    plateRect = { x: 0, y: 0, width: plate.width, height: plate.height };
    plateRadii = [r, r, r, r];
    outline = [{ rect: plateRect, radii: plateRadii, smoothing }];
    frameBounds = plateRect;
  }

  const border = card.border.width;
  let borderOutline = border > 0 ? outline.map((s) => growShape(s, border)) : null;
  let bounds = frameBounds;
  if (borderOutline) for (const s of borderOutline) bounds = unionRect(bounds, s.rect);

  // Shift everything so the card bounds start at the origin.
  const dx = -bounds.x;
  const dy = -bounds.y;
  outline = outline.map((s) => offsetShape(s, dx, dy));
  borderOutline = borderOutline?.map((s) => offsetShape(s, dx, dy)) ?? null;
  plateRect = { ...plateRect, x: plateRect.x + dx, y: plateRect.y + dy };
  if (frame) frame = { ...frame, origin: { x: dx, y: dy } };

  const content: Rect = {
    x: plateRect.x + inset,
    y: plateRect.y + inset,
    width: c.width,
    height: c.height,
  };
  const contentRadii = plateRadii.map((r) =>
    r > 0 ? Math.max(0, r - inset) : 0,
  ) as unknown as Radii;

  return {
    size: { width: bounds.width, height: bounds.height },
    inset,
    frame,
    outline,
    borderOutline,
    plate: plateRect,
    plateRadii,
    smoothing,
    content,
    contentRadii,
  };
}

/** Natural pixel size of the scene's content before layout. */
export function contentPixelSize(scene: Scene, assetSize: Size | null): Size {
  const content = scene.content;
  if (content.kind === "placeholder") return { width: content.width, height: content.height };
  // Other kinds (code, posts, ...) report their natural size via the content registry.
  if (content.kind !== "image") return assetSize ?? { width: 1600, height: 1000 };
  const base = assetSize ?? { width: 1600, height: 1000 };
  const crop = content.crop;
  if (!crop) return base;
  return {
    width: Math.max(1, base.width * crop.width),
    height: Math.max(1, base.height * crop.height),
  };
}

/**
 * Full scene layout. `assetSize` is the natural pixel size of the content image
 * (null for placeholders or missing assets).
 */
export function computeLayout(scene: Scene, assetSize: Size | null): SceneLayout {
  const contentPx = contentPixelSize(scene, assetSize);
  const card = computeCardGeometry(scene, contentPx);
  const { tilt, transform } = scene.card;

  // Card-local -> projected coordinates centred on the card centre (cu).
  const H = tiltHomography(card.size.width, card.size.height, tilt);
  const projected = rectCorners({
    x: 0,
    y: 0,
    width: card.size.width,
    height: card.size.height,
  }).map((p) => applyMat3(H, p));
  const bbox = boundsOfPoints(projected);
  const pad = scene.canvas.padding;
  const fitW = bbox.width + 2 * pad;
  const fitH = bbox.height + 2 * pad;

  // Pixels per cu at the content's native resolution.
  let kNat = Math.max(contentPx.width, contentPx.height) / CONTENT_UNITS;
  const size = scene.canvas.size;
  let canvas: Size;
  let kFit: number;

  const cap = (w: number, h: number) => Math.min(1, MAX_CANVAS_SIDE / Math.max(w, h));

  if (size.kind === "fixed") {
    canvas = { width: size.width, height: size.height };
    kFit = Math.min(size.width / fitW, size.height / fitH);
  } else {
    kNat *= cap(fitW * kNat, fitH * kNat);
    let w = fitW * kNat;
    let h = fitH * kNat;
    if (size.kind === "aspect") {
      const r = size.ratioW / size.ratioH;
      if (w / h < r) w = h * r;
      else h = w / r;
      const c2 = cap(w, h);
      w *= c2;
      h *= c2;
      kNat *= c2;
    }
    canvas = { width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)) };
    // Keep the native scale exactly (not the rounded fit) so a 1x export shows
    // the screenshot pixel-for-pixel with no resampling.
    kFit = kNat;
  }

  const k = kFit * transform.scale;
  const cx = canvas.width / 2 + transform.offsetX * canvas.width;
  const cy = canvas.height / 2 + transform.offsetY * canvas.height;
  const bboxCx = bbox.x + bbox.width / 2;
  const bboxCy = bbox.y + bbox.height / 2;

  let cardToCanvas = multiply(
    translation(cx, cy),
    multiply(scaling(k), multiply(translation(-bboxCx, -bboxCy), H)),
  );

  const perspective = !isAffine(cardToCanvas, 1e-12);
  // Pixel-snap axis-aligned cards so 1x exports of native screenshots stay crisp.
  if (!perspective && Math.abs(cardToCanvas[1]) < 1e-9 && Math.abs(cardToCanvas[3]) < 1e-9) {
    cardToCanvas = [
      cardToCanvas[0],
      0,
      snap(cardToCanvas[2] + card.content.x * cardToCanvas[0]) - card.content.x * cardToCanvas[0],
      0,
      cardToCanvas[4],
      snap(cardToCanvas[5] + card.content.y * cardToCanvas[4]) - card.content.y * cardToCanvas[4],
      0,
      0,
      1,
    ];
  } else if (!perspective) {
    cardToCanvas = [
      cardToCanvas[0],
      cardToCanvas[1],
      cardToCanvas[2],
      cardToCanvas[3],
      cardToCanvas[4],
      cardToCanvas[5],
      0,
      0,
      1,
    ];
  }

  const quad = rectCorners({ x: 0, y: 0, width: card.size.width, height: card.size.height }).map(
    (p) => applyMat3(cardToCanvas, p),
  ) as [Point, Point, Point, Point];

  return {
    canvas,
    k,
    card,
    cardToCanvas,
    canvasToCard: invert(cardToCanvas),
    perspective,
    cardQuad: quad,
    contentPixels: contentPx,
  };
}

function snap(v: number): number {
  return Math.round(v);
}

// ----------------------------------------------------------------------------
// Coordinate helpers for the editor (hit-testing, placing annotations)
// ----------------------------------------------------------------------------

/** Normalized content coordinates (0..1) -> canvas px at scale 1. */
export function contentToCanvas(layout: SceneLayout, u: number, v: number): Point {
  const c = layout.card.content;
  return applyMat3(layout.cardToCanvas, { x: c.x + u * c.width, y: c.y + v * c.height });
}

/** Canvas px at scale 1 -> normalized content coordinates (may be outside 0..1). */
export function canvasToContent(layout: SceneLayout, x: number, y: number): Point | null {
  if (!layout.canvasToCard) return null;
  const p = applyMat3(layout.canvasToCard, { x, y });
  const c = layout.card.content;
  return { x: (p.x - c.x) / c.width, y: (p.y - c.y) / c.height };
}

/** Whether a canvas point (scale 1) lies on the card's content. */
export function hitContent(layout: SceneLayout, x: number, y: number): boolean {
  const p = canvasToContent(layout, x, y);
  return !!p && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
}

/** Output pixel size for an export scale. Always integers. */
export function outputSize(layout: SceneLayout, scale: number): Size {
  return {
    width: Math.round(layout.canvas.width * scale),
    height: Math.round(layout.canvas.height * scale),
  };
}
