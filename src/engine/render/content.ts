/**
 * Content renderers: what goes inside the card's content rect.
 *
 * A registry keyed by `content.kind`. MVP ships "image" and "placeholder";
 * phase 2 registers "code" (syntax-highlighted code card) and "post"
 * (tweet/testimonial card) renderers here. Each renderer reports the natural
 * pixel size used by layout and draws itself into the content rect.
 */
import { type AssetResolver, type AssetSource, pickImage } from "../assets/types";
import { gaussianBlurRGBA, pixelateRGBA } from "../math/blur";
import { parseColor, toCss } from "../math/color";
import { redactAutoFill, surroundLightness } from "../analysis/tone";
import type { Rect, Size } from "../math/geometry";
import { stableStringify } from "../math/random";
import { effectiveCrop } from "../layout/layout";
import type { Content, CropRect, RedactAnnotation, Scene } from "../scene/types";
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
  /**
   * Where content annotations (redactions) are anchored, when not `rect`: the
   * whole image of a grid cell that shows only part of it (see CardGeometry.notes).
   */
  notes?: Rect;
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
        list.map(({ x, y, w, h, mode, strength, fill }) =>
          mode === "solid"
            ? { x, y, w, h, mode, fill: fill ?? "auto" }
            : { x, y, w, h, mode, strength },
        ),
      )
    : "";
}

