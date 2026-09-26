/**
 * Content renderers: what goes inside the card's content rect.
 *
 * A registry keyed by `content.kind`. MVP ships "image" and "placeholder";
 * phase 2 registers "code" (syntax-highlighted code card) and "post"
 * (tweet/testimonial card) renderers here. Each renderer reports the natural
 * pixel size used by layout and draws itself into the content rect.
 */
import { type AssetResolver, pickImage } from "../assets/types";
import { gaussianBlurRGBA, pixelateRGBA } from "../math/blur";
import { toCss } from "../math/color";
import type { Rect, Size } from "../math/geometry";
import { stableStringify } from "../math/random";
import type { Content, RedactAnnotation, Scene } from "../scene/types";
import type { RenderCache } from "./cache";
import { type CanvasLike, type Ctx2D, type ImageLike, type RenderEnvironment, get2d } from "./env";
import { fillRoundedRect } from "./draw";

export interface ContentDrawContext {
  env: RenderEnvironment;
  cache: RenderCache;
  assets: AssetResolver;
  scene: Scene;
  /** Target rect in the context's current units (card units). */
  rect: Rect;
  /** Device pixels per current unit (for choosing source resolution). */
  pixelRatio: number;
}

export interface ContentRenderer<C extends Content = Content> {
  kind: C["kind"];
  /** Natural pixel size (drives auto canvas size and card units). */
  naturalSize(content: C, assets: AssetResolver): Size | null;
  draw(ctx: Ctx2D, content: C, dc: ContentDrawContext): void;
}

const registry = new Map<string, ContentRenderer>();

export function registerContentRenderer<C extends Content>(r: ContentRenderer<C>): void {
  registry.set(r.kind, r as unknown as ContentRenderer);
}

export function getContentRenderer(kind: string): ContentRenderer | undefined {
  return registry.get(kind);
}

// ----------------------------------------------------------------------------
// Image content
// ----------------------------------------------------------------------------

/**
 * High-quality downscale by successive halving (browsers' single-pass
 * downscales alias badly beyond 2x). Returns the source when no step is needed.
 */
export function stepDown(
  env: RenderEnvironment,
  img: ImageLike,
  sw: number,
  sh: number,
  tw: number,
): { image: ImageLike; width: number; height: number } {
  let cur: ImageLike = img;
  let w = sw;
  let h = sh;
  while (w / 2 >= tw * 1.0001 && w > 2) {
    const nw = Math.max(1, Math.round(w / 2));
    const nh = Math.max(1, Math.round(h / 2));
    const c = env.createCanvas(nw, nh);
    const g = get2d(c);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    g.drawImage(cur, 0, 0, w, h, 0, 0, nw, nh);
    cur = c;
    w = nw;
    h = nh;
  }
  return { image: cur, width: w, height: h };
}

function redactionsKey(list: RedactAnnotation[]): string {
  return list.length
    ? stableStringify(
        list.map(({ x, y, w, h, mode, strength }) => ({ x, y, w, h, mode, strength })),
      )
    : "";
}

/**
 * The screenshot rasterized at exactly its on-screen device size, with crop and
 * redactions applied. Cached per (asset, size, crop, redactions).
 */
export function processedImage(
  env: RenderEnvironment,
  cache: RenderCache,
  assets: AssetResolver,
  content: Extract<Content, { kind: "image" }>,
  redactions: RedactAnnotation[],
  dw: number,
  dh: number,
  unitPx: number,
): CanvasLike | null {
  if (!content.assetId) return null;
  const src = assets.get(content.assetId);
  if (!src) return null;
  const crop = content.crop ?? { x: 0, y: 0, width: 1, height: 1 };
  const W = Math.max(1, Math.round(dw));
  const H = Math.max(1, Math.round(dh));
  const img = pickImage(src, W / crop.width);
  if (!img) return null;
  const key = `content:${src.id}:${img.width}:${W}x${H}:${stableStringify(crop)}:${redactionsKey(redactions)}:${unitPx.toFixed(4)}`;
  return cache.get(key, () => {
    const sx = crop.x * img.width;
    const sy = crop.y * img.height;
    const sw = crop.width * img.width;
    const sh = crop.height * img.height;
    let source: ImageLike = img.image;
    let rx = sx;
    let ry = sy;
    let rw = sw;
    let rh = sh;
    if (sw / W > 2) {
      // Crop first, then halve down towards the target size.
      const cropped = env.createCanvas(Math.round(sw), Math.round(sh));
      get2d(cropped).drawImage(img.image, sx, sy, sw, sh, 0, 0, Math.round(sw), Math.round(sh));
      const stepped = stepDown(env, cropped, Math.round(sw), Math.round(sh), W);
      source = stepped.image;
      rx = 0;
      ry = 0;
      rw = stepped.width;
      rh = stepped.height;
    }
    const out = env.createCanvas(W, H);
    const g = get2d(out, { willReadFrequently: redactions.length > 0 });
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    g.drawImage(source, rx, ry, rw, rh, 0, 0, W, H);
    for (const r of redactions) applyRedaction(g, r, W, H, unitPx);
    return { value: out, bytes: W * H * 4 };
  });
}

