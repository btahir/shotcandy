/**
 * Scene renderer: the single entry point that turns (scene, assets, scale)
 * into pixels. Deterministic: no clocks, no randomness outside seeded PRNGs,
 * no network; caching is pure memoization.
 *
 * Pipeline
 *   layout -> background (+grain) -> shadows -> card (flat, or rendered
 *   offscreen and perspective-warped when tilted) -> canvas annotations
 */
import { type AssetResolver, pickImage } from "../assets/types";
import { type SceneLayout, computeLayout, outputSize } from "../layout/layout";
import { type GroupLayout, type SlotLayout, computeGroupLayout } from "../layout/group";
import type { CaptionLayout } from "../layout/caption";
import { type Point, type Rect, type Size, boundsOfPoints, rectCorners } from "../math/geometry";
import { type ActiveLayout, activeLayout, screenContent } from "../scene/layouts";
import { themeForLightness, topBandLightness } from "../analysis/tone";
import { effectiveCrop } from "../layout/layout";
import {
  type Mat3,
  applyMat3,
  isAffine,
  multiply,
  rotation,
  scaling,
  translation,
} from "../math/matrix";
import { type Path, projectPath, tracePath } from "../math/path";
import { type Palette, extractPalette } from "../palette/extract";
import { resolveShadowLayers } from "../presets/shadows";
import type { Scene } from "../scene/types";
import type { Shape } from "../frames/types";
import { drawAnnotation } from "./annotations";
import { drawBackground } from "./background";
import { RenderCache } from "./cache";
import { drawCaption, fillTone } from "../layout/caption";
import { drawCard } from "./card";
import { getContentRenderer, imageContent } from "./content";
import { shapePath } from "./draw";
import {
  type CanvasLike,
  type Ctx2D,
  type RenderEnvironment,
  defaultEnvironment,
  get2d,
} from "./env";
import { perspectiveMagnification } from "./magnification";
import { warpPerspective } from "./perspective";
import { affinePath, drawShadows } from "./shadow";
import { isDark, mixColors, toCss } from "../math/color";
import { resolveFrame } from "../frames/registry";
// Content kinds beyond images register themselves with the content registry.
import "../code/render";
import "../post/render";

export interface RenderOptions {
  /** Device pixels per canvas pixel (export 1x-4x, or a preview fraction). */
  scale?: number;
  env?: RenderEnvironment;
  cache?: RenderCache;
  /** Opaque colour painted under everything (JPEG has no alpha). */
  matte?: string | null;
  /**
   * Empty screens of a multi-screen design: "skip" leaves their place empty
   * (exports, default); "placeholder" draws a faint dashed card to drop an
   * image on (the editor preview).
   */
  emptySlots?: "skip" | "placeholder";
}

export interface RenderResult {
  layout: SceneLayout;
  width: number;
  height: number;
}

let sharedCache: RenderCache | null = null;
function defaultCache(): RenderCache {
  sharedCache ??= new RenderCache();
  return sharedCache;
}

/**
 * Layout for a scene given its assets (natural content size resolved via the
 * content registry). For a multi-screen design this is screen 0's card on the
 * group's canvas, so single-card helpers (annotations, hit-testing, export
 * sizing) keep working; layoutGroupScene has every screen.
 */
export function layoutScene(scene: Scene, assets: AssetResolver): SceneLayout {
  const group = layoutGroupScene(scene, assets);
  if (group) return primaryLayout(group);
  const renderer = getContentRenderer(scene.content.kind);
  const natural = renderer ? renderer.naturalSize(scene.content as never, assets) : null;
  return computeLayout(scene, natural);
}

function needsPalette(scene: Scene): boolean {
  const f = scene.card.frame.id;
  return (
    scene.background.fill.kind === "auto" ||
    (scene.card.inset.width > 0 && scene.card.inset.color === "auto") ||
    (!!scene.card.stack && scene.card.stack.count > 0 && scene.card.stack.color === "auto") ||
    // Letterboxed laptops and faded long captures use the screenshot's edge colour.
    f === "laptop" ||
    (scene.content.kind === "image" && scene.content.tall !== "full")
  );
}

