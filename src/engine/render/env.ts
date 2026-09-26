/**
 * Rendering environment abstraction.
 *
 * The engine never touches `document` directly. Anything that needs a scratch
 * canvas asks the injected RenderEnvironment, so the same code runs on the main
 * thread (HTMLCanvasElement), in a Web Worker (OffscreenCanvas) and in Node
 * tests (@napi-rs/canvas, cast to these types).
 */

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export type CanvasLike = HTMLCanvasElement | OffscreenCanvas;
/** Anything drawImage accepts. */
export type ImageLike = CanvasImageSource;

export interface RenderEnvironment {
  createCanvas(width: number, height: number): CanvasLike;
  /** Optional ImageData constructor (Node canvas libs provide their own). */
  createImageData?(data: Uint8ClampedArray, width: number, height: number): ImageData;
}

export function get2d(canvas: CanvasLike, opts?: CanvasRenderingContext2DSettings): Ctx2D {
  const ctx = canvas.getContext("2d", opts) as Ctx2D | null;
  if (!ctx) throw new Error("2D canvas context unavailable");
  return ctx;
}

/** Default environment: OffscreenCanvas when available (workers too), else a DOM canvas. */
export function defaultEnvironment(): RenderEnvironment {
  return {
    createCanvas(width, height) {
      const w = Math.max(1, Math.ceil(width));
      const h = Math.max(1, Math.ceil(height));
      if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
      if (typeof document !== "undefined") {
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        return c;
      }
      throw new Error("No canvas implementation available; pass a RenderEnvironment");
    },
  };
}

export function makeImageData(
  env: RenderEnvironment,
  data: Uint8ClampedArray,
  width: number,
  height: number,
): ImageData {
  if (env.createImageData) return env.createImageData(data, width, height);
  return new ImageData(data as Uint8ClampedArray<ArrayBuffer>, width, height);
}

/** Intrinsic pixel size of any drawable image source. */
export function imageSize(img: ImageLike): { width: number; height: number } {
  const anyImg = img as unknown as {
    naturalWidth?: number;
    naturalHeight?: number;
    videoWidth?: number;
    videoHeight?: number;
    width: number | { baseVal: { value: number } };
    height: number | { baseVal: { value: number } };
  };
  if (anyImg.naturalWidth) return { width: anyImg.naturalWidth, height: anyImg.naturalHeight! };
  if (anyImg.videoWidth) return { width: anyImg.videoWidth, height: anyImg.videoHeight! };
  const w = typeof anyImg.width === "number" ? anyImg.width : anyImg.width.baseVal.value;
  const h = typeof anyImg.height === "number" ? anyImg.height : anyImg.height.baseVal.value;
  return { width: w, height: h };
}
