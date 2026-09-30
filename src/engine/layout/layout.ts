/**
 * Layout: turns a scene plus the content's natural pixel size into concrete
 * geometry. Pure math (no canvas), so it is exhaustively unit-tested and can be
 * shared by the renderer, hit-testing in the editor, and export sizing.
 *
 * Coordinate systems
 *  - card units (cu): card-local, origin at the card's top-left (including the
 *    border ring); the content's reference side is 1000 cu (see referenceSide).
 *  - canvas px: output pixels at scale 1. Export multiplies by an integer scale.
 *
 * Composition
 *  The card sits in a "design box": the card plus padding, minus whatever part
 *  bleeds off the canvas (anchor + bleed). Auto canvases are the design box;
 *  aspect and fixed canvases place the box by anchor, lift it optically when
 *  there is room, and (fit "auto"/"fill") grow the card to remove dead bands,
 *  letting it bleed off one edge instead.
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
import { resolveShadowLayers } from "../presets/shadows";
import { type CaptionLayout, captionActive, captionLayout } from "./caption";
import type { CanvasAnchor, CropRect, ImageContent, Scene } from "../scene/types";

/** Reference side of the content, in card units. */
export const CONTENT_UNITS = 1000;
/** The reference side is the long side, capped at this multiple of the short side. */
export const REFERENCE_ASPECT_CAP = 1.8;
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
  /**
   * Where content-anchored annotations live, when it isn't `content`: a grid
   * cell shows only part of the screenshot (a cover crop), and marks stay on
   * the image they were placed on, so they are anchored to the whole image as
   * it would be drawn (partly outside the cell, clipped away). Absent: `content`.
   */
  notes?: Rect;
}

/** The rect content-anchored annotations are placed in (card units). */
export function notesRect(card: CardGeometry): Rect {
  return card.notes ?? card.content;
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
  /** The caption block above the card, when the scene has one (canvas px at scale 1). */
  caption?: CaptionLayout;
}

/**
 * The side of the content that measures 1000 cu: the longer side, capped at
 * 1.8x the shorter one. Up to 16:9 this is simply the long side; a 1:10
 * full-page capture measures its padding, radius and shadows from its width
 * instead of its enormous height.
 */
export function referenceSide(px: Size): number {
  const long = Math.max(px.width, px.height, 1e-9);
  const short = Math.max(Math.min(px.width, px.height), 1e-9);
  return Math.min(long, REFERENCE_ASPECT_CAP * short);
}

/** Content size in cu for a natural pixel size (reference side = 1000 cu). */
export function contentUnits(px: Size): Size {
  const m = referenceSide(px);
  return {
    width: (px.width / m) * CONTENT_UNITS,
    height: (px.height / m) * CONTENT_UNITS,
  };
}

// ----------------------------------------------------------------------------
// Long captures: show the top of very tall screenshots
// ----------------------------------------------------------------------------

const FULL_CROP: CropRect = { x: 0, y: 0, width: 1, height: 1 };
/** Captures taller than this (height / width) are capped when `tall` is "auto". */
export const TALL_THRESHOLD = 3;

/** Height / width the visible top of a long capture is capped to, by frame. */
export function tallCap(frameId: string, widthPx: number): number {
  if (frameId === "phone") return 19.5 / 9;
  if (frameId === "tablet") return 1.4;
  if (frameId === "laptop") return 0.625;
  // Narrow captures are phone pages; wide ones are desktop pages.
  return widthPx <= 1290 ? 19.5 / 9 : 0.75;
}

export interface EffectiveCrop {
  crop: CropRect;
  /** True when a long capture was capped to its top. */
  capped: boolean;
}

/** The crop actually drawn: the user's crop, capped to the top for long captures. */
export function effectiveCrop(
  content: ImageContent,
  assetSize: Size | null,
  frameId: string,
): EffectiveCrop {
  const base = content.crop ?? FULL_CROP;
  if (!assetSize || content.tall === "full") return { crop: base, capped: false };
  const w = assetSize.width * base.width;
  const h = assetSize.height * base.height;
  const aspect = h / Math.max(1e-9, w);
  const cap = tallCap(frameId, w);
  const limit = content.tall === "top" || aspect > TALL_THRESHOLD ? cap : Infinity;
  if (aspect <= limit + 1e-9) return { crop: base, capped: false };
  return { crop: { ...base, height: base.height * (limit / aspect) }, capped: true };
}

