/**
 * Regression tests from the multi-image quality pass.
 */
import { describe, expect, it } from "vitest";
import {
  MapAssetResolver,
  computeLayout,
  createScene,
  exportScaleCap,
  layoutScene,
  maxExportScale,
  setIn,
  type Scene,
} from "@/engine";
import { DESKTOP_LIMITS, SAFARI_LIMITS } from "@/engine/export/formats";
import { exportTag, getDestination, planExport } from "@/components/editor/export-plan";

const src = (id: string, width: number, height: number) => ({ id, width, height, images: [] });
const assets = new MapAssetResolver([
  src("p1", 1170, 2532),
  src("p2", 1170, 2532),
  src("p3", 1170, 2532),
  src("p4", 1170, 2532),
  src("p5", 1170, 2532),
  src("p6", 1170, 2532),
]);

describe("export size limits", () => {
  const fixed = (w: number, h: number) =>
    computeLayout(
      setIn(createScene({ content: { kind: "image", assetId: "a" } }), ["canvas", "size"], {
        kind: "fixed",
        width: w,
        height: h,
      }),
      { width: w, height: h },
    );

  it("keeps whole scales when 1x fits", () => {
    expect(exportScaleCap(fixed(3840, 2160), DESKTOP_LIMITS)).toBe(4);
    expect(exportScaleCap(fixed(3840, 2160), SAFARI_LIMITS)).toBe(1);
  });

  it("shrinks below 1x instead of failing when even 1x is too big (iOS canvas area)", () => {
    const l = fixed(5120, 4000);
    expect(maxExportScale(l, SAFARI_LIMITS)).toBe(0);
    const cap = exportScaleCap(l, SAFARI_LIMITS);
    expect(cap).toBeLessThan(1);
    expect(cap).toBeGreaterThan(0.85);
    const input = { width: 5120, height: 4000, drawRatio: 1, fixed: true, maxScale: cap };
    for (const scale of [0, 1, 2, 4] as const) {
      const p = planExport(input, { scale, format: "png", quality: 0.92 });
      expect(p.width * p.height, `scale ${scale}`).toBeLessThanOrEqual(SAFARI_LIMITS.maxArea);
      expect(p.width).toBeGreaterThan(4400);
    }
    const auto = planExport(input, { scale: 0, format: "png", quality: 0.92 });
    expect(exportTag(auto, getDestination("original"), 0)).toBe(
      `PNG · ${auto.width} × ${auto.height}`,
    );
    // Copy (long side 4096) was already small enough.
    const copy = planExport(input, { scale: 2, format: "png", quality: 0.92, maxLong: 4096 });
    expect(Math.max(copy.width, copy.height)).toBe(4096);
  });

  it("a six-phone grid at its auto size fits Safari after the cap", () => {
    let s: Scene = createScene({ content: { kind: "image", assetId: "p1" } });
    s = { ...s, layout: { id: "grid", count: 6 } };
    s.slots = ["p2", "p3", "p4", "p5", "p6"].map((assetId) => ({ assetId }));
    const l = layoutScene(s, assets);
    const cap = exportScaleCap(l, SAFARI_LIMITS);
    const p = planExport(
      { width: l.canvas.width, height: l.canvas.height, drawRatio: 1, fixed: false, maxScale: cap },
      { scale: 2, format: "png", quality: 0.92 },
    );
    expect(p.width * p.height).toBeLessThanOrEqual(SAFARI_LIMITS.maxArea);
    expect(Math.max(p.width, p.height)).toBeLessThanOrEqual(SAFARI_LIMITS.maxSide);
  });
});
