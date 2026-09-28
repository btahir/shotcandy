/**
 * The design canvas frame (a design tool's selection: name above, outline
 * and corner handles, pixel size below) and the Minimal style family.
 */
import { describe, expect, it } from "vitest";
import {
  MapAssetResolver,
  RenderCache,
  STYLE_PRESETS,
  applyStylePatch,
  computeCardGeometry,
  computeLayout,
  createScene,
  getStylePreset,
  normalizeScene,
  renderToCanvas,
  setIn,
  type AssetResolver,
  type Scene,
} from "@/engine";
import { CANVAS_FRAME } from "@/engine/frames/specs";
import { nodeEnv, pixelsOf, syntheticScreenshot } from "../helpers/node-canvas";

const shot = syntheticScreenshot(800, 500);
const assets: AssetResolver = new MapAssetResolver([shot]);

function canvasScene(patch: (s: Scene) => Scene = (s) => s): Scene {
  let s = createScene({ content: { kind: "image", assetId: shot.id } });
  s = setIn(s, ["canvas"], { size: { kind: "fixed", width: 1200, height: 900 }, padding: 120 });
  s = setIn(s, ["background", "fill"], { kind: "solid", color: "#E5E5E5" });
  s = setIn(s, ["card", "shadow", "preset"], "none");
  s = setIn(s, ["card", "radius"], 0);
  s = setIn(s, ["card", "frame", "id"], "canvas");
  return patch(s);
}

const render = (s: Scene) =>
  renderToCanvas(s, assets, { env: nodeEnv, cache: new RenderCache(), scale: 1 });

/** Pixels close to the frame's accent blue, in a canvas-px rectangle. */
function bluePixels(s: Scene, rect: { x: number; y: number; width: number; height: number }) {
  const { canvas } = render(s);
  const data = pixelsOf(canvas as never);
  const W = (canvas as unknown as { width: number }).width;
  let n = 0;
  for (let y = Math.max(0, Math.floor(rect.y)); y < rect.y + rect.height; y++)
    for (let x = Math.max(0, Math.floor(rect.x)); x < rect.x + rect.width; x++) {
      const i = (y * W + x) * 4;
      if (data[i]! < 60 && data[i + 1]! > 120 && data[i + 1]! < 190 && data[i + 2]! > 220) n++;
    }
  return n;
}

describe("design canvas frame", () => {
  it("adds a name band above and a size band below; shadows hug the shot", () => {
    const g = computeCardGeometry(canvasScene(), { width: 1440, height: 900 });
    const top = CANVAS_FRAME.labelSize * 1.25 + CANVAS_FRAME.labelGap;
    const bottom = CANVAS_FRAME.tag.gap + CANVAS_FRAME.tag.size + 2 * CANVAS_FRAME.tag.padY;
    const side = CANVAS_FRAME.handle / 2 + CANVAS_FRAME.handleStroke;
    expect(g.content.y).toBeCloseTo(top, 9);
    expect(g.content.x).toBeCloseTo(side, 9);
    expect(g.size.height).toBeCloseTo(top + 625 + bottom, 9);
    expect(g.outline).toHaveLength(1);
    expect(g.outline[0]!.rect).toEqual(g.content);
  });

  it("draws the selection outline, handles and a size tag in the accent blue", () => {
    const s = canvasScene();
    const L = computeLayout(s, shot);
    const c = L.card.content;
    const k = L.k;
    const o = { x: L.cardQuad[0].x, y: L.cardQuad[0].y };
    // Along the top edge of the shot.
    expect(
      bluePixels(s, { x: o.x + c.x * k + 20, y: o.y + c.y * k - 2, width: 100, height: 4 }),
    ).toBeGreaterThan(50);
    // The size tag under the shot, centred.
    const tagY = o.y + (c.y + c.height + CANVAS_FRAME.tag.gap) * k;
    const tag = { x: o.x + (c.x + c.width / 2) * k - 20, y: tagY + 2, width: 40, height: 10 };
    expect(bluePixels(s, tag)).toBeGreaterThan(40);
    // Hiding the size tag removes it.
    const off = setIn(s, ["card", "frame", "sizeTag"], false);
    expect(bluePixels(off, tag)).toBe(0);
  });

  it("keeps the size switch through normalization", () => {
    const s = setIn(canvasScene(), ["card", "frame", "sizeTag"], false);
    const { scene, issues } = normalizeScene(JSON.parse(JSON.stringify(s)));
    expect(issues).toEqual([]);
    expect(scene.card.frame.sizeTag).toBe(false);
  });
});

describe("Minimal styles", () => {
  const minimal = STYLE_PRESETS.filter((p) => p.family === "minimal");

  it("are six flat, untilted styles", () => {
    expect(minimal.map((p) => p.id)).toEqual([
      "plain-white",
      "soft-grey",
      "outline",
      "quiet-float",
      "graphite",
      "design-canvas",
    ]);
    for (const p of minimal) {
      const t = p.patch.card!.tilt!;
      expect([t.rotateX, t.rotateY, t.rotateZ], p.id).toEqual([0, 0, 0]);
    }
  });

  it("render, and Design Canvas uses the canvas frame", () => {
    for (const p of minimal) {
      const s = applyStylePatch(
        canvasScene((x) => setIn(x, ["card", "frame", "id"], "none")),
        p.patch,
        p.id,
      );
      expect(() => render(s), p.id).not.toThrow();
    }
    const dc = getStylePreset("design-canvas")!;
    expect(dc.patch.card!.frame!.id).toBe("canvas");
  });
});