/** Bottom fade (fraction of content height) for a capped long capture. */
export function contentFade(content: ImageContent, capped: boolean): number {
  if (!capped) return 0;
  return Math.min(0.5, Math.max(0, content.fade ?? 0.18));
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
  return cardGeometryForUnits(scene, contentUnits(contentPx));
}

/**
 * The card around content of an explicit size in card units. Multi-screen
 * layouts size every screen in one shared unit this way, so frame chrome,
 * radius, border and shadow match across screens.
 */
export function cardGeometryForUnits(scene: Scene, c: Size): CardGeometry {
  const { card } = scene;
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

  const geoContent = frame?.geometry.content;
  const content: Rect = geoContent
    ? { ...geoContent, x: geoContent.x + dx, y: geoContent.y + dy }
    : {
        x: plateRect.x + inset,
        y: plateRect.y + inset,
        width: c.width,
        height: c.height,
      };
  const contentRadii =
    geoContent && frame?.geometry.contentRadii
      ? frame.geometry.contentRadii
      : (plateRadii.map((r) => (r > 0 ? Math.max(0, r - inset) : 0)) as unknown as Radii);

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
  const crop = effectiveCrop(content, assetSize, scene.card.frame.id).crop;
  if (crop === FULL_CROP) return base;
  return {
    width: Math.max(1, base.width * crop.width),
    height: Math.max(1, base.height * crop.height),
  };
}

/**
 * Full scene layout. `assetSize` is the natural pixel size of the content image
 * (null for placeholders or missing assets).
 */
/**
 * Layout with the caption card: the text takes the top of the canvas and the
 * card is composed in the space below. Auto canvases grow taller by the
 * caption's height (the card keeps its native pixels); fixed and ratio
 * canvases keep their size and fit the card into what's left.
 */
export function computeLayout(scene: Scene, assetSize: Size | null): SceneLayout {
  return withCaption(
    scene,
    (s) => computeLayoutBase(s, assetSize),
    (l) => l.cardQuad.map((p) => p.y),
    shiftLayout,
  );
}

/** Move a layout down by `dy` on a canvas of the given size, attaching the caption. */
export function shiftLayout(
  l: SceneLayout,
  canvas: Size,
  dy: number,
  caption: CaptionLayout,
): SceneLayout {
  const cardToCanvas = multiply(translation(0, dy), l.cardToCanvas);
  return {
    ...l,
    canvas,
    cardToCanvas,
    canvasToCard: invert(cardToCanvas),
    cardQuad: l.cardQuad.map((p) => ({ x: p.x, y: p.y + dy })) as SceneLayout["cardQuad"],
    caption,
  };
}

/**
 * The caption card: the text takes the top of the canvas and the design is
 * composed in the space below. `base` lays out a scene without a caption,
 * `ys` lists the vertical extent of what it placed (card corners), and
 * `shift` moves a placement down. Shared by single cards and screen groups.
 */
