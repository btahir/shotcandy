/**
 * Regression tests from the multi-image quality pass.
 */
import { describe, expect, it } from "vitest";
import {
  MapAssetResolver,
  computeLayout,
  createScene,
  exportScaleCap,
  fillSlot,
  layoutScene,
  maxExportScale,
  normalizeScene,
  setIn,
  setLayout,
  swapSlots,
  type Scene,
} from "@/engine";
import { DESKTOP_LIMITS, SAFARI_LIMITS } from "@/engine/export/formats";
import { type Batch, addItems, combineItems, itemScreen, selectItems } from "@/engine/batch/batch";
import { exportTag, getDestination, planExport } from "@/components/editor/export-plan";
import { createEditorStore } from "@/state/editor-store";
import { shownContent } from "@/components/editor/geometry";

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

describe("range selection", () => {
  const items = ["a", "b", "c", "d", "e", "f"].map((n) => ({
    name: `${n}.png`,
    content: { kind: "image" as const, assetId: n },
    id: n,
  }));
  const batch = () =>
    addItems(createScene({ content: { kind: "image", assetId: null } }), items) as Batch;

  it("starts from the image on stage when the anchor is gone (removed or undone)", () => {
    let b = selectItems(batch(), "d");
    b = selectItems(b, "e", "range", "gone");
    expect(b.selected).toEqual(["d", "e"]);
  });
});

describe("undo steps", () => {
  it("an import stays one step when the selection changes while it runs", () => {
    const store = createEditorStore<number>(0, {
      lens: { scene: () => createScene(), update: (d) => d },
    });
    const add = { coalesce: "import", coalesceMs: Infinity, label: "Add images" };
    store.updateDoc((d) => d + 1, add);
    store.updateDoc((d) => d + 100, { transient: true }); // picking another image
    store.updateDoc((d) => d + 1, add);
    expect(store.getState().doc).toBe(102);
    store.undo();
    expect(store.getState().doc).toBe(0);
  });

  it("a selection change still ends a slider drag", () => {
    const store = createEditorStore<number>(0, {
      lens: { scene: () => createScene(), update: (d) => d },
    });
    store.updateDoc((d) => d + 1, { coalesce: "slider" });
    store.updateDoc((d) => d + 100, { transient: true });
    store.updateDoc((d) => d + 1, { coalesce: "slider" });
    store.undo();
    expect(store.getState().doc).toBe(101);
  });
});

describe("screen names", () => {
  it("extra screens keep their file names through normalizing, swaps and combine", () => {
    let s: Scene = createScene({ content: { kind: "image", assetId: "a" } });
    s = setLayout(s, "cascade");
    s = fillSlot(s, 1, "b", "login.png");
    s = fillSlot(s, 2, "c");
    expect(s.slots).toEqual([{ assetId: "b", name: "login.png" }, { assetId: "c" }]);
    expect(normalizeScene(s).scene.slots).toEqual(s.slots);
    // Junk names are dropped; long ones are cut.
    const raw = {
      ...s,
      slots: [
        { assetId: "b", name: 7 },
        { assetId: "c", name: "x".repeat(300) },
      ],
    };
    const n = normalizeScene(raw).scene.slots!;
    expect(n[0]).toEqual({ assetId: "b" });
    expect(n[1]!.name).toHaveLength(255);
    // Swapping extra screens moves the names along.
    expect(swapSlots(s, 1, 2).slots).toEqual([
      { assetId: "c" },
      { assetId: "b", name: "login.png" },
    ]);
    // Screen 0 has no name field: it is named by its design.
    expect(swapSlots(s, 0, 1).content).toEqual({ kind: "image", assetId: "b" });
  });

  it("images placed from the batch or combined carry their names", () => {
    const b = addItems(createScene({ content: { kind: "image", assetId: null } }), [
      { name: "home.png", content: { kind: "image", assetId: "h" }, id: "h" },
      { name: "login.png", content: { kind: "image", assetId: "l" }, id: "l" },
    ]) as Batch;
    expect(itemScreen(b.items[1]!).name).toBe("login.png");
    const c = combineItems(b, ["h", "l"], "c");
    const combined = c.items.find((x) => x.id === "c")!;
    expect(combined.slots).toEqual([{ assetId: "l", name: "login.png" }]);
  });
});

describe("marks in grid cells", () => {
  it("new marks start on the part of the image a grid cell shows", () => {
    const res = new MapAssetResolver([
      src("ph", 1170, 2532),
      src("d1", 2880, 1800),
      src("d2", 2880, 1800),
      src("d3", 2880, 1800),
    ]);
    const single = createScene({ content: { kind: "image", assetId: "ph" } });
    expect(shownContent({ layout: layoutScene(single, res), zoom: 1 })).toEqual({
      u0: 0,
      u1: 1,
      v0: 0,
      v1: 1,
    });
    const grid: Scene = {
      ...single,
      layout: { id: "grid", count: 4 },
      slots: [{ assetId: "d1" }, { assetId: "d2" }, { assetId: "d3" }],
    };
    const b = shownContent({ layout: layoutScene(grid, res), zoom: 1 });
    expect(b.v0).toBeCloseTo(0);
    expect(b.v1).toBeLessThan(0.5);
    expect(b.u0).toBeCloseTo(0);
    expect(b.u1).toBeCloseTo(1);
  });
});