/**
 * Resolve `frame.theme: "auto"`: window and browser chrome match the top band
 * of the screenshot (dark app -> dark chrome); devices default to dark.
 */
export function resolveFrameTheme(
  scene: Scene,
  assets: AssetResolver,
  env: RenderEnvironment,
  cache: RenderCache,
): Scene {
  const frame = scene.card.frame;
  if (frame.theme !== "auto") return scene;
  let theme: "light" | "dark" = "light";
  if (frame.id === "phone" || frame.id === "tablet" || frame.id === "laptop") {
    theme = "dark";
  } else if (resolveFrame(frame.id)?.spec.kind === "canvas") {
    // A canvas frame's label sits on the background: match its lightness.
    const palette = scenePalette(scene, assets, env, cache);
    theme = isDark(fillTone(scene.background.fill, palette, assets)) ? "dark" : "light";
  } else if (scene.content.kind === "image" && scene.content.assetId) {
    const src = assets.get(scene.content.assetId);
    if (src) {
      const { crop } = effectiveCrop(scene.content, src, frame.id);
      theme = themeForLightness(topBandLightness(env, cache, src, crop));
    }
  } else if (scene.content.kind === "code" || scene.content.kind === "post") {
    theme = "dark";
  }
  return { ...scene, card: { ...scene.card, frame: { ...frame, theme } } };
}

/** Palette of the scene's content image (precomputed on the asset, else derived and cached). */
export function scenePalette(
  scene: Scene,
  assets: AssetResolver,
  env: RenderEnvironment,
  cache: RenderCache,
): Palette | null {
  if (scene.content.kind !== "image" || !scene.content.assetId) return null;
  const found = assets.get(scene.content.assetId);
  if (!found) return null;
  const src = found.still ?? found;
  if (src.palette) return src.palette;
  const img = pickImage(src, Infinity);
  if (!img) return null;
  return cache.get(`palette:${src.id}:${img.width}`, () => {
    const s = Math.min(1, 256 / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * s));
    const h = Math.max(1, Math.round(img.height * s));
    const c = env.createCanvas(w, h);
    const g = get2d(c, { willReadFrequently: true });
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    g.drawImage(img.image, 0, 0, w, h);
    const data = g.getImageData(0, 0, w, h);
    return { value: extractPalette({ data: data.data, width: w, height: h }), bytes: 4096 };
  });
}

function silhouetteShapes(layout: SceneLayout): Shape[] {
  return layout.card.borderOutline ?? layout.card.outline;
}

function growShape(s: Shape, d: number): Shape {
  return {
    rect: {
      x: s.rect.x - d,
      y: s.rect.y - d,
      width: s.rect.width + 2 * d,
      height: s.rect.height + 2 * d,
    },
    radii: s.radii.map((r) => (r > 0 ? Math.max(0, r + d) : 0)) as unknown as Shape["radii"],
    smoothing: s.smoothing,
  };
}

/**
 * Render a scene into `ctx`, whose canvas must already be sized to
 * outputSize(layout, scale) (use renderToCanvas to have that done for you).
 */