export function withCaption<L extends { canvas: Size }>(
  scene: Scene,
  base: (s: Scene) => L,
  ys: (l: L) => number[],
  shift: (l: L, canvas: Size, dy: number, caption: CaptionLayout) => L,
): L {
  if (!captionActive(scene)) return base(scene);
  const { caption: spec, ...plain } = scene;
  const first0 = base(plain);
  const W = first0.canvas.width;
  const H0 = first0.canvas.height;
  const cap = captionLayout(spec!, W, H0);
  const top = Math.round(cap.height);
  const shiftBy = (l: L, canvasH: number, dy = top, c = cap): L =>
    shift(l, { width: W, height: canvasH }, dy, c);
  if (plain.canvas.size.kind === "auto") return shiftBy(first0, H0 + top);
  const regionH = Math.max(1, H0 - top);
  const region: Scene = {
    ...plain,
    canvas: { ...plain.canvas, size: { kind: "fixed", width: W, height: regionH } },
  };
  const inner = base(region);
  // Balance the group: when the card has room around it, pull it up under the
  // caption and move the caption down, so text and card sit together with
  // equal space above and below (instead of text at the top, card mid-way).
  const yList = ys(inner);
  const t0 = Math.min(...yList);
  const b0 = Math.max(...yList);
  const first = cap.blocks[0]!;
  const last = cap.blocks[cap.blocks.length - 1]!;
  const y0 = first.box.y;
  const tb = last.box.y + last.box.height;
  const mg = Math.min(W, H0) * 0.07;
  const centred = (plain.canvas.anchor ?? "center") === "center";
  if (centred && t0 >= 0 && b0 <= regionH) {
    const e = (2 * top + t0 + b0 - tb - H0 + y0 - mg) / 2;
    const d = H0 - top - b0 + e - y0;
    if (d > 0 && top - e + b0 <= H0 && top - e + t0 >= tb + d) {
      const dd = Math.round(d);
      const moved: CaptionLayout = {
        ...cap,
        blocks: cap.blocks.map((bl) => ({
          ...bl,
          box: { ...bl.box, y: bl.box.y + dd },
          lines: bl.lines.map((ln) => ({ ...ln, y: ln.y + dd })),
        })),
      };
      return shiftBy(inner, H0, top - Math.round(e), moved);
    }
  }
  return shiftBy(inner, H0);
}

