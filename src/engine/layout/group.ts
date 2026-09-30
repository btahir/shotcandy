/**
 * Multi-screen layout geometry: where each screen of a side-by-side, overlap,
 * hero, cascade, fan or grid design goes. Pure math (no canvas), unit-tested,
 * and shared by the renderer and the editor's hit-testing.
 *
 * Pipeline
 *  1. Size: every screen gets a content size in one shared card unit, so
 *     frames, radius, border and shadows match across screens. Different
 *     shapes are balanced (see balanceSizes); grids cover-crop every screen to
 *     one cell shape instead.
 *  2. Arrange: the layout places each card in a flat "group plane" (centre,
 *     in-plane rotation, scale, an optional per-screen 3D turn, z-order).
 *  3. Tilt: the style's 3D tilt turns the whole group plane as one piece, so
 *     tilted styles and 3D motions move the group as a unit.
 *  4. Compose: the projected bounding box goes through the same compose() as
 *     a single card, so padding, fit, anchor, bleed, transform and the caption
 *     behave exactly like one card the size of the group.
 */
import {
  type Point,
  type Rect,
  type Size,
  boundsOfPoints,
  rectCorners,
  unionRect,
} from "../math/geometry";
import {
  type Mat3,
  applyMat3,
  invert,
  isAffine,
  multiply,
  rotation,
  scaling,
  tiltHomography,
  translation,
} from "../math/matrix";
import { resolveShadowLayers } from "../presets/shadows";
import { type ActiveLayout, screenContent } from "../scene/layouts";
import type { CropRect, ImageContent, LayoutId, Scene } from "../scene/types";
import type { CaptionLayout } from "./caption";
import {
  type CardGeometry,
  type Composition,
  type SceneLayout,
  MAX_CANVAS_SIDE,
  anchorVector,
  cardGeometryForUnits,
  compose,
  contentPixelSize,
  contentUnits,
  effectiveCrop,
  shadowDrop,
  upscaleFactor,
  withCaption,
} from "./layout";

/** Longest side (1x px) of an auto or aspect canvas holding several screens. */
export const GROUP_MAX_SIDE = 5120;

/**
 * How strongly screens of different shapes are balanced in row-like layouts:
 * 0 gives every screen the same height, 0.5 the same area. In between, a wide
 * desktop shot next to a tall phone shot reads as a pair instead of a
 * billboard and a sliver.
 */
export const BALANCE = 0.25;

/** Shape of an empty screen when no screen has an image to copy it from. */
const FALLBACK_PX: Size = { width: 1600, height: 1000 };

/** Where one screen sits in the flat group plane (before the style's tilt). */
export interface Placement {
  /** Card centre, cu. */
  x: number;
  y: number;
  /** In-plane rotation, degrees clockwise. */
  rotate: number;
  scale: number;
  /** Per-screen 3D turn around the card centre, degrees (0 = flat). */
  turnX: number;
  turnY: number;
  /** Higher draws later (in front). Ties keep screen order. */
  z: number;
}

/** One screen of a laid-out group. */
export interface SlotLayout extends SceneLayout {
  /** Screen index (0 = the content). */
  index: number;
  /** No image yet: drawn as a placeholder in the editor, skipped in exports. */
  empty: boolean;
  /** The image as drawn (a grid cell's cover crop is baked into `crop`). */
  content: ImageContent;
  placement: Placement;
}

export interface GroupLayout {
  id: Exclude<LayoutId, "single">;
  canvas: Size;
  /** Canvas px (scale 1) per group card unit. */
  k: number;
  /** Every shown screen, by screen index. */
  slots: SlotLayout[];
  /** Screen indices back to front (the draw order). */
  order: number[];
  /** Union of the card quads, canvas px. */
  bounds: Rect;
  /** `bounds` grown by the cards' shadows, canvas px. */
  shadowBounds: Rect;
  /** Whether the style's floor reflection is drawn under each card. */
  reflection: boolean;
  caption?: CaptionLayout;
}

// ----------------------------------------------------------------------------
// Sizing
// ----------------------------------------------------------------------------