export interface SourceRegion {
  image: ImageLike;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The cropped source at the smallest mip level that is still at least
 * `targetW` wide. Levels are produced by successive halving (browsers'
 * single-pass downscales alias badly beyond 2x) and cached per level, so
 * resizing the preview never re-halves the whole image.
 */
export function mipSource(
  env: RenderEnvironment,
  cache: RenderCache,
  srcId: string,
  img: { image: ImageLike; width: number; height: number },
  crop: { x: number; y: number; width: number; height: number },
  targetW: number,
): SourceRegion {
  const sx = crop.x * img.width;
  const sy = crop.y * img.height;
  const sw = crop.width * img.width;
  const sh = crop.height * img.height;
  if (sw / targetW < 2) return { image: img.image, x: sx, y: sy, w: sw, h: sh };
  const levels = Math.floor(Math.log2(sw / targetW));
  const cropKey = stableStringify(crop);
  let prev: SourceRegion = { image: img.image, x: sx, y: sy, w: sw, h: sh };
  let pw = Math.round(sw);
  let ph = Math.round(sh);
  for (let n = 1; n <= levels; n++) {
    const nw = Math.max(1, Math.round(pw / 2));
    const nh = Math.max(1, Math.round(ph / 2));
    const from = prev;
    const level = cache.get(`mip:${srcId}:${img.width}:${cropKey}:${n}`, () => {
      const c = env.createCanvas(nw, nh);
      const g = get2d(c);
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = "high";
      g.drawImage(from.image, from.x, from.y, from.w, from.h, 0, 0, nw, nh);
      return { value: c, bytes: nw * nh * 4 };
    });
    prev = { image: level, x: 0, y: 0, w: nw, h: nh };
    pw = nw;
    ph = nh;
  }
  return prev;
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
  cropOverride?: CropRect,
  crisp = false,
): CanvasLike | null {
  if (!content.assetId) return null;
  const src = assets.get(content.assetId);
  if (!src) return null;
  const crop = cropOverride ?? content.crop ?? { x: 0, y: 0, width: 1, height: 1 };
  const W = Math.max(1, Math.round(dw));
  const H = Math.max(1, Math.round(dh));
  const img = pickImage(src, W / crop.width);
  if (!img) return null;
  const key = `content:${src.id}:${img.width}:${W}x${H}:${stableStringify(crop)}:${redactionsKey(redactions)}:${unitPx.toFixed(4)}:${crisp ? 1 : 0}`;
  return cache.get(key, () => {
    const fills = new Map<RedactAnnotation, string>();
    for (const r of redactions)
      if (r.mode === "solid") fills.set(r, solidFill(env, cache, src, crop, r));
    const base = fills.size ? maskedSource(env, cache, src.id, img, crop, fills) : null;
    const m = base
      ? mipSource(env, cache, base.id, base.img, crop, W)
      : mipSource(env, cache, src.id, img, crop, W);
    const out = env.createCanvas(W, H);
    const g = get2d(out, { willReadFrequently: redactions.length > 0 });
    g.imageSmoothingEnabled = !crisp;
    g.imageSmoothingQuality = "high";
    g.drawImage(m.image, m.x, m.y, m.w, m.h, 0, 0, W, H);
    for (const r of redactions) {
      const fill = fills.get(r);
      if (fill) fillRedaction(g, r, W, H, fill);
      else applyRedaction(g, r, W, H, unitPx);
    }
    return { value: out, bytes: W * H * 4 };
  });
}

/**
 * The source image with its solid boxes already painted over, in whole source
 * pixels. Downscaling or smoothing then never blends a hidden pixel into the
 * ones around the box: only the box colour can bleed past its edge.
 */
function maskedSource(
  env: RenderEnvironment,
  cache: RenderCache,
  srcId: string,
  img: { image: ImageLike; width: number; height: number },
  crop: CropRect,
  fills: Map<RedactAnnotation, string>,
): { id: string; img: { image: ImageLike; width: number; height: number } } {
  const boxes = [...fills].map(([r, fill]) => ({
    x: crop.x + Math.min(r.x, r.x + r.w) * crop.width,
    y: crop.y + Math.min(r.y, r.y + r.h) * crop.height,
    w: Math.abs(r.w) * crop.width,
    h: Math.abs(r.h) * crop.height,
    fill,
  }));
  const id = `${srcId}#solid:${stableStringify(boxes)}`;
  const image = cache.get(`masked:${id}:${img.width}`, () => {
    const c = env.createCanvas(img.width, img.height);
    const g = get2d(c);
    g.drawImage(img.image, 0, 0, img.width, img.height);
    for (const b of boxes) {
      const x0 = Math.max(0, Math.floor(b.x * img.width));
      const y0 = Math.max(0, Math.floor(b.y * img.height));
      const x1 = Math.min(img.width, Math.ceil((b.x + b.w) * img.width));
      const y1 = Math.min(img.height, Math.ceil((b.y + b.h) * img.height));
      if (x1 <= x0 || y1 <= y0) continue;
      g.fillStyle = b.fill;
      g.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
    return { value: c, bytes: img.width * img.height * 4 };
  });
  return { id, img: { image, width: img.width, height: img.height } };
}

/**
 * Redactions placed on the whole image (`notes`), in the coordinates of the
 * part drawn (`rect`), so they cover the same pixels; ones entirely outside
 * the drawn part are dropped.
 */
function inRect(list: RedactAnnotation[], notes: Rect | undefined, rect: Rect): RedactAnnotation[] {
  if (!notes || !list.length) return list;
  const out: RedactAnnotation[] = [];
  for (const r of list) {
    const x = (notes.x + r.x * notes.width - rect.x) / rect.width;
    const y = (notes.y + r.y * notes.height - rect.y) / rect.height;
    const w = (r.w * notes.width) / rect.width;
    const h = (r.h * notes.height) / rect.height;
    const [x0, x1] = w < 0 ? [x + w, x] : [x, x + w];
    const [y0, y1] = h < 0 ? [y + h, y] : [y, y + h];
    if (x1 <= 0 || y1 <= 0 || x0 >= 1 || y0 >= 1) continue;
    out.push({ ...r, x, y, w, h });
  }
  return out;
}

/** A redaction's pixel bounds in a W x H raster, rounded outwards (null when empty). */
function redactionBounds(r: RedactAnnotation, W: number, H: number) {
  const x0 = Math.max(0, Math.floor(Math.min(r.x, r.x + r.w) * W));
  const y0 = Math.max(0, Math.floor(Math.min(r.y, r.y + r.h) * H));
  const x1 = Math.min(W, Math.ceil(Math.max(r.x, r.x + r.w) * W));
  const y1 = Math.min(H, Math.ceil(Math.max(r.y, r.y + r.h) * H));
  return x1 - x0 < 1 || y1 - y0 < 1 ? null : { x0, y0, x1, y1 };
}

/**
 * A solid redaction's colour, always opaque. "auto" reads the source pixels
 * around the box (in source coordinates, so it is the same in every layout,
 * crop and output size).
 */
export function solidFill(
  env: RenderEnvironment,
  cache: RenderCache,
  src: AssetSource,
  crop: CropRect,
  r: RedactAnnotation,
): string {
  if (r.fill && r.fill !== "auto") {
    const c = parseColor(r.fill);
    return toCss({ ...c, a: 1 });
  }
  const u = (v: number) => Math.min(1, Math.max(0, crop.x + v * crop.width));
  const v = (w: number) => Math.min(1, Math.max(0, crop.y + w * crop.height));
  const L = surroundLightness(env, cache, src, {
    x0: u(Math.min(r.x, r.x + r.w)),
    y0: v(Math.min(r.y, r.y + r.h)),
    x1: u(Math.max(r.x, r.x + r.w)),
    y1: v(Math.max(r.y, r.y + r.h)),
  });
  return toCss(redactAutoFill(L));
}

/**
 * Solid box: every pixel of the region (rounded outwards to whole pixels, so
 * no edge pixel is part-covered) replaced by an opaque colour. Nothing of what
 * was underneath survives in the raster the card is drawn from.
 */
function fillRedaction(g: Ctx2D, r: RedactAnnotation, W: number, H: number, fill: string): void {
  const b = redactionBounds(r, W, H);
  if (!b) return;
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = "source-over";
  g.fillStyle = fill;
  g.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
  g.restore();
}

function applyRedaction(g: Ctx2D, r: RedactAnnotation, W: number, H: number, unitPx: number): void {
  const b = redactionBounds(r, W, H);
  if (!b) return;
  const { x0, y0, x1, y1 } = b;
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
    const redactions = inRect(
      dc.scene.annotations.filter((a): a is RedactAnnotation => a.kind === "redact"),
      dc.notes,
      dc.rect,
    );
    const dw = dc.rect.width * dc.pixelRatio;
    const dh = dc.rect.height * dc.pixelRatio;
    const src = content.assetId ? dc.assets.get(content.assetId) : undefined;
    const crop = src
      ? effectiveCrop(content, { width: src.width, height: src.height }, dc.scene.card.frame.id)
          .crop
      : (content.crop ?? { x: 0, y: 0, width: 1, height: 1 });
    // Small sources magnified 2x or more stay crisp (nearest neighbour) unless asked otherwise.
    const magnification = src ? dw / Math.max(1, crop.width * src.width) : 1;
    const crisp =
      content.sampling === "pixel"
        ? magnification > 1.01
        : content.sampling !== "smooth" &&
          !!src &&
          Math.max(src.width, src.height) < 1000 &&
          magnification >= 1.95;
    ctx.imageSmoothingEnabled = !crisp;
    ctx.imageSmoothingQuality = "high";
    if (src && redactions.length === 0) {
      // Fast path: draw straight from the nearest mip level.
      const img = pickImage(src, dw / crop.width);
      if (img) {
        const m = mipSource(dc.env, dc.cache, src.id, img, crop, Math.max(1, Math.round(dw)));
        ctx.drawImage(
          m.image,
          m.x,
          m.y,
          m.w,
          m.h,
          dc.rect.x,
          dc.rect.y,
          dc.rect.width,
          dc.rect.height,
        );
        return;
      }
    }
    const canvas = processedImage(
      dc.env,
      dc.cache,
      dc.assets,
      content,
      redactions,
      dw,
      dh,
      dc.pixelRatio,
      crop,
      crisp,
    );
    if (!canvas) {
      drawPlaceholder(ctx, dc.rect, "#f4f4f5");
      return;
    }
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
