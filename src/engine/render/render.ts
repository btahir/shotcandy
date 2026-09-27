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
import { type Mat3, multiply } from "../math/matrix";
import { type Path, projectPath } from "../math/path";
import { type Palette, extractPalette } from "../palette/extract";
import { resolveShadowLayers } from "../presets/shadows";
import type { Scene } from "../scene/types";
import type { Shape } from "../frames/types";
import { drawAnnotation } from "./annotations";
import { drawBackground } from "./background";
import { RenderCache } from "./cache";
import { drawCard } from "./card";
import { getContentRenderer } from "./content";
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
import { toCss } from "../math/color";
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

/** Layout for a scene given its assets (natural content size resolved via the content registry). */
export function layoutScene(scene: Scene, assets: AssetResolver): SceneLayout {
  const renderer = getContentRenderer(scene.content.kind);
  const natural = renderer ? renderer.naturalSize(scene.content as never, assets) : null;
  return computeLayout(scene, natural);
}

function needsPalette(scene: Scene): boolean {
  return (
    scene.background.fill.kind === "auto" ||
    (scene.card.inset.width > 0 && scene.card.inset.color === "auto")
  );
}

/** Palette of the scene's content image (precomputed on the asset, else derived and cached). */
export function scenePalette(
  scene: Scene,
  assets: AssetResolver,
  env: RenderEnvironment,
  cache: RenderCache,
): Palette | null {
  if (scene.content.kind !== "image" || !scene.content.assetId) return null;
  const src = assets.get(scene.content.assetId);
  if (!src) return null;
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
  const layout = layoutScene(scene, assets);
  const { width: W, height: H } = outputSize(layout, scale);
  const unit = layout.k * scale;
  const palette = needsPalette(scene) ? scenePalette(scene, assets, env, cache) : null;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.clearRect(0, 0, W, H);
  if (options.matte) {
    ctx.fillStyle = toCss(options.matte);
    ctx.fillRect(0, 0, W, H);
  }

  // Background.
  drawBackground(ctx, scene.background.fill, scene.background.grain, W, H, {
    env,
    cache,
    assets,
    palette,
    unit,
    scale,
  });

  // Card-local cu -> device px.
  const D: Mat3 = multiply([scale, 0, 0, 0, scale, 0, 0, 0, 1], layout.cardToCanvas);
  const affine = !layout.perspective;
  const toDevice = (p: Path): Path =>
    affine
      ? affinePath(p, { a: D[0], b: D[3], c: D[1], d: D[4], e: D[2], f: D[5] })
      : projectPath(p, D, 16);

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
      env,
      cache,
      assets,
      palette,
      pixelRatio: Math.sqrt(Math.abs(D[0] * D[4] - D[1] * D[3])),
    });
    ctx.restore();
  } else {
    drawTiltedCard(ctx, scene, layout, D, W, H, { env, cache, assets, palette });
  }

  // Canvas-anchored annotations (on top of everything).
  const canvasAnnotations = scene.annotations.filter((a) => a.anchor === "canvas");
  if (canvasAnnotations.length) {
    ctx.save();
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const box = {
      rect: { x: 0, y: 0, width: layout.canvas.width, height: layout.canvas.height },
      unit: layout.k,
    };
    for (const a of canvasAnnotations) drawAnnotation(ctx, a, box);
    ctx.restore();
  }

  ctx.restore();
  cache.trim();
  return { layout, width: W, height: H };
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