export function renderScene(
  ctx: Ctx2D,
  scene: Scene,
  assets: AssetResolver,
  options: RenderOptions = {},
): RenderResult {
  const scale = options.scale ?? 1;
  const env = options.env ?? defaultEnvironment();
  const cache = options.cache ?? defaultCache();
  const lay = activeLayout(scene);
  if (lay) return renderGroup(ctx, scene, lay, assets, options, scale, env, cache);
  scene = resolveFrameTheme(scene, assets, env, cache);
  const layout = layoutScene(scene, assets);
  const { width: W, height: H } = outputSize(layout, scale);
  const unit = layout.k * scale;
  const palette = needsPalette(scene) ? scenePalette(scene, assets, env, cache) : null;
  const deps = { env, cache, assets, palette };

  beginFrame(ctx, W, H, options.matte);
  const quad = layout.cardQuad;
  const focus = {
    x: ((quad[0].x + quad[1].x + quad[2].x + quad[3].x) / 4) * scale,
    y: ((quad[0].y + quad[1].y + quad[2].y + quad[3].y) / 4) * scale,
  };
  drawScenery(ctx, scene, layout.canvas, layout.caption, W, H, unit, scale, focus, deps);
  drawCardPass(ctx, scene, layout, scale, W, H, deps, { stack: true, reflection: true });
  drawCanvasAnnotations(ctx, scene, layout.canvas, layout.k, scale);
  ctx.restore();
  cache.trim();
  return { layout, width: W, height: H };
}

interface PassDeps {
  env: RenderEnvironment;
  cache: RenderCache;
  assets: AssetResolver;
  palette: Palette | null;
}

/** Reset the context and clear the canvas (plus the matte for formats without alpha). */
function beginFrame(ctx: Ctx2D, W: number, H: number, matte: string | null | undefined): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.clearRect(0, 0, W, H);
  if (matte) {
    ctx.fillStyle = toCss(matte);
    ctx.fillRect(0, 0, W, H);
  }
}

/** Background (painted across all slides of a set when it spans them) and the caption. */
function drawScenery(
  ctx: Ctx2D,
  scene: Scene,
  canvas: Size,
  caption: CaptionLayout | undefined,
  W: number,
  H: number,
  unit: number,
  scale: number,
  focus: Point,
  deps: PassDeps,
): void {
  const { env, cache, assets, palette } = deps;
  const span = scene.background.span;
  if (span && span.count > 1) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.clip();
    ctx.translate(-span.index * W, 0);
    drawBackground(
      ctx,
      scene.background.fill,
      scene.background.grain,
      W * span.count,
      H,
      { env, cache, assets, palette, unit, scale },
      { texture: scene.background.texture, vignette: scene.background.vignette, focus },
    );
    ctx.restore();
  } else {
    drawBackground(
      ctx,
      scene.background.fill,
      scene.background.grain,
      W,
      H,
      { env, cache, assets, palette, unit, scale },
      { texture: scene.background.texture, vignette: scene.background.vignette, focus },
    );
  }

  // Caption card text, in the space above the card.
  if (caption && scene.caption) {
    drawCaption(
      ctx as never,
      scene.caption,
      caption,
      scale,
      canvas.width,
      fillTone(scene.background.fill, palette, assets),
    );
  }
}

/** Card-local cu -> device px paths, affine when possible. */
const through =
  (M: Mat3) =>
  (p: Path): Path =>
    isAffine(M, 1e-12)
      ? affinePath(p, { a: M[0], b: M[3], c: M[1], d: M[4], e: M[2], f: M[5] })
      : projectPath(p, M, 16);

