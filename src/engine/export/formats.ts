/** Export formats, encoding and canvas size limits. */
import type { SceneLayout } from "../layout/layout";
import type { CanvasLike } from "../render/env";

export type ExportFormat = "png" | "jpeg" | "webp";

export const EXPORT_FORMATS: readonly ExportFormat[] = ["png", "jpeg", "webp"];

export const MIME_TYPES: Record<ExportFormat, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

export const FILE_EXTENSIONS: Record<ExportFormat, string> = {
  png: "png",
  jpeg: "jpg",
  webp: "webp",
};

export interface ExportOptions {
  format: ExportFormat;
  /** Output scale: 1-4 for exports; fractional values are allowed for thumbnails. */
  scale: number;
  /** 0..1 for JPEG/WebP (default 0.92). Ignored for PNG. */
  quality?: number;
}

export const EXPORT_SCALES = [1, 2, 3, 4] as const;

/**
 * Conservative canvas limits. Chrome/Firefox allow 32767 px sides and ~268 MP;
 * Safari (notably iOS) caps canvas area at 16,777,216 px (4096 x 4096).
 */
export interface CanvasLimits {
  maxSide: number;
  maxArea: number;
}

export const DESKTOP_LIMITS: CanvasLimits = { maxSide: 32767, maxArea: 268_435_456 };
export const SAFARI_LIMITS: CanvasLimits = { maxSide: 16384, maxArea: 16_777_216 };

export function detectCanvasLimits(): CanvasLimits {
  if (typeof navigator === "undefined") return DESKTOP_LIMITS;
  const ua = navigator.userAgent;
  const isSafari = /Safari\//.test(ua) && !/Chrome\/|Chromium\/|Edg\//.test(ua);
  const isIOS =
    /iPhone|iPad|iPod/.test(ua) ||
    (/Macintosh/.test(ua) &&
      typeof navigator.maxTouchPoints === "number" &&
      navigator.maxTouchPoints > 1);
  return isSafari || isIOS ? SAFARI_LIMITS : DESKTOP_LIMITS;
}

/** Largest integer scale (1..4) whose output fits the limits; 0 if even 1x does not fit. */
export function maxExportScale(
  layout: SceneLayout,
  limits: CanvasLimits = detectCanvasLimits(),
): number {
  for (let s = 4; s >= 1; s--) {
    const w = Math.round(layout.canvas.width * s);
    const h = Math.round(layout.canvas.height * s);
    if (w <= limits.maxSide && h <= limits.maxSide && w * h <= limits.maxArea) return s;
  }
  return 0;
}

export async function canvasToBlob(
  canvas: CanvasLike,
  mime: string,
  quality?: number,
): Promise<Blob> {
  if ("convertToBlob" in canvas) {
    return canvas.convertToBlob({ type: mime, ...(quality !== undefined ? { quality } : {}) });
  }
  return new Promise((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Canvas encoding failed"))),
      mime,
      quality,
    );
  });
}

const encodeSupport = new Map<string, Promise<boolean>>();

/**
 * Whether this browser can encode `format` (Safari silently returns PNG for
 * WebP, so we check the resulting blob type once and remember it).
 */
export function canEncode(format: ExportFormat, makeCanvas: () => CanvasLike): Promise<boolean> {
  if (format === "png") return Promise.resolve(true);
  const mime = MIME_TYPES[format];
  let p = encodeSupport.get(mime);
  if (!p) {
    const probe = makeCanvas();
    // An OffscreenCanvas without a context refuses to encode at all.
    (probe as { getContext?: (t: "2d") => unknown }).getContext?.("2d");
    p = canvasToBlob(probe, mime, 0.8)
      .then((b) => b.type === mime)
      .catch(() => false);
    encodeSupport.set(mime, p);
  }
  return p;
}
