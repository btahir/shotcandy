/**
 * Import pipeline: bytes -> validated, decoded, content-addressed image with an
 * editing proxy and a palette.
 *
 * Huge images are handled sensibly: the original file is always kept (exports
 * decode it at full resolution), while editing uses a proxy whose longer side
 * is at most `maxProxySide`, so interaction stays fast with 4K+ inputs.
 */
import { hashBytes } from "../math/random";
import { extractPalette, type Palette } from "../palette/extract";
import { stepDown } from "../render/content";
import { type ImageLike, type RenderEnvironment, defaultEnvironment, get2d } from "../render/env";
import { ImportError, validateImageBytes } from "./input";
import type { VideoInfo } from "../video/import";

/** Reject inputs beyond this many pixels (decoding would exhaust memory). */
export const MAX_INPUT_PIXELS = 120_000_000;
export const DEFAULT_PROXY_SIDE = 2560;

export interface ImportedImage {
  /** Content hash id, e.g. "img_3f2a…". Same bytes -> same id. */
  id: string;
  /** The original file bytes (kept for export and storage). */
  blob: Blob;
  mime: string;
  width: number;
  height: number;
  /** Editing proxy (the original itself when it is small enough). */
  proxy: ImageLike;
  proxyWidth: number;
  proxyHeight: number;
  /** Full-resolution decode, kept only when it is the proxy. */
  original: ImageLike | null;
  palette: Palette;
  /**
   * Screen recordings (video/import.ts): `blob` is the video file, `proxy`
   * its first frame, and `poster` that frame as a PNG for exports.
   */
  video?: { poster: Blob; info: VideoInfo };
}

export interface ImportOptions {
  maxProxySide?: number;
  env?: RenderEnvironment;
  decode?: (blob: Blob) => Promise<ImageLike & { close?: () => void }>;
}

export function assetIdForBytes(bytes: Uint8Array): string {
  return `img_${hashBytes(bytes)}`;
}

/** Palette from a decoded image (downscaled to <= 256 px on the longer side first). */
export function paletteFromImage(
  env: RenderEnvironment,
  image: ImageLike,
  width: number,
  height: number,
): Palette {
  const s = Math.min(1, 256 / Math.max(width, height));
  const w = Math.max(1, Math.round(width * s));
  const h = Math.max(1, Math.round(height * s));
  const stepped = stepDown(env, image, width, height, w);
  const c = env.createCanvas(w, h);
  const g = get2d(c, { willReadFrequently: true });
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  g.drawImage(stepped.image, 0, 0, stepped.width, stepped.height, 0, 0, w, h);
  const data = g.getImageData(0, 0, w, h);
  return extractPalette({ data: data.data, width: w, height: h });
}

export async function importImage(input: Blob, opts: ImportOptions = {}): Promise<ImportedImage> {
  const env = opts.env ?? defaultEnvironment();
  const bytes = new Uint8Array(await input.arrayBuffer());
  const mime = validateImageBytes(bytes);
  const blob = input.type === mime ? input : new Blob([bytes], { type: mime });
  const decode =
    opts.decode ??
    ((b: Blob) => createImageBitmap(b, { imageOrientation: "from-image" } as ImageBitmapOptions));
  let decoded: ImageLike & { close?: () => void };
  try {
    decoded = await decode(blob);
  } catch {
    throw new ImportError("decode-failed", "This image could not be decoded. It may be corrupt.");
  }
  const { width, height } = decoded as unknown as { width: number; height: number };
  if (!width || !height) throw new ImportError("decode-failed", "This image has no pixels.");
  if (width * height > MAX_INPUT_PIXELS) {
    decoded.close?.();
    throw new ImportError(
      "too-large",
      `This image is ${width} × ${height}; the maximum is about ${Math.round(MAX_INPUT_PIXELS / 1e6)} megapixels.`,
    );
  }
  const maxSide = opts.maxProxySide ?? DEFAULT_PROXY_SIDE;
  const palette = paletteFromImage(env, decoded, width, height);
  let proxy: ImageLike = decoded;
  let pw = width;
  let ph = height;
  let original: ImageLike | null = decoded;
  if (Math.max(width, height) > maxSide) {
    const s = maxSide / Math.max(width, height);
    pw = Math.max(1, Math.round(width * s));
    ph = Math.max(1, Math.round(height * s));
    const stepped = stepDown(env, decoded, width, height, pw);
    const c = env.createCanvas(pw, ph);
    const g = get2d(c);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    g.drawImage(stepped.image, 0, 0, stepped.width, stepped.height, 0, 0, pw, ph);
    proxy = c;
    original = null;
    decoded.close?.();
  }
  return {
    id: assetIdForBytes(bytes),
    blob,
    mime,
    width,
    height,
    proxy,
    proxyWidth: pw,
    proxyHeight: ph,
    original,
    palette,
  };
}
