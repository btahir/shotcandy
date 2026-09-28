/**
 * Export pipeline (runs identically on the main thread and inside the export
 * worker): decode original assets -> render at scale -> encode.
 */
import { type AssetResolver, type AssetSource, MapAssetResolver } from "../assets/types";
import type { Palette } from "../palette/extract";
import { RenderCache } from "../render/cache";
import { type RenderEnvironment, defaultEnvironment, imageSize } from "../render/env";
import { renderToCanvas } from "../render/render";
import type { Scene } from "../scene/types";
import { type ExportOptions, MIME_TYPES, canEncode, canvasToBlob } from "./formats";

/** An asset as handed to an export: the original file plus metadata. */
export interface ExportAsset {
  id: string;
  width: number;
  height: number;
  blob: Blob;
  palette?: Palette;
  /** Screen recordings: `blob` is the video, this its first frame (PNG). */
  poster?: Blob;
  /**
   * Screen recordings in still exports: decode the frame at this time (the
   * trim start) at full size instead of using the poster.
   */
  stillAt?: number;
}

export interface ExportResult {
  blob: Blob;
  width: number;
  height: number;
  /** Actual MIME type (may be PNG if the browser cannot encode the requested format). */
  mime: string;
  /** Milliseconds spent rendering and encoding. */
  renderMs: number;
  encodeMs: number;
  via: "main" | "worker";
}

export type Decoder = (blob: Blob) => Promise<CanvasImageSource & { close?: () => void }>;

export const defaultDecoder: Decoder = (blob) =>
  createImageBitmap(blob, { imageOrientation: "from-image" } as ImageBitmapOptions);

/** Decode export assets at full resolution into a resolver. */
export async function decodeAssets(
  assets: ExportAsset[],
  decode: Decoder = defaultDecoder,
): Promise<{ resolver: AssetResolver; release: () => void }> {
  const decoded = await Promise.all(
    assets.map(async (a) => {
      // A recording decodes its poster (or, for stills, the frame at the trim
      // start); motion exports take frames from the video while rendering.
      const still =
        a.poster && a.stillAt !== undefined
          ? await import("../video/still").then((m) => m.decodeStill(a.blob, a.stillAt!))
          : null;
      const image: CanvasImageSource & { close?: () => void } =
        still?.image ?? (await decode(a.poster ?? a.blob));
      const size = still ?? (a.poster ? imageSize(image) : { width: a.width, height: a.height });
      const source: AssetSource = {
        id: a.id,
        width: a.width,
        height: a.height,
        images: [{ image, width: size.width, height: size.height }],
        ...(a.palette ? { palette: a.palette } : {}),
        ...(a.poster ? { video: { blob: a.blob } } : {}),
      };
      return { source, image };
    }),
  );
  return {
    resolver: new MapAssetResolver(decoded.map((d) => d.source)),
    release: () => decoded.forEach((d) => d.image.close?.()),
  };
}

const now = () => (typeof performance !== "undefined" ? performance.now() : 0);

/** Render and encode a scene with an already-resolved set of assets. */
export async function exportWithResolver(
  scene: Scene,
  resolver: AssetResolver,
  options: ExportOptions,
  env: RenderEnvironment = defaultEnvironment(),
  via: ExportResult["via"] = "main",
): Promise<ExportResult> {
  const t0 = now();
  // A private cache: exports are one-shot and should not evict preview entries.
  const cache = new RenderCache(512 * 1024 * 1024);
  const { canvas, width, height } = renderToCanvas(scene, resolver, {
    scale: options.scale,
    env,
    cache,
    matte: options.format === "jpeg" ? "#ffffff" : null,
  });
  const t1 = now();
  let mime = MIME_TYPES[options.format];
  if (!(await canEncode(options.format, () => env.createCanvas(1, 1)))) mime = MIME_TYPES.png;
  const quality = options.format === "png" ? undefined : (options.quality ?? 0.92);
  const blob = await canvasToBlob(canvas, mime, quality);
  cache.clear();
  return {
    blob,
    width,
    height,
    mime: blob.type || mime,
    renderMs: t1 - t0,
    encodeMs: now() - t1,
    via,
  };
}

/** Main-thread export from original asset blobs. */
export async function exportScene(
  scene: Scene,
  assets: ExportAsset[],
  options: ExportOptions,
  env?: RenderEnvironment,
  decode?: Decoder,
): Promise<ExportResult> {
  const { resolver, release } = await decodeAssets(assets, decode);
  try {
    return await exportWithResolver(scene, resolver, options, env);
  } finally {
    release();
  }
}