function computeLayoutBase(scene: Scene, assetSize: Size | null): SceneLayout {
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

  // Composition in card units: canvas size and where the card's bbox sits.
  const comp = compose(scene, bbox.width, bbox.height, shadowDrop(scene));

  // Pixels per cu at the content's native resolution (small sources upscaled by a whole number).
  let kNat = (referenceSide(contentPx) / CONTENT_UNITS) * upscaleFactor(scene, contentPx);
  const size = scene.canvas.size;
  let canvas: Size;
  let kFit: number;

  const cap = (w: number, h: number) => Math.min(1, MAX_CANVAS_SIDE / Math.max(w, h));

  if (size.kind === "fixed") {
    canvas = { width: size.width, height: size.height };
    kFit = Math.min(size.width / comp.width, size.height / comp.height);
  } else {
    kNat *= cap(comp.width * kNat, comp.height * kNat);
    canvas = {
      width: Math.max(1, Math.round(comp.width * kNat)),
      height: Math.max(1, Math.round(comp.height * kNat)),
    };
    // Keep the native scale exactly (not the rounded fit) so a 1x export shows
    // the screenshot pixel-for-pixel with no resampling.
    kFit = kNat;
  }

  const k = kFit * transform.scale;
  // Centre of the card's bbox in canvas px (fixed canvases centre the composition).
  const ox = (canvas.width - comp.width * kFit) / 2;
  const oy = (canvas.height - comp.height * kFit) / 2;
  const cx = ox + (comp.cardX + bbox.width / 2) * kFit + transform.offsetX * canvas.width;
  const cy = oy + (comp.cardY + bbox.height / 2) * kFit + transform.offsetY * canvas.height;
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

// ----------------------------------------------------------------------------
// Composition
// ----------------------------------------------------------------------------

const ANCHORS: Record<CanvasAnchor, [number, number]> = {
  center: [0, 0],
  top: [0, -1],
  bottom: [0, 1],
  left: [-1, 0],
  right: [1, 0],
  "top-left": [-1, -1],
  "top-right": [1, -1],
  "bottom-left": [-1, 1],
  "bottom-right": [1, 1],
};

/** Direction of an anchor: -1 (left/top), 0 (centre) or 1 (right/bottom) per axis. */
export function anchorVector(anchor: CanvasAnchor): [number, number] {
  return ANCHORS[anchor] ?? [0, 0];
}

/** Composition result in card units: canvas size and the card bbox's top-left. */
export interface Composition {
  width: number;
  height: number;
  cardX: number;
  cardY: number;
  /** Axes on which the card runs off the canvas. */
  bleedX: boolean;
  bleedY: boolean;
}

/** Visible drop of the card's shadow (cu), used to lift the card optically. */
export function shadowDrop(scene: Scene): number {
  let drop = 0;
  for (const l of resolveShadowLayers(scene.card.shadow)) drop = Math.max(drop, l.y * l.opacity);
  return drop;
}

/** Whole-number upscale for small sources in auto and aspect canvases. */
export function upscaleFactor(scene: Scene, contentPx: Size): number {
  if (scene.canvas.upscale === "off" || scene.canvas.size.kind === "fixed") return 1;
  if (scene.content.kind !== "image") return 1;
  const long = Math.max(contentPx.width, contentPx.height);
  if (long >= 1000) return 1;
  return Math.min(8, Math.max(1, Math.ceil(1200 / Math.max(1, long))));
}

/** "auto" fit: grow when a band wider than this share of the canvas is left, up to this factor. */
const AUTO_BAND = 0.22;
const AUTO_GROW_MAX = 1.5;

/**
 * Place a card (bbox bw x bh cu) with padding p on the canvas described by the
 * scene: returns the canvas size in cu and the bbox position.
 */
export function compose(
  scene: Scene,
  bw: number,
  bh: number,
  drop = 0,
  opts: {
    /** Whether "auto"/"fill" may bleed the card off an edge on its own (default: by content). */
    croppable?: boolean;
  } = {},
): Composition {
  const p = scene.canvas.padding;
  const [ax0, ay0] = ANCHORS[scene.canvas.anchor ?? "center"] ?? [0, 0];
  const bleed = Math.min(0.7, Math.max(0, scene.canvas.bleed ?? 0));
  let ax = ax0;
  let ay = ay0;
  let bleedX = ax !== 0 && bleed > 0;
  let bleedY = ay !== 0 && bleed > 0;
  // A reflection needs floor space below the card (unless the card bleeds off the bottom).
  const refl = scene.card.reflection;
  const floor =
    refl && refl.opacity > 0 && !(bleedY && ay < 0)
      ? Math.max(0, Math.min(1, refl.height)) * bh * 0.62 + refl.gap
      : 0;
  const dW = bleedX ? bw * (1 - bleed) + p : bw + 2 * p;
  const dH = (bleedY ? bh * (1 - bleed) + p : bh + 2 * p) + floor;
  const size = scene.canvas.size;

  if (size.kind === "auto") {
    return {
      width: dW,
      height: dH,
      cardX: bleedX && ax > 0 ? dW - p - bw : p,
      cardY: bleedY && ay > 0 ? dH - p - bh - floor : p,
      bleedX,
      bleedY,
    };
  }

  const r = size.kind === "fixed" ? size.width / size.height : size.ratioW / size.ratioH;
  // Contain: the design box fits; one axis has leftover space.
  let W = Math.max(dW, dH * r);
  let Hc = W / r;
  const fit = scene.canvas.fit ?? "auto";
  const looseX = W - dW > Hc - dH;
  const band = looseX ? (W - dW) / W : (Hc - dH) / Hc;
  const tightBled = looseX ? bleedY : bleedX;
  if (fit === "fill" || (fit === "auto" && band > AUTO_BAND)) {
    // Grow the card (shrink the canvas in cu). First until the tight axis keeps
    // half its padding; if a wide band is still left, let the card bleed off
    // one edge, keeping most of it visible.
    const Cl = looseX ? W : Hc;
    const Ct = looseX ? Hc : W;
    const bt = looseX ? bh : bw;
    const looseBled = looseX ? bleedX : bleedY;
    const cap = fit === "fill" ? Infinity : AUTO_GROW_MAX;
    // Loose axis snug: the whole design box along it (its own bleed included).
    const gLoose = Cl / (looseX ? dW : dH);
    // Tight axis: keep half the padding, or (if it already bleeds) half the card.
    const gTight = tightBled ? Ct / (0.5 * bt + p) : Ct / (bt + p);
    let g = Math.min(gLoose, gTight, cap);
    const bandAfter = (Cl / g - (looseX ? dW : dH)) / (Cl / g);
    // Only bare or windowed screenshots may be cropped by the canvas edge on
    // their own; code, cards and devices stay whole unless a style bleeds them.
    const device = resolveFrame(scene.card.frame.id)?.kind.supportsInset === false;
    const croppable =
      opts.croppable ??
      ((scene.content.kind === "image" || scene.content.kind === "placeholder") &&
        (!device || fit === "fill"));
    if (croppable && !tightBled && (fit === "fill" || bandAfter > 0.22 || looseBled)) {
      const minVisible = fit === "fill" ? 0.45 : 0.7;
      const gBleedMin = Ct / (0.9 * bt + p); // at least 10 % actually bleeds
      const gVis = Ct / (minVisible * bt + p);
      const gb = Math.min(gLoose, gVis, cap);
      if (gb >= gBleedMin && gb > g) {
        g = gb;
        if (looseX) {
          bleedY = true;
          if (ay === 0) ay = -1;
        } else {
          bleedX = true;
          if (ax === 0) ax = -1;
        }
      }
    }
    if (g > 1.005) {
      W /= g;
      Hc /= g;
    }
  }

  const axis = (C: number, b: number, a: number, bled: boolean, lift: number) => {
    if (bled) {
      // Card held at the anchored edge's padding, running off the far edge; if
      // it would stop short of the far edge, slide it there so the bleed is real.
      const t = bleed > 0 ? 1 - bleed : 0.9;
      return a > 0 ? Math.min(C - p - b, -b * (1 - t)) : Math.max(p, C - b * t);
    }
    const free = C - b - 2 * p;
    if (free <= 0) return (C - b) / 2;
    return p + (free * (a + 1)) / 2 - (a === 0 ? Math.min(free / 2, lift) : 0);
  };
  // The floor under a reflected card counts as part of the card for placement.
  // Optical centre: a touch above the middle, more when a long shadow falls below.
  const lift = 0.02 * Hc + 0.35 * drop;
  return {
    width: W,
    height: Hc,
    cardX: axis(W, bw, ax, bleedX, 0),
    cardY: axis(Hc, bh + floor, ay, bleedY, floor > 0 ? 0 : lift),
    bleedX,
    bleedY,
  };
}

function snap(v: number): number {
  return Math.round(v);
}

// ----------------------------------------------------------------------------
// Coordinate helpers for the editor (hit-testing, placing annotations)
// ----------------------------------------------------------------------------

/** Normalized content coordinates (0..1, where content annotations live) -> canvas px at scale 1. */
export function contentToCanvas(layout: SceneLayout, u: number, v: number): Point {
  const c = notesRect(layout.card);
  return applyMat3(layout.cardToCanvas, { x: c.x + u * c.width, y: c.y + v * c.height });
}

/** Canvas px at scale 1 -> normalized content (annotation) coordinates (may be outside 0..1). */
export function canvasToContent(layout: SceneLayout, x: number, y: number): Point | null {
  if (!layout.canvasToCard) return null;
  const p = applyMat3(layout.canvasToCard, { x, y });
  const c = notesRect(layout.card);
  return { x: (p.x - c.x) / c.width, y: (p.y - c.y) / c.height };
}

/** Whether a canvas point (scale 1) lies on the card's content (the part shown). */
export function hitContent(layout: SceneLayout, x: number, y: number): boolean {
  if (!layout.canvasToCard) return false;
  const p = applyMat3(layout.canvasToCard, { x, y });
  const c = layout.card.content;
  return p.x >= c.x && p.x <= c.x + c.width && p.y >= c.y && p.y <= c.y + c.height;
}

/** Output pixel size for an export scale. Always integers. */
export function outputSize(layout: SceneLayout, scale: number): Size {
  return {
    width: Math.round(layout.canvas.width * scale),
    height: Math.round(layout.canvas.height * scale),
  };
}
