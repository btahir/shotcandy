/**
 * Node rendering environment for tests, backed by @napi-rs/canvas (Skia, the
 * same rasterizer Chrome uses). Types are cast to the DOM canvas types the
 * engine is written against.
 */
import { readFileSync } from "node:fs";
import { type Canvas, ImageData as NapiImageData, createCanvas, loadImage } from "@napi-rs/canvas";
import type { AssetSource } from "@/engine/assets/types";
import type { RenderEnvironment } from "@/engine/render/env";

export const nodeEnv: RenderEnvironment = {
  createCanvas: (w, h) =>
    createCanvas(
      Math.max(1, Math.ceil(w)),
      Math.max(1, Math.ceil(h)),
    ) as unknown as OffscreenCanvas,
  createImageData: (data, w, h) => new NapiImageData(data, w, h) as unknown as ImageData,
};

export async function loadAsset(id: string, path: string): Promise<AssetSource> {
  const img = await loadImage(readFileSync(path));
  return {
    id,
    width: img.width,
    height: img.height,
    images: [{ image: img as unknown as CanvasImageSource, width: img.width, height: img.height }],
  };
}

/** A synthetic "screenshot": UI-ish blocks in known colours, fully deterministic. */
export function syntheticScreenshot(
  width: number,
  height: number,
  accent = "#3b82f6",
): AssetSource {
  const c = createCanvas(width, height);
  const g = c.getContext("2d");
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, width, height);
  g.fillStyle = "#f1f5f9";
  g.fillRect(0, 0, width * 0.22, height);
  g.fillStyle = accent;
  g.fillRect(width * 0.28, height * 0.1, width * 0.3, height * 0.08);
  g.fillStyle = "#e2e8f0";
  for (let i = 0; i < 5; i++)
    g.fillRect(width * 0.28, height * (0.25 + i * 0.12), width * 0.62, height * 0.07);
  g.fillStyle = "#f59e0b";
  g.fillRect(width * 0.75, height * 0.1, width * 0.15, height * 0.08);
  return {
    id: `synthetic-${width}x${height}-${accent}`,
    width,
    height,
    images: [{ image: c as unknown as CanvasImageSource, width, height }],
  };
}

export function pixel(canvas: unknown, x: number, y: number): [number, number, number, number] {
  const c = canvas as Canvas;
  const d = c.getContext("2d").getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
  return [d[0]!, d[1]!, d[2]!, d[3]!];
}

export function toPng(canvas: unknown): Buffer {
  return (canvas as Canvas).toBuffer("image/png");
}

export function pixelsOf(canvas: unknown): Uint8ClampedArray {
  const c = canvas as Canvas;
  return c.getContext("2d").getImageData(0, 0, c.width, c.height)
    .data as unknown as Uint8ClampedArray;
}