interface Screen {
  index: number;
  content: ImageContent;
  empty: boolean;
  /** Natural px of what is drawn (after crop). */
  px: Size;
  /** Whether px comes from a real image (for resolution). */
  known: boolean;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Cover-crop `crop` (normalized to an image of `px`) to aspect `a`, keeping its top centre. */
function coverCrop(crop: CropRect, px: Size, a: number): CropRect {
  const w = crop.width * px.width;
  const h = crop.height * px.height;
  if (w / h > a) {
    const nw = (h * a) / px.width;
    return { ...crop, x: crop.x + (crop.width - nw) / 2, width: nw };
  }
  return { ...crop, height: w / a / px.height };
}

function screensOf(scene: Scene, lay: ActiveLayout, sizes: readonly (Size | null)[]): Screen[] {
  const frameId = scene.card.frame.id;
  const out: Screen[] = [];
  for (let i = 0; i < lay.count; i++) {
    const content = screenContent(scene, i) ?? { kind: "image", assetId: null };
    const size = content.assetId ? (sizes[i] ?? null) : null;
    out.push({
      index: i,
      content,
      empty: !content.assetId,
      px: size ? contentPixelSize({ ...scene, content }, size) : FALLBACK_PX,
      known: !!size,
    });
  }
  // Empty or unloaded screens take the shape of the first real one.
  const model = out.find((s) => s.known)?.px ?? FALLBACK_PX;
  for (const s of out) if (!s.known) s.px = model;

  if (lay.id === "grid") {
    // One cell shape for all: the median shape of the real screens.
    const known = out.filter((s) => s.known);
    const a = median((known.length ? known : out).map((s) => s.px.width / s.px.height));
    for (const s of out) {
      const size = s.known ? sizes[s.index]! : null;
      if (size) {
        const base = effectiveCrop(s.content, size, frameId).crop;
        const crop = coverCrop(base, size, a);
        s.content = { ...s.content, crop, tall: "full" };
        s.px = { width: crop.width * size.width, height: crop.height * size.height };
      } else {
        s.px = { width: a * 1000, height: 1000 };
      }
    }
  }
  return out;
}

/**
 * Content sizes in the shared unit. Every screen starts at its single-card
 * size (reference side 1000 cu); screens of different shapes are then
 * balanced towards equal visual weight, normalized so the group's geometric
 * mean scale stays 1 (same-shaped screens keep exactly their single size).
 */
export function balanceSizes(px: readonly Size[], balance = BALANCE): Size[] {
  const base = px.map((p) => contentUnits(p));
  const f = base.map((c, i) => Math.pow(px[i]!.width / px[i]!.height, -balance) / c.height);
  const g = Math.exp(f.reduce((s, v) => s + Math.log(v), 0) / f.length);
  return base.map((c, i) => ({ width: (c.width * f[i]!) / g, height: (c.height * f[i]!) / g }));
}

// ----------------------------------------------------------------------------
// Arrangements
// ----------------------------------------------------------------------------

/** A card's footprint around its centre after an optional 3D turn (cu). */
interface Footprint {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

const TURN_PERSPECTIVE = 3;

function turnMatrix(w: number, h: number, turnX: number, turnY: number): Mat3 {
  return tiltHomography(w, h, {
    rotateX: turnX,
    rotateY: turnY,
    rotateZ: 0,
    perspective: TURN_PERSPECTIVE,
  });
}

function footprint(size: Size, scale: number, turnX = 0, turnY = 0): Footprint {
  const H = turnMatrix(size.width, size.height, turnX, turnY);
  const b = boundsOfPoints(
    rectCorners({ x: 0, y: 0, width: size.width, height: size.height }).map((p) => applyMat3(H, p)),
  );
  return {
    minX: b.x * scale,
    maxX: (b.x + b.width) * scale,
    minY: b.y * scale,
    maxY: (b.y + b.height) * scale,
  };
}

const flat = (x: number, y: number, z: number, extra: Partial<Placement> = {}): Placement => ({
  x,
  y,
  rotate: 0,
  scale: 1,
  turnX: 0,
  turnY: 0,
  z,
  ...extra,
});

/** Distance along direction (c, s) at which two centred boxes stop overlapping. */
function touchDistance(a: Size, b: Size, c: number, s: number): number {
  const dx = Math.abs(c) > 1e-6 ? (a.width + b.width) / 2 / Math.abs(c) : Infinity;
  const dy = Math.abs(s) > 1e-6 ? (a.height + b.height) / 2 / Math.abs(s) : Infinity;
  return Math.min(dx, dy);
}

type Arrange = (cards: Size[], p: Record<string, number>, opts: { floor: boolean }) => Placement[];

/** 2-3 screens in a row, optionally turned inwards like an open book. */
const sideBySide: Arrange = (cards, p, { floor }) => {
  const n = cards.length;
  const turn = p.tilt! * 28;
  const turns = n === 2 ? [turn, -turn] : [turn, 0, -turn];
  const gap = p.spacing! * 240;
  const out: Placement[] = [];
  let right = 0;
  cards.forEach((c, i) => {
    const f = footprint(c, 1, 0, turns[i]!);
    const x = i === 0 ? -f.minX : right + gap - f.minX;
    right = x + f.maxX;
    // Centred on one line; on a glossy floor, standing on it.
    const y = floor ? -f.maxY : 0;
    out.push(flat(x, y, 0, { turnY: turns[i]! }));
  });
  return out;
};

/** A front screen and a smaller one behind it, offset along `angle`. */
const overlap: Arrange = (cards, p) => {
  const a = (p.angle! * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const back = 0.88;
  const f = cards[0]!;
  const b = { width: cards[1]!.width * back, height: cards[1]!.height * back };
  const d = (1 - p.overlap!) * touchDistance(f, b, c, s);
  return [flat(0, 0, 1), flat(d * c, d * s, 0, { scale: back })];
};

/** A hero screen in front, two smaller ones set back at its sides. */
const hero: Arrange = (cards, p, { floor }) => {
  const side = 0.55 + 0.4 * p.size!;
  const turn = p.tilt! * 40;
  const visible = 0.3 + 0.8 * p.spacing!;
  const h = footprint(cards[0]!, 1);
  const out: Placement[] = [flat(0, floor ? -h.maxY : 0, 2)];
  for (const [i, dir] of [
    [1, -1],
    [2, 1],
  ] as const) {
    const c = cards[i]!;
    // Turned inwards: the edge nearest the hero recedes.
    const t = dir < 0 ? turn : -turn;
    const f = footprint(c, side, 0, t);
    const w = f.maxX - f.minX;
    const x = dir < 0 ? h.minX - visible * w - f.minX : h.maxX + visible * w - f.maxX;
    out.push(flat(x, floor ? -f.maxY : 0, 1, { scale: side, turnY: t }));
  }
  return out;
};

/** Screens stepping back along `angle`, screen 0 in front. */
const cascade: Arrange = (cards, p) => {
  const a = (p.angle! * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const w = cards.reduce((m, q) => m + q.width, 0) / cards.length;
  const h = cards.reduce((m, q) => m + q.height, 0) / cards.length;
  const box = { width: w, height: h };
  const step = (0.12 + 0.3 * p.step!) * touchDistance(box, box, c, s);
  return cards.map((_, i) => flat(i * step * c, i * step * s, cards.length - i));
};

/** Screens fanned around a pivot below them, screen 0 in the middle and on top. */
const fan: Arrange = (cards, p) => {
  const n = cards.length;
  const spread = p.spread!;
  const delta = ((3 + 13 * spread) * Math.PI) / 180;
  const w = cards.reduce((m, c) => m + c.width, 0) / n;
  const h = Math.max(...cards.map((c) => c.height));
  // Neighbours sit this fraction of a card width apart; the pivot follows.
  const reach = (0.42 + 0.3 * spread) * w;
  const R = Math.max(reach / Math.sin(delta), 0.9 * h);
  const mid = (n - 1) / 2;
  const positions = fanPositions(n);
  return cards.map((_, i) => {
    const pos = positions[i]!;
    const th = (pos - mid) * delta;
    return flat(R * Math.sin(th), R - R * Math.cos(th), -Math.abs(pos - mid) * 10 - i * 0.01, {
      rotate: (th * 180) / Math.PI,
    });
  });
};

/** Fan position (left to right) of each screen: 0 in the middle, then alternating out. */
export function fanPositions(n: number): number[] {
  const mid = Math.floor((n - 1) / 2);
  const out = [mid];
  let l = mid - 1;
  let r = mid + 1;
  let left = true;
  while (out.length < n) {
    if ((left && l >= 0) || r >= n) out.push(l--);
    else out.push(r++);
    left = !left;
  }
  return out;
}

/** Uniform cells, 2x2 or 3 wide; a short last row is centred. */
const grid: Arrange = (cards, p) => {
  const n = cards.length;
  const cols = n === 4 ? 2 : 3;
  const rows = Math.ceil(n / cols);
  const gap = p.gap! * 240;
  const w = cards[0]!.width;
  const h = cards[0]!.height;
  return cards.map((_, i) => {
    const r = Math.floor(i / cols);
    const inRow = r === rows - 1 ? n - r * cols : cols;
    const col = i - r * cols;
    return flat((col - (inRow - 1) / 2) * (w + gap), (r - (rows - 1) / 2) * (h + gap), 0);
  });
};

const ARRANGE: Record<Exclude<LayoutId, "single">, Arrange> = {
  "side-by-side": sideBySide,
  overlap,
  hero,
  cascade,
  fan,
  grid,
};

// ----------------------------------------------------------------------------
// Group layout
// ----------------------------------------------------------------------------

interface GroupBase {
  canvas: Size;
  k: number;
  slots: SlotLayout[];
}

function placementMatrix(card: CardGeometry, pl: Placement): Mat3 {
  const { width: w, height: h } = card.size;
  return multiply(
    translation(pl.x, pl.y),
    multiply(
      rotation((pl.rotate * Math.PI) / 180),
      multiply(scaling(pl.scale), turnMatrix(w, h, pl.turnX, pl.turnY)),
    ),
  );
}

function snapAffine(M: Mat3, card: CardGeometry): Mat3 {
  if (!isAffine(M, 1e-12)) return M;
  if (Math.abs(M[1]) < 1e-9 && Math.abs(M[3]) < 1e-9) {
    // Axis-aligned: pixel-snap the content origin so 1x exports stay crisp.
    return [
      M[0],
      0,
      Math.round(M[2] + card.content.x * M[0]) - card.content.x * M[0],
      0,
      M[4],
      Math.round(M[5] + card.content.y * M[4]) - card.content.y * M[4],
      0,
      0,
      1,
    ];
  }
  return [M[0], M[1], M[2], M[3], M[4], M[5], 0, 0, 1];
}

function quadOf(M: Mat3, card: CardGeometry): [Point, Point, Point, Point] {
  return rectCorners({ x: 0, y: 0, width: card.size.width, height: card.size.height }).map((p) =>
    applyMat3(M, p),
  ) as [Point, Point, Point, Point];
}

function groupBase(scene: Scene, lay: ActiveLayout, sizes: readonly (Size | null)[]): GroupBase {
  const screens = screensOf(scene, lay, sizes);
  const units =
    lay.id === "grid"
      ? screens.map((s) => contentUnits(s.px))
      : balanceSizes(screens.map((s) => s.px));
  const cards = units.map((u) => cardGeometryForUnits(scene, u));
  const floor = lay.def.reflection && !!scene.card.reflection && scene.card.reflection.opacity > 0;
  const placements = ARRANGE[lay.id](
    cards.map((c) => c.size),
    lay.params,
    { floor },
  );

  // Flat group plane, then the style's tilt turns the whole plane.
  const P = cards.map((c, i) => placementMatrix(c, placements[i]!));
  const plane = boundsOfPoints(cards.flatMap((c, i) => quadOf(P[i]!, c)));
  const Hg = multiply(
    tiltHomography(plane.width, plane.height, scene.card.tilt),
    translation(-plane.x, -plane.y),
  );
  const S = P.map((m) => multiply(Hg, m));
  const quads = cards.map((c, i) => quadOf(S[i]!, c));
  const bbox = boundsOfPoints(quads.flat());
  const primary = boundsOfPoints(quads[0]!);

  const comp = composeGroup(scene, lay, bbox, primary);
  const size = scene.canvas.size;
  let canvas: Size;
  let kFit: number;
  if (size.kind === "fixed") {
    canvas = { width: size.width, height: size.height };
    kFit = Math.min(size.width / comp.width, size.height / comp.height);
  } else {
    // Native resolution of the sharpest screen (small sources upscaled like
    // single cards), capped so a row of 4K captures stays a sane file.
    let kNat = 0;
    screens.forEach((s, i) => {
      if (!s.known) return;
      const drawn = units[i]!.width * placements[i]!.scale;
      kNat = Math.max(kNat, (s.px.width / drawn) * upscaleFactor(scene, s.px));
    });
    if (kNat <= 0) kNat = FALLBACK_PX.width / 1000;
    const long = Math.max(comp.width, comp.height) * kNat;
    kNat *= Math.min(1, GROUP_MAX_SIDE / long, MAX_CANVAS_SIDE / long);
    canvas = {
      width: Math.max(1, Math.round(comp.width * kNat)),
      height: Math.max(1, Math.round(comp.height * kNat)),
    };
    kFit = kNat;
  }

  const { transform } = scene.card;
  const k = kFit * transform.scale;
  const ox = (canvas.width - comp.width * kFit) / 2;
  const oy = (canvas.height - comp.height * kFit) / 2;
  const cx = ox + (comp.cardX + bbox.width / 2) * kFit + transform.offsetX * canvas.width;
  const cy = oy + (comp.cardY + bbox.height / 2) * kFit + transform.offsetY * canvas.height;
  const G = multiply(
    translation(cx, cy),
    multiply(scaling(k), translation(-(bbox.x + bbox.width / 2), -(bbox.y + bbox.height / 2))),
  );

  const slots = screens.map((s, i): SlotLayout => {
    const card = cards[i]!;
    const M = snapAffine(multiply(G, S[i]!), card);
    const perspective = !isAffine(M, 1e-12);
    return {
      canvas,
      k: k * placements[i]!.scale,
      card,
      cardToCanvas: M,
      canvasToCard: invert(M),
      perspective,
      cardQuad: quadOf(M, card),
      contentPixels: s.px,
      index: s.index,
      empty: s.empty,
      content: s.content,
      placement: placements[i]!,
    };
  });
  return { canvas, k, slots };
}

/**
 * Compose a group like one card of its size, with two differences. The canvas
 * never crops screens on its own ("auto" fit only grows into the padding).
 * And a style's bleed cuts the same amount of card as on a single screen
 * (not a share of the whole group), and only when that makes the screens
 * bigger; otherwise the group sits centred, whole. A row of screens in a tall
 * canvas would otherwise slide to the far edge just to be cut.
 */
function composeGroup(scene: Scene, lay: ActiveLayout, bbox: Rect, primary: Rect): Composition {
  let base = scene;
  if (!lay.def.reflection && base.card.reflection) {
    const { reflection: _off, ...card } = base.card;
    base = { ...base, card };
  }
  const drop = shadowDrop(scene);
  const bleed = scene.canvas.bleed ?? 0;
  const fill = scene.canvas.fit === "fill";
  const whole = (s: Scene) =>
    compose(s, bbox.width, bbox.height, drop, fill ? {} : { croppable: false });
  if (bleed <= 0) return whole(base);
  const [ax, ay] = anchorVector(scene.canvas.anchor ?? "center");
  const ratios: number[] = [];
  if (ax !== 0) ratios.push(primary.width / Math.max(1e-9, bbox.width));
  if (ay !== 0) ratios.push(primary.height / Math.max(1e-9, bbox.height));
  const cut = bleed * Math.min(1, ...ratios);
  const bled = compose(
    { ...base, canvas: { ...base.canvas, bleed: cut, ...(fill ? {} : { fit: "contain" }) } },
    bbox.width,
    bbox.height,
    drop,
  );
  const centred = whole({
    ...base,
    canvas: { ...base.canvas, bleed: 0, anchor: "center" },
  });
  return bled.width * bled.height < 0.94 * centred.width * centred.height ? bled : centred;
}

function shiftGroup(g: GroupBase, canvas: Size, dy: number, caption: CaptionLayout): GroupBase {
  const T = translation(0, dy);
  return {
    ...g,
    canvas,
    slots: g.slots.map((s) => {
      const M = multiply(T, s.cardToCanvas);
      return {
        ...s,
        canvas,
        cardToCanvas: M,
        canvasToCard: invert(M),
        cardQuad: s.cardQuad.map((p) => ({ x: p.x, y: p.y + dy })) as SlotLayout["cardQuad"],
        caption,
      };
    }),
  };
}

/**
 * Lay out every shown screen of a multi-screen scene. `sizes[i]` is the
 * natural pixel size of screen i's image (null when empty or not loaded).
 */
export function computeGroupLayout(
  scene: Scene,
  lay: ActiveLayout,
  sizes: readonly (Size | null)[],
): GroupLayout {
  const base = withCaption(
    scene,
    (s) => groupBase(s, lay, sizes),
    (g) => g.slots.flatMap((s) => s.cardQuad.map((p) => p.y)),
    shiftGroup,
  );
  const order = base.slots
    .map((s) => s.index)
    .sort((a, b) => base.slots[a]!.placement.z - base.slots[b]!.placement.z || a - b);
  const bounds = boundsOfPoints(base.slots.flatMap((s) => s.cardQuad));
  let shadowBounds = bounds;
  const layers = resolveShadowLayers(scene.card.shadow);
  for (const s of base.slots) {
    const b = boundsOfPoints(s.cardQuad);
    for (const l of layers) {
      const e = (l.blur + Math.max(0, l.spread)) * s.k;
      shadowBounds = unionRect(shadowBounds, {
        x: b.x + l.x * s.k - e,
        y: b.y + l.y * s.k - e,
        width: b.width + 2 * e,
        height: b.height + 2 * e,
      });
    }
  }
  const reflection =
    lay.def.reflection && !!scene.card.reflection && scene.card.reflection.opacity > 0;
  return {
    id: lay.id,
    canvas: base.canvas,
    k: base.k,
    slots: base.slots,
    order,
    bounds,
    shadowBounds,
    reflection,
    ...(base.slots[0]?.caption ? { caption: base.slots[0].caption } : {}),
  };
}
