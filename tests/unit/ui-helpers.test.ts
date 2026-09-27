import { describe, expect, it } from "vitest";
import { createAnnotation, createScene, layoutScene, MapAssetResolver } from "@/engine";
import { arrowPoints, curveFromMid, fromScreen, toScreen } from "@/components/editor/geometry";
import { fillToCss } from "@/lib/fill-css";
import { thumbScale } from "@/lib/thumbs/service";
import { syntheticScreenshot } from "../helpers/node-canvas";

describe("thumbnail scale", () => {
  it("never exceeds 1/8 for large canvases and never upsamples", () => {
    expect(thumbScale(3600, 192)).toBeLessThanOrEqual(1 / 8);
    expect(thumbScale(3600, 520)).toBe(1 / 8);
    expect(thumbScale(600, 520)).toBeLessThanOrEqual(1);
    expect(thumbScale(300, 520)).toBe(1);
  });
});

describe("annotation geometry", () => {
  const shot = syntheticScreenshot(1600, 1000);
  const assets = new MapAssetResolver([shot]);
  const scene = createScene({ content: { kind: "image", assetId: shot.id } });
  const geo = { layout: layoutScene(scene, assets), zoom: 0.5 };

  it("round-trips content and canvas anchors through screen space", () => {
    for (const anchor of ["content", "canvas"] as const) {
      const p = toScreen(geo, anchor, 0.25, 0.75);
      const back = fromScreen(geo, anchor, p.x, p.y)!;
      expect(back.x).toBeCloseTo(0.25, 6);
      expect(back.y).toBeCloseTo(0.75, 6);
    }
  });

  it("recovers the arrow curve from its dragged midpoint", () => {
    for (const curve of [-0.8, -0.2, 0, 0.35, 1]) {
      const a = { ...createAnnotation("arrow", "a"), curve };
      const ap = arrowPoints(geo, a);
      expect(curveFromMid(ap.p1, ap.p2, ap.mid)).toBeCloseTo(curve, 6);
    }
  });
});

describe("fill swatches", () => {
  it("renders CSS for every fill kind", () => {
    expect(fillToCss({ kind: "solid", color: "#ff0000" })).toBe("#ff0000");
    expect(
      fillToCss({
        kind: "linear",
        angle: 90,
        stops: [
          { offset: 0, color: "#000000" },
          { offset: 1, color: "#ffffff" },
        ],
      }),
    ).toBe("linear-gradient(90deg, #000000 0%, #ffffff 100%)");
    expect(fillToCss({ kind: "none" })).toBe("transparent");
    expect(fillToCss({ kind: "auto", style: "mesh", variant: 0 })).toContain("radial-gradient");
    expect(
      fillToCss({
        kind: "image",
        assetId: "builtin:peach-dunes",
        fit: "cover",
        blur: 0,
        tint: 0,
        focusX: 0.5,
        focusY: 0.5,
      }),
    ).toContain("/backgrounds/thumbs/peach-dunes.webp");
  });
});
