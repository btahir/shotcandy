import { describe, expect, it } from "vitest";
import {
  COPY_MAX_LONG,
  autoScale,
  exportTag,
  fitVerdict,
  getDestination,
  nextAttempt,
  planExport,
  ratioOk,
} from "@/components/editor/export-plan";
import {
  MapAssetResolver,
  applyStylePatch,
  createScene,
  fromGradientEdit,
  getStylePreset,
  layoutScene,
  toGradientEdit,
} from "@/engine";
import { orientationOf, shuffleComposition, suitedStyles } from "@/components/editor/shuffle";
import { createEditorStore } from "@/state/editor-store";
import { syntheticScreenshot } from "../helpers/node-canvas";

const native = { width: 3398, height: 2376, drawRatio: 1, fixed: false, maxScale: 4 };
const base = { scale: 0 as const, format: "png" as const, quality: 0.92 };

describe("smart export scale", () => {
  it("is 1x when the screenshot is already drawn at native pixels", () => {
    expect(autoScale(native)).toBe(1);
    const p = planExport(native, base);
    expect([p.width, p.height, p.scale]).toEqual([3398, 2376, 1]);
    expect(exportTag(p, getDestination("original"), 0)).toBe("PNG · Auto 1×");
  });

  it("is 1x for exact (fixed) sizes, 2x for text content, 2x when drawn below native", () => {
    expect(autoScale({ ...native, fixed: true, drawRatio: 0.3 })).toBe(1);
    expect(autoScale({ ...native, drawRatio: null })).toBe(2);
    expect(autoScale({ ...native, drawRatio: 0.6 })).toBe(2);
    expect(autoScale({ ...native, drawRatio: 0.6, maxScale: 1 })).toBe(1);
  });

  it("uses the chosen scale when it isn't Auto", () => {
    expect(planExport(native, { ...base, scale: 2 }).width).toBe(6796);
    expect(planExport(native, { ...base, scale: 4 }).scale).toBe(4);
  });

  it("caps Copy at 4096 px on the long side", () => {
    const p = planExport(native, { ...base, scale: 2, maxLong: COPY_MAX_LONG });
    expect(Math.max(p.width, p.height)).toBe(4096);
    expect(p.capped).toBe(true);
    expect(planExport(native, { ...base, maxLong: COPY_MAX_LONG }).capped).toBe(false);
  });
});

describe("export destinations", () => {
  it("X: retina size up to 4096 px, PNG first, and knows the 5 MB limit", () => {
    const p = planExport(native, { ...base, destination: "x" });
    expect(Math.max(p.width, p.height)).toBe(4096);
    expect(p.format).toBe("png");
    const small = planExport(
      { ...native, width: 1200, height: 630, fixed: true },
      { ...base, destination: "x" },
    );
    expect(small.width).toBe(2400);
    const x = getDestination("x");
    expect(fitVerdict(x, 2e6, "png")).toEqual({ kind: "fits", label: "fits X’s 5 MB" });
    expect(fitVerdict(x, 9e6, "png").kind).toBe("switch");
    expect(fitVerdict(getDestination("instagram"), 9e6, "jpeg").kind).toBe("none");
  });

  it("Instagram: JPEG exactly 1080 wide; warns about shapes it crops", () => {
    const p = planExport(native, { ...base, destination: "instagram" });
    expect(p.width).toBe(1080);
    expect(p.format).toBe("jpeg");
    const ig = getDestination("instagram");
    expect(ratioOk(ig, 1080, 1350)).toBe(true);
    expect(ratioOk(ig, 1080, 1920)).toBe(false);
    expect(ratioOk(getDestination("producthunt"), 1270, 760)).toBe(true);
  });

  it("tags the export button with the destination", () => {
    const p = planExport(native, { ...base, destination: "readme" });
    expect(Math.max(p.width, p.height)).toBe(2000);
    expect(exportTag(p, getDestination("readme"), 0)).toBe("README · PNG");
  });

  it("retries over-limit files: JPEG, then quality, then pixels", () => {
    let a = nextAttempt({ format: "png", quality: 0.92, scale: 2 }, 8e6, 5e6, true);
    expect(a).toEqual({ format: "jpeg", quality: 0.9, scale: 2 });
    a = nextAttempt(a, 6e6, 5e6, true);
    expect(a.quality).toBe(0.82);
    a = nextAttempt({ format: "png", quality: 0.92, scale: 2 }, 8e6, 5e6, false);
    expect(a.format).toBe("png");
    expect(a.scale).toBeLessThan(2);
  });
});

describe("Candy Shuffle", () => {
  const shot = syntheticScreenshot(1600, 1000);
  const scene = applyStylePatch(
    createScene({ content: { kind: "image", assetId: shot.id } }),
    getStylePreset("sherbet")!.patch,
    "sherbet",
  );
  const ctx = {
    size: { width: 1600, height: 1000 },
    palette: null,
    isImage: true,
    current: "sherbet",
  };

  it("is deterministic for a seed and changes the composition", () => {
    const a = shuffleComposition(scene, { ...ctx, seed: 7 });
    const b = shuffleComposition(scene, { ...ctx, seed: 7 });
    expect(a.scene).toEqual(b.scene);
    expect(a.styleId).not.toBe("sherbet");
    expect(a.summary.length).toBeGreaterThan(3);
    const ids = new Set(
      Array.from(
        { length: 30 },
        (_, i) => shuffleComposition(scene, { ...ctx, seed: i + 1 }).styleId,
      ),
    );
    expect(ids.size).toBeGreaterThan(8);
  });

  it("never gives a landscape shot a phone, and lays out valid scenes", () => {
    for (let seed = 1; seed < 60; seed++) {
      const r = shuffleComposition(scene, { ...ctx, seed });
      expect(["phone", "tablet"]).not.toContain(r.scene.card.frame.id);
      expect(() => layoutScene(r.scene, new MapAssetResolver([shot]))).not.toThrow();
    }
    expect(orientationOf({ width: 800, height: 1700 })).toBe("portrait");
    expect(suitedStyles("portrait").some((s) => s.id === "phone-sorbet")).toBe(true);
    expect(suitedStyles("landscape").some((s) => s.id === "phone-sorbet")).toBe(false);
  });
});

describe("editor history across designs", () => {
  it("restores undo/redo stacks with a scene", () => {
    const store = createEditorStore(createScene());
    store.update((s) => ({ ...s, canvas: { ...s.canvas, padding: 10 } }));
    store.update((s) => ({ ...s, canvas: { ...s.canvas, padding: 20 } }));
    const kept = { scene: store.getState().scene, history: store.history() };
    store.reset(createScene());
    expect(store.getState().canUndo).toBe(false);
    store.reset(kept.scene, kept.history);
    expect(store.getState().canUndo).toBe(true);
    store.undo();
    expect(store.getState().scene.canvas.padding).toBe(10);
  });
});

describe("conic gradients round-trip without growing", () => {
  it("keeps the stop count through edit -> fill -> edit", () => {
    const e = {
      type: "conic" as const,
      angle: 30,
      stops: [
        { offset: 0, color: "#ff0000" },
        { offset: 1, color: "#0000ff" },
      ],
    };
    let edit = toGradientEdit(fromGradientEdit(e));
    for (let i = 0; i < 4; i++) edit = toGradientEdit(fromGradientEdit(edit));
    expect(edit.stops.length).toBe(2);
    expect(edit.stops[1]!.offset).toBeCloseTo(1, 2);
  });
});
