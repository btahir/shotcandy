/**
 * Regression renders from the multi-image quality pass.
 */
import { createCanvas } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import {
  MapAssetResolver,
  RenderCache,
  contentToCanvas,
  createAnnotation,
  createScene,
  layoutGroupScene,
  layoutScene,
  renderToCanvas,
  setIn,
  type AssetSource,
  type Point,
  type RedactAnnotation,
  type Scene,
} from "@/engine";
import { applyMat3 } from "@/engine/math/matrix";
import { nodeEnv, pixel } from "../helpers/node-canvas";

/** A phone-shaped image, plain grey, with a black and white checkerboard band ("a secret"). */
function secret(id: string): AssetSource {
  const W = 400;
  const H = 800;
  const c = createCanvas(W, H);
  const g = c.getContext("2d");
  g.fillStyle = "#808080";
  g.fillRect(0, 0, W, H);
  for (let y = 40; y < 120; y += 2)
    for (let x = 0; x < W; x += 2) {
      g.fillStyle = (x + y) % 4 === 0 ? "#000000" : "#ffffff";
      g.fillRect(x, y, 2, 2);
    }
  return {
    id,
    width: W,
    height: H,
    images: [{ image: c as unknown as CanvasImageSource, width: W, height: H }],
  };
}

function plain(id: string, width: number, height: number): AssetSource {
  const c = createCanvas(width, height);
  const g = c.getContext("2d");
  g.fillStyle = "#3355aa";
  g.fillRect(0, 0, width, height);
  return {
    id,
    width,
    height,
    images: [{ image: c as unknown as CanvasImageSource, width, height }],
  };
}

const assets = new MapAssetResolver([
  secret("s"),
  plain("d1", 800, 500),
  plain("d2", 800, 500),
  plain("d3", 800, 500),
]);

/** Spread of luminance in a small square around a point (0 = flat). */
function spread(canvas: unknown, at: Point, r = 3): number {
  const ls: number[] = [];
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      const [R, G, B] = pixel(canvas, Math.round(at.x) + dx, Math.round(at.y) + dy);
      ls.push(0.3 * R + 0.59 * G + 0.11 * B);
    }
  return Math.max(...ls) - Math.min(...ls);
}

describe("marks on a grid cell stay on the image they were placed on", () => {
  // The band covers image rows 40..120 of 800: y 0.05..0.15.
  const redact: RedactAnnotation = {
    ...(createAnnotation("redact", "r1") as RedactAnnotation),
    x: 0,
    y: 0.04,
    w: 1,
    h: 0.12,
    mode: "pixelate",
    strength: 30,
  };
  let base: Scene = createScene({ content: { kind: "image", assetId: "s" } });
  base = setIn(base, ["card", "shadow", "preset"], "none");
  base = { ...base, annotations: [redact] };
  const grid: Scene = {
    ...base,
    layout: { id: "grid", count: 4 },
    slots: [{ assetId: "d1" }, { assetId: "d2" }, { assetId: "d3" }],
  };

  it("the grid cell shows only the top of the phone shot (a cover crop)", () => {
    const g = layoutGroupScene(grid, assets)!;
    const crop = g.slots[0]!.content.crop!;
    expect(crop.height).toBeLessThan(0.5);
    expect(crop.y).toBe(0);
  });

  it("a redaction hides the same pixels as on the single design", () => {
    for (const scene of [base, grid]) {
      const out = renderToCanvas(scene, assets, { env: nodeEnv, cache: new RenderCache() });
      const layout = layoutScene(scene, assets);
      // Where image row 80 (the middle of the band) is drawn.
      const g = layoutGroupScene(scene, assets);
      const crop = g?.slots[0]!.content.crop ?? { x: 0, y: 0, width: 1, height: 1 };
      const c = layout.card.content;
      const p = applyMat3(layout.cardToCanvas, {
        x: c.x + ((0.5 - crop.x) / crop.width) * c.width,
        y: c.y + ((0.1 - crop.y) / crop.height) * c.height,
      });
      expect(spread(out.canvas, p), scene.layout?.id ?? "single").toBeLessThan(40);
      // The editor places the mark where it is drawn.
      const q = contentToCanvas(layout, 0.5, 0.1);
      expect(Math.abs(q.x - p.x) + Math.abs(q.y - p.y)).toBeLessThan(1);
    }
  });

  it("without the redaction the band shows (the check above is meaningful)", () => {
    const bare = { ...grid, annotations: [] };
    const out = renderToCanvas(bare, assets, { env: nodeEnv, cache: new RenderCache() });
    const layout = layoutScene(bare, assets);
    const crop = layoutGroupScene(bare, assets)!.slots[0]!.content.crop!;
    const c = layout.card.content;
    const p = applyMat3(layout.cardToCanvas, {
      x: c.x + ((0.5 - crop.x) / crop.width) * c.width,
      y: c.y + ((0.1 - crop.y) / crop.height) * c.height,
    });
    expect(spread(out.canvas, p, 6)).toBeGreaterThan(80);
  });
});