function applyRedaction(g: Ctx2D, r: RedactAnnotation, W: number, H: number, unitPx: number): void {
  const x0 = Math.max(0, Math.floor(Math.min(r.x, r.x + r.w) * W));
  const y0 = Math.max(0, Math.floor(Math.min(r.y, r.y + r.h) * H));
  const x1 = Math.min(W, Math.ceil(Math.max(r.x, r.x + r.w) * W));
  const y1 = Math.min(H, Math.ceil(Math.max(r.y, r.y + r.h) * H));
  if (x1 - x0 < 1 || y1 - y0 < 1) return;
  const strengthPx = Math.max(1, r.strength * unitPx);
  if (r.mode === "pixelate") {
    const img = g.getImageData(x0, y0, x1 - x0, y1 - y0);
    pixelateRGBA(img.data, img.width, img.height, strengthPx);
    g.putImageData(img, x0, y0);
    return;
  }
  // Blur reads the surrounding pixels so edges of the region are not smeared
  // towards the clamp, then writes back only the region itself. The region is
  // redacted twice-over with a strong blur so text is unrecoverable.
  const m = Math.ceil(strengthPx * 3);
  const bx0 = Math.max(0, x0 - m);
  const by0 = Math.max(0, y0 - m);
  const bx1 = Math.min(W, x1 + m);
  const by1 = Math.min(H, y1 + m);
  const img = g.getImageData(bx0, by0, bx1 - bx0, by1 - by0);
  gaussianBlurRGBA(img.data, img.width, img.height, strengthPx);
  g.putImageData(img, bx0, by0, x0 - bx0, y0 - by0, x1 - x0, y1 - y0);
}

export const imageContent: ContentRenderer<Extract<Content, { kind: "image" }>> = {
  kind: "image",
  naturalSize(content, assets) {
    if (!content.assetId) return null;
    const s = assets.get(content.assetId);
    return s ? { width: s.width, height: s.height } : null;
  },
  draw(ctx, content, dc) {
    const redactions = dc.scene.annotations.filter(
      (a): a is RedactAnnotation => a.kind === "redact",
    );
    const dw = dc.rect.width * dc.pixelRatio;
    const dh = dc.rect.height * dc.pixelRatio;
    const canvas = processedImage(
      dc.env,
      dc.cache,
      dc.assets,
      content,
      redactions,
      dw,
      dh,
      dw / dc.rect.width,
    );
    if (!canvas) {
      drawPlaceholder(ctx, dc.rect, "#f4f4f5");
      return;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(canvas, dc.rect.x, dc.rect.y, dc.rect.width, dc.rect.height);
  },
};

/** Neutral skeleton UI, used before a screenshot is loaded and in preset thumbnails. */
export function drawPlaceholder(ctx: Ctx2D, r: Rect, color: string): void {
  ctx.fillStyle = toCss(color);
  ctx.fillRect(r.x, r.y, r.width, r.height);
  const u = Math.min(r.width, r.height) / 20;
  const bar = "#00000014";
  fillRoundedRect(
    ctx,
    { x: r.x + u * 1.5, y: r.y + u * 1.5, width: r.width * 0.28, height: u * 1.2 },
    u * 0.6,
    "#0000001f",
  );
  fillRoundedRect(
    ctx,
    { x: r.x + u * 1.5, y: r.y + u * 4, width: r.width * 0.22, height: r.height - u * 5.5 },
    u * 0.8,
    bar,
  );
  const cx = r.x + u * 2.5 + r.width * 0.22;
  const cw = r.width - (cx - r.x) - u * 1.5;
  fillRoundedRect(
    ctx,
    { x: cx, y: r.y + u * 4, width: cw, height: (r.height - u * 5.5) * 0.55 },
    u * 0.8,
    bar,
  );
  fillRoundedRect(
    ctx,
    {
      x: cx,
      y: r.y + u * 4.8 + (r.height - u * 5.5) * 0.55,
      width: cw * 0.48,
      height: (r.height - u * 5.5) * 0.45 - u * 0.8,
    },
    u * 0.8,
    bar,
  );
  fillRoundedRect(
    ctx,
    {
      x: cx + cw * 0.52,
      y: r.y + u * 4.8 + (r.height - u * 5.5) * 0.55,
      width: cw * 0.48,
      height: (r.height - u * 5.5) * 0.45 - u * 0.8,
    },
    u * 0.8,
    bar,
  );
}

export const placeholderContent: ContentRenderer<Extract<Content, { kind: "placeholder" }>> = {
  kind: "placeholder",
  naturalSize: (c) => ({ width: c.width, height: c.height }),
  draw(ctx, content, dc) {
    drawPlaceholder(ctx, dc.rect, content.color);
  },
};

registerContentRenderer(imageContent);
registerContentRenderer(placeholderContent);