/** One card: its reflection, stack ghosts, shadows and the card itself. */
function drawCardPass(
  ctx: Ctx2D,
  scene: Scene,
  layout: SceneLayout,
  scale: number,
  W: number,
  H: number,
  deps: PassDeps,
  opts: { stack: boolean; reflection: boolean },
): void {
  const { palette } = deps;
  const unit = layout.k * scale;
  // Card-local cu -> device px.
  const D: Mat3 = multiply([scale, 0, 0, 0, scale, 0, 0, 0, 1], layout.cardToCanvas);
  const affine = !layout.perspective;
  const toDevice = through(D);

  // Reflection on a glossy floor, under everything else.
  const reflection = scene.card.reflection;
  if (opts.reflection && reflection && reflection.opacity > 0) {
    drawReflection(ctx, scene, layout, D, W, H, reflection, deps);
  }

  // Stacked ghost cards behind the card, far to near.
  const stack = scene.card.stack;
  if (opts.stack && stack && stack.count > 0) {
    const cw = layout.card.size.width;
    const chh = layout.card.size.height;
    const base = stack.color === "auto" ? (palette?.edge ?? "#ffffff") : stack.color;
    const ghostLayers = resolveShadowLayers(scene.card.shadow).map((l) => ({
      ...l,
      opacity: l.opacity * 0.7,
    }));
    for (let i = Math.min(3, Math.round(stack.count)); i >= 1; i--) {
      const sc = Math.max(0.5, 1 - stack.shrink * i);
      const G = multiply(
        translation(cw / 2 + stack.x * i, chh / 2 + stack.y * i),
        multiply(
          rotation((stack.rotate * i * Math.PI) / 180),
          multiply(scaling(sc), translation(-cw / 2, -chh / 2)),
        ),
      );
      const toGhost = through(multiply(D, G));
      if (ghostLayers.length) {
        drawShadows(ctx, {
          layers: ghostLayers,
          color: scene.card.shadow.color,
          unit,
          canvasWidth: W,
          canvasHeight: H,
          silhouette: (spread) =>
            silhouetteShapes(layout).flatMap((sh) => toGhost(shapePath(growShape(sh, spread)))),
        });
      }
      const ghost = silhouetteShapes(layout).flatMap((sh) => toGhost(shapePath(sh)));
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.beginPath();
      tracePath(ctx, ghost);
      ctx.fillStyle = toCss(mixColors(base, "#000000", 0.035 * i));
      ctx.fill();
      ctx.strokeStyle = "rgba(0, 0, 0, 0.07)";
      ctx.lineWidth = Math.max(1, scale);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Shadows.
  const layers = resolveShadowLayers(scene.card.shadow);
  if (layers.length) {
    drawShadows(ctx, {
      layers,
      color: scene.card.shadow.color,
      unit,
      canvasWidth: W,
      canvasHeight: H,
      silhouette: (spread) =>
        silhouetteShapes(layout).flatMap((s) => toDevice(shapePath(growShape(s, spread)))),
    });
  }

  // Card.
  if (affine) {
    ctx.save();
    ctx.setTransform(D[0], D[3], D[1], D[4], D[2], D[5]);
    drawCard(ctx, scene, layout, {
      ...deps,
      pixelRatio: Math.sqrt(Math.abs(D[0] * D[4] - D[1] * D[3])),
    });
    ctx.restore();
  } else {
    drawTiltedCard(ctx, scene, layout, D, W, H, deps);
  }
}

/** Canvas-anchored annotations (on top of everything). */
function drawCanvasAnnotations(
  ctx: Ctx2D,
  scene: Scene,
  canvas: Size,
  k: number,
  scale: number,
): void {
  const canvasAnnotations = scene.annotations.filter((a) => a.anchor === "canvas");
  if (!canvasAnnotations.length) return;
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const box = {
    rect: { x: 0, y: 0, width: canvas.width, height: canvas.height },
    unit: k,
  };
  for (const a of canvasAnnotations) drawAnnotation(ctx, a, box);
  ctx.restore();
}

// ----------------------------------------------------------------------------
// Multi-screen designs
// ----------------------------------------------------------------------------

/** Natural pixel size of each shown screen's image (null when empty or not loaded). */
function screenSizes(scene: Scene, lay: ActiveLayout, assets: AssetResolver): (Size | null)[] {
  const out: (Size | null)[] = [];
  for (let i = 0; i < lay.count; i++) {
    const c = screenContent(scene, i);
    out.push(c ? imageContent.naturalSize(c, assets) : null);
  }
  return out;
}

/** Layout of every screen of a multi-screen scene, or null for a single screen. */
export function layoutGroupScene(scene: Scene, assets: AssetResolver): GroupLayout | null {
  const lay = activeLayout(scene);
  return lay ? computeGroupLayout(scene, lay, screenSizes(scene, lay, assets)) : null;
}

/** The scene one screen of a group is drawn from: its image, its annotations, no stack. */
export function slotScene(scene: Scene, slot: SlotLayout): Scene {
  const annotations =
    slot.index === 0 ? scene.annotations : (scene.slots?.[slot.index - 1]?.annotations ?? []);
  const { stack: _ghosts, ...card } = scene.card;
  return { ...scene, content: slot.content, annotations, card };
}

function renderGroup(
  ctx: Ctx2D,
  scene: Scene,
  lay: ActiveLayout,
  assets: AssetResolver,
  options: RenderOptions,
  scale: number,
  env: RenderEnvironment,
  cache: RenderCache,
): RenderResult {
  const group = computeGroupLayout(scene, lay, screenSizes(scene, lay, assets));
  const primary = primaryLayout(group);
  const { width: W, height: H } = outputSize(primary, scale);
  // Background colours come from screen 0, like a single design.
  const palette = needsPalette(scene) ? scenePalette(scene, assets, env, cache) : null;
  const deps: PassDeps = { env, cache, assets, palette };
  const b = group.bounds;
  const focus = { x: (b.x + b.width / 2) * scale, y: (b.y + b.height / 2) * scale };

  beginFrame(ctx, W, H, options.matte);
  drawScenery(ctx, scene, group.canvas, group.caption, W, H, group.k * scale, scale, focus, deps);
  const placeholders = options.emptySlots === "placeholder";
  for (const i of group.order) {
    const slot = group.slots[i]!;
    if (slot.empty) {
      if (placeholders)
        drawEmptySlot(ctx, slot, scale, fillTone(scene.background.fill, palette, assets));
      continue;
    }
    // Each screen resolves its own frame chrome and edge colours.
    const s = resolveFrameTheme(slotScene(scene, slot), assets, env, cache);
    const pal = needsPalette(s) ? scenePalette(s, assets, env, cache) : null;
    drawCardPass(
      ctx,
      s,
      slot,
      scale,
      W,
      H,
      { ...deps, palette: pal },
      {
        stack: false,
        reflection: group.reflection,
      },
    );
  }
  drawCanvasAnnotations(ctx, scene, group.canvas, group.k, scale);
  ctx.restore();
  cache.trim();
  return { layout: primary, width: W, height: H };
}

/** Screen 0's layout on the group's canvas: what single-card helpers (hit-testing, annotations) use. */
function primaryLayout(group: GroupLayout): SceneLayout {
  const s = group.slots[0]!;
  const out: SceneLayout = {
    canvas: group.canvas,
    k: s.k,
    card: s.card,
    cardToCanvas: s.cardToCanvas,
    canvasToCard: s.canvasToCard,
    perspective: s.perspective,
    cardQuad: s.cardQuad,
    contentPixels: s.contentPixels,
  };
  if (group.caption) out.caption = group.caption;
  return out;
}

/**
 * An empty screen in the editor: the card's silhouette, faintly filled, with a
 * dashed edge and a plus, in the ink that reads on the background.
 */
function drawEmptySlot(ctx: Ctx2D, layout: SlotLayout, scale: number, tone: string): void {
  const D: Mat3 = multiply([scale, 0, 0, 0, scale, 0, 0, 0, 1], layout.cardToCanvas);
  const toDevice = through(D);
  const unit = layout.k * scale;
  const dark = isDark(tone);
  const ink = dark ? "255, 255, 255" : "15, 23, 42";
  const path = silhouetteShapes(layout).flatMap((s) => toDevice(shapePath(s)));
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.beginPath();
  tracePath(ctx, path);
  ctx.fillStyle = `rgba(${ink}, ${dark ? 0.1 : 0.05})`;
  ctx.fill();
  ctx.setLineDash([16 * unit, 12 * unit]);
  ctx.lineWidth = Math.max(1, 4 * unit);
  ctx.strokeStyle = `rgba(${ink}, ${dark ? 0.45 : 0.28})`;
  ctx.stroke();
  ctx.setLineDash([]);
  // A plus in the middle of the screen area.
  const c = layout.card.content;
  const arm = Math.min(c.width, c.height) * 0.06;
  const mid = { x: c.x + c.width / 2, y: c.y + c.height / 2 };
  const plus = [
    [
      { x: mid.x - arm, y: mid.y },
      { x: mid.x + arm, y: mid.y },
    ],
    [
      { x: mid.x, y: mid.y - arm },
      { x: mid.x, y: mid.y + arm },
    ],
  ].map((seg) => seg.map((p) => applyMat3(D, p)));
  ctx.beginPath();
  for (const [a, b] of plus) {
    ctx.moveTo(a!.x, a!.y);
    ctx.lineTo(b!.x, b!.y);
  }
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(1.5, arm * 0.14 * unit);
  ctx.strokeStyle = `rgba(${ink}, ${dark ? 0.6 : 0.36})`;
  ctx.stroke();
  ctx.restore();
}

/** Where a screen sits on the canvas, for hit-testing and drop targets. */
export interface SlotRect {
  /** Screen index (0 = the content). */
  index: number;
  empty: boolean;
  /** Card corners in canvas px at scale 1 (tl, tr, br, bl), rotation and tilt included. */
  quad: [Point, Point, Point, Point];
  /** Axis-aligned bounds of `quad`. */
  bounds: Rect;
  /** Screen content corners in canvas px (tl, tr, br, bl). */
  contentQuad: [Point, Point, Point, Point];
  /** Position in the draw order (0 = back). */
  depth: number;
}

/**
 * Every shown screen's card on the canvas (scale 1), by screen index. A
 * single design reports its one card, so the editor can use one code path.
 */
export function slotRects(scene: Scene, assets: AssetResolver): SlotRect[] {
  const group = layoutGroupScene(scene, assets);
  const layouts: { index: number; empty: boolean; layout: SceneLayout }[] = group
    ? group.slots.map((s) => ({ index: s.index, empty: s.empty, layout: s }))
    : [
        {
          index: 0,
          empty: scene.content.kind === "image" && !scene.content.assetId,
          layout: layoutScene(scene, assets),
        },
      ];
  return layouts.map(({ index, empty, layout }) => {
    const c = layout.card.content;
    return {
      index,
      empty,
      quad: layout.cardQuad,
      bounds: boundsOfPoints(layout.cardQuad),
      contentQuad: rectCorners(c).map((p) => applyMat3(layout.cardToCanvas, p)) as SlotRect["quad"],
      depth: group ? group.order.indexOf(index) : 0,
    };
  });
}

/** Topmost screen whose card contains canvas point (x, y) at scale 1, or null. */
export function slotAt(scene: Scene, assets: AssetResolver, x: number, y: number): number | null {
  const hits = slotRects(scene, assets).filter((r) => insideQuad(r.quad, x, y));
  if (!hits.length) return null;
  return hits.reduce((a, b) => (b.depth > a.depth ? b : a)).index;
}

function insideQuad(q: readonly Point[], x: number, y: number): boolean {
  let sign = 0;
  for (let i = 0; i < q.length; i++) {
    const a = q[i]!;
    const b = q[(i + 1) % q.length]!;
    const cross = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
    if (Math.abs(cross) < 1e-9) continue;
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

function drawTiltedCard(
  ctx: Ctx2D,
  scene: Scene,
  layout: SceneLayout,
  D: Mat3,
  W: number,
  H: number,
  deps: {
    env: RenderEnvironment;
    cache: RenderCache;
    assets: AssetResolver;
    palette: Palette | null;
  },
): void {
  const { card } = layout;
  // Render the flat card at the resolution of its most magnified point.
  const sMax = perspectiveMagnification(D, card.size.width, card.size.height);
  const margin = 2;
  const sw = Math.ceil(card.size.width * sMax + 2 * margin);
  const sh = Math.ceil(card.size.height * sMax + 2 * margin);
  const flat = deps.env.createCanvas(sw, sh);
  const g = get2d(flat, { willReadFrequently: true });
  g.setTransform(sMax, 0, 0, sMax, margin, margin);
  drawCard(g, scene, layout, { ...deps, pixelRatio: sMax });
  const srcToCard: Mat3 = [1 / sMax, 0, -margin / sMax, 0, 1 / sMax, -margin / sMax, 0, 0, 1];
  const warped = warpPerspective(deps.env, flat, sw, sh, multiply(D, srcToCard), W, H);
  if (warped) ctx.drawImage(warped.canvas, warped.x, warped.y);
}

/** Render the flat card (card-local) at `s` device px per cu into an offscreen canvas. */
function flatCard(
  scene: Scene,
  layout: SceneLayout,
  s: number,
  deps: {
    env: RenderEnvironment;
    cache: RenderCache;
    assets: AssetResolver;
    palette: Palette | null;
  },
) {
  const { card } = layout;
  const margin = 2;
  const sw = Math.ceil(card.size.width * s + 2 * margin);
  const sh = Math.ceil(card.size.height * s + 2 * margin);
  const flat = deps.env.createCanvas(sw, sh);
  const g = get2d(flat, { willReadFrequently: true });
  g.setTransform(s, 0, 0, s, margin, margin);
  drawCard(g, scene, layout, { ...deps, pixelRatio: s });
  const srcToCard: Mat3 = [1 / s, 0, -margin / s, 0, 1 / s, -margin / s, 0, 0, 1];
  return { flat, g, sw, sh, srcToCard, margin };
}

function drawReflection(
  ctx: Ctx2D,
  scene: Scene,
  layout: SceneLayout,
  D: Mat3,
  W: number,
  H: number,
  spec: { opacity: number; height: number; gap: number },
  deps: {
    env: RenderEnvironment;
    cache: RenderCache;
    assets: AssetResolver;
    palette: Palette | null;
  },
): void {
  const { card } = layout;
  const s = Math.min(4, perspectiveMagnification(D, card.size.width, card.size.height));
  const { flat, g, sw, sh, srcToCard, margin } = flatCard(scene, layout, s, deps);
  // Fade: strongest at the card's bottom edge, gone `height` of the card above it.
  const yBottom = margin + card.size.height * s;
  const yTop = yBottom - Math.max(0.05, Math.min(1, spec.height)) * card.size.height * s;
  const grad = g.createLinearGradient(0, yTop, 0, yBottom);
  grad.addColorStop(0, "rgba(0, 0, 0, 0)");
  grad.addColorStop(0.6, `rgba(0, 0, 0, ${spec.opacity * 0.35})`);
  grad.addColorStop(1, `rgba(0, 0, 0, ${spec.opacity})`);
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = "destination-in";
  g.fillStyle = grad;
  g.fillRect(0, 0, sw, sh);
  g.restore();
  // Mirror about the card's bottom edge (plus the gap), in the card's own plane.
  const mirror: Mat3 = [1, 0, 0, 0, -1, 2 * card.size.height + spec.gap, 0, 0, 1];
  const M = multiply(D, multiply(mirror, srcToCard));
  if (isAffine(M, 1e-12)) {
    ctx.save();
    ctx.setTransform(M[0], M[3], M[1], M[4], M[2], M[5]);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(flat, 0, 0);
    ctx.restore();
  } else {
    const warped = warpPerspective(deps.env, flat, sw, sh, M, W, H);
    if (warped) ctx.drawImage(warped.canvas, warped.x, warped.y);
  }
}

/** Render to a fresh canvas of exactly outputSize(layout, scale). */
export function renderToCanvas(
  scene: Scene,
  assets: AssetResolver,
  options: RenderOptions = {},
): RenderResult & { canvas: CanvasLike } {
  const env = options.env ?? defaultEnvironment();
  const layout = layoutScene(scene, assets);
  const size = outputSize(layout, options.scale ?? 1);
  const canvas = env.createCanvas(size.width, size.height);
  const ctx = get2d(canvas);
  const result = renderScene(ctx, scene, assets, { ...options, env });
  return { ...result, canvas };
}
