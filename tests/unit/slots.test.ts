/**
 * Multi-screen scene model: normalization, migration, asset ids, style
 * patches and the slot editing API (scene/slots.ts).
 */
import { describe, expect, it } from "vitest";
import {
  LAYOUTS,
  SCENE_VERSION,
  STYLE_PRESETS,
  activeLayout,
  applyStylePatch,
  assetIdForBytes,
  clearSlot,
  collectKeepIds,
  createAnnotation,
  createProjectFile,
  createScene,
  emptySlots,
  extractStylePatch,
  fillEmptySlots,
  fillSlot,
  loadScene,
  normalizeScene,
  parseProject,
  sceneAssetIds,
  serializeProject,
  setLayout,
  setLayoutParam,
  setScreenCount,
  shownScreens,
  swapSlots,
  type Scene,
} from "@/engine";

const img = (assetId: string | null = "a"): Scene =>
  createScene({ content: { kind: "image", assetId } });

describe("single scenes are untouched", () => {
  it("a plain scene normalizes to itself, with no layout fields", () => {
    const s = img();
    const { scene, issues } = normalizeScene(s);
    expect(scene).toEqual(s);
    expect(issues).toEqual([]);
    expect("layout" in scene).toBe(false);
    expect("slots" in scene).toBe(false);
  });

  it("styled scenes gain no layout fields and normalize stably", () => {
    for (const p of STYLE_PRESETS) {
      const once = normalizeScene(applyStylePatch(img(), p.patch, p.id)).scene;
      expect(normalizeScene(once).scene, p.id).toEqual(once);
      expect("layout" in once || "slots" in once, p.id).toBe(false);
    }
  });

  it("the scene version is 3 and v2 scenes migrate without changes", () => {
    expect(SCENE_VERSION).toBe(3);
    const v2 = { ...img(), version: 2 };
    const loaded = loadScene(v2);
    expect(loaded.migratedFrom).toBe(2);
    expect(loaded.scene).toEqual(img());
    expect(loaded.issues).toEqual([]);
  });

  it("newer documents are refused", () => {
    expect(() => loadScene({ ...img(), version: 4 })).toThrow(/newer/);
  });
});

describe("normalizing layouts and slots", () => {
  it("keeps a valid layout and extra screens exactly", () => {
    const s: Scene = {
      ...img(),
      layout: { id: "fan", count: 4, params: { spread: 0.7 } },
      slots: [
        { assetId: "b", crop: { x: 0.1, y: 0, width: 0.5, height: 1 }, sampling: "smooth" },
        { assetId: null },
        { assetId: "c", tall: "full", fade: 0.2 },
      ],
    };
    const { scene, issues } = normalizeScene(s);
    expect(scene).toEqual(s);
    expect(issues).toEqual([]);
    expect(normalizeScene(scene).scene).toEqual(scene);
  });

  it("clamps counts and knobs to the layout and drops knobs it does not have", () => {
    const { scene, issues } = normalizeScene({
      ...img(),
      layout: { id: "side-by-side", count: 9, params: { spacing: 4, spread: 0.5, tilt: -1 } },
    });
    expect(scene.layout).toEqual({ id: "side-by-side", count: 3, params: { spacing: 1, tilt: 0 } });
    expect(issues.some((i) => i.includes("layout.params.spread"))).toBe(true);
    const low = normalizeScene({ ...img(), layout: { id: "grid", count: 1 } }).scene;
    expect(low.layout).toEqual({ id: "grid", count: 4 });
    const dir = normalizeScene({
      ...img(),
      layout: { id: "overlap", count: 2, params: { angle: 400 } },
    }).scene;
    expect(dir.layout?.params?.angle).toBe(180);
  });

  it("drops a single or unknown layout, keeping the screens", () => {
    for (const id of ["single", "mosaic", 7]) {
      const { scene } = normalizeScene({
        ...img(),
        layout: { id, count: 3 },
        slots: [{ assetId: "b" }],
      });
      expect(scene.layout).toBeUndefined();
      expect(scene.slots).toEqual([{ assetId: "b" }]);
    }
  });

  it("drops invalid screens and caps the list", () => {
    const { scene, issues } = normalizeScene({
      ...img(),
      slots: [
        "nope",
        { assetId: "b", crop: { x: -1, y: 0, width: 5, height: 1 } },
        null,
        { assetId: 42 },
        ...Array.from({ length: 8 }, (_, i) => ({ assetId: `x${i}` })),
      ],
    });
    expect(scene.slots).toHaveLength(5);
    expect(scene.slots![0]!.crop).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    expect(scene.slots![1]).toEqual({ assetId: null });
    expect(issues.length).toBeGreaterThan(3);
    expect(normalizeScene({ ...img(), slots: [] }).scene.slots).toBeUndefined();
    expect(normalizeScene({ ...img(), slots: "x" }).scene.slots).toBeUndefined();
  });

  it("keeps content annotations per screen with unique ids, and drops canvas ones", () => {
    const { scene } = normalizeScene({
      ...img(),
      annotations: [createAnnotation("arrow", "n1")],
      slots: [
        {
          assetId: "b",
          annotations: [
            createAnnotation("redact", "n1"),
            { ...createAnnotation("text", "t"), anchor: "canvas" },
          ],
        },
      ],
    });
    expect(scene.slots![0]!.annotations).toHaveLength(1);
    expect(scene.slots![0]!.annotations![0]).toMatchObject({ kind: "redact", id: "n1-2" });
  });
});

describe("asset ids and storage", () => {
  const s: Scene = {
    ...img("a"),
    layout: { id: "grid", count: 4 },
    slots: [{ assetId: "b" }, { assetId: null }, { assetId: "a" }, { assetId: "hidden" }],
  };

  it("include every extra screen, shown or not, once", () => {
    expect(sceneAssetIds(s)).toEqual(["a", "b", "hidden"]);
    const single = { ...s, layout: undefined };
    expect(sceneAssetIds(single)).toEqual(["a", "b", "hidden"]);
  });

  it("keeps extra screens when trimming stored assets", () => {
    const keep = collectKeepIds({ scenes: [s] });
    expect([...keep].sort()).toEqual(["a", "b", "hidden"]);
  });

  it("project files carry the extra screens and round-trip", async () => {
    const png = (seed: number) => {
      const b = new Uint8Array(2048);
      b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      for (let i = 8; i < b.length; i++) b[i] = (i * seed) % 256;
      return b;
    };
    const [b1, b2] = [png(3), png(5)];
    const [id1, id2] = [assetIdForBytes(b1), assetIdForBytes(b2)];
    const scene: Scene = {
      ...img(id1),
      layout: { id: "side-by-side", count: 2, params: { spacing: 0.5 } },
      slots: [{ assetId: id2, crop: { x: 0, y: 0, width: 0.5, height: 1 } }],
    };
    const file = await createProjectFile(
      scene,
      [
        { id: id1, blob: new Blob([b1], { type: "image/png" }), width: 10, height: 10 },
        { id: id2, blob: new Blob([b2], { type: "image/png" }), width: 10, height: 10 },
      ],
      { appVersion: "t", now: new Date(0) },
    );
    expect(Object.keys(file.assets).sort()).toEqual([id1, id2].sort());
    const loaded = await parseProject(serializeProject(file));
    expect(loaded.issues).toEqual([]);
    expect(loaded.scene).toEqual(scene);
  });
});

describe("style patches are the look, not the layout", () => {
  const group: Scene = {
    ...img("a"),
    layout: { id: "cascade", count: 4, params: { step: 0.2 } },
    slots: [{ assetId: "b" }, { assetId: "c" }, { assetId: null }],
  };

  it("applying any preset keeps the layout and screens", () => {
    for (const p of STYLE_PRESETS) {
      const s = applyStylePatch(group, p.patch, p.id);
      expect(s.layout, p.id).toBe(group.layout);
      expect(s.slots, p.id).toBe(group.slots);
    }
  });

  it("saved styles never contain a layout, and applying one keeps the target's", () => {
    const patch = extractStylePatch(group);
    expect(JSON.stringify(patch)).not.toMatch(/cascade|slots|layout/);
    const target: Scene = { ...img("z"), layout: { id: "fan", count: 3 } };
    const s = applyStylePatch(target, patch);
    expect(s.layout).toEqual({ id: "fan", count: 3 });
    expect(s.slots).toBeUndefined();
    expect(applyStylePatch(img("z"), patch).layout).toBeUndefined();
  });
});

describe("activeLayout", () => {
  it("is null for single designs, code, posts and recordings", () => {
    expect(activeLayout(img())).toBeNull();
    const withLayout = setLayout(img(), "fan");
    expect(activeLayout(withLayout)?.id).toBe("fan");
    const code = normalizeScene({ ...withLayout, content: { kind: "code", code: "x" } }).scene;
    expect(activeLayout(code)).toBeNull();
    const video: Scene = {
      ...withLayout,
      content: {
        kind: "image",
        assetId: "v",
        clip: { duration: 5, start: 0, end: 5, audio: false, muted: false },
      },
    };
    expect(activeLayout(video)).toBeNull();
  });

  it("fills in default knobs and clamps the count", () => {
    for (const def of LAYOUTS) {
      if (def.id === "single") continue;
      const a = activeLayout({ ...img(), layout: { id: def.id, count: 99 } })!;
      expect(a.count).toBe(def.maxCount);
      expect(Object.keys(a.params).sort()).toEqual(def.params.map((p) => p.key).sort());
      for (const p of def.params) expect(a.params[p.key]).toBe(p.default);
    }
  });
});

describe("slot editing", () => {
  it("setLayout fills slot 0 from the content and adds empty screens up to the count", () => {
    const s = setLayout(img("a"), "grid");
    expect(s.layout).toEqual({ id: "grid", count: 4 });
    expect(s.content).toEqual(img("a").content);
    expect(s.slots).toEqual([{ assetId: null }, { assetId: null }, { assetId: null }]);
    expect(shownScreens(s)).toBe(4);
    expect(emptySlots(s)).toEqual([1, 2, 3]);
  });

  it("setLayout keeps extra screens, images first, and sizes the count to them", () => {
    const s: Scene = {
      ...img("a"),
      layout: { id: "grid", count: 5 },
      slots: [{ assetId: null }, { assetId: "b" }, { assetId: null }, { assetId: "c" }],
    };
    const sbs = setLayout(s, "side-by-side");
    expect(sbs.layout).toEqual({ id: "side-by-side", count: 3 });
    expect(sbs.slots).toEqual([{ assetId: "b" }, { assetId: "c" }]);
    const overlap = setLayout(sbs, "overlap");
    expect(overlap.layout?.count).toBe(2);
    expect(overlap.slots).toEqual([{ assetId: "b" }, { assetId: "c" }]);
    const fan = setLayout(overlap, "fan");
    expect(fan.layout?.count).toBe(3);
  });

  it("switching back to single keeps the screens; switching again restores them", () => {
    const s = fillEmptySlots(setLayout(img("a"), "hero"), ["b", "c"]);
    const single = setLayout(s, "single");
    expect(single.layout).toBeUndefined();
    expect(single.slots).toEqual([{ assetId: "b" }, { assetId: "c" }]);
    expect(shownScreens(single)).toBe(1);
    const back = setLayout(single, "hero");
    expect(back.slots).toEqual(s.slots);
    expect(back.layout?.count).toBe(3);
    // Nothing to do is a no-op (same object).
    expect(setLayout(back, "hero")).toBe(back);
    expect(setLayout(img(), "single")).toEqual(img());
  });

  it("switching to single drops only trailing empty screens", () => {
    const s = setLayout(img("a"), "grid");
    const single = setLayout(s, "single");
    expect(single.slots).toBeUndefined();
    expect(single).toEqual(img("a"));
  });

  it("does nothing for code, posts and recordings", () => {
    const code = normalizeScene({ ...img(), content: { kind: "code", code: "x" } }).scene;
    expect(setLayout(code, "fan")).toBe(code);
    expect(fillSlot(code, 1, "b")).toBe(code);
  });

  it("setLayoutParam clamps and ignores knobs the layout lacks", () => {
    const s = setLayout(img(), "cascade");
    const a = setLayoutParam(s, "step", 3);
    expect(a.layout?.params).toEqual({ step: 1 });
    const b = setLayoutParam(a, "angle", -500);
    expect(b.layout?.params).toEqual({ step: 1, angle: -180 });
    expect(setLayoutParam(b, "spread", 0.3)).toBe(b);
    expect(setLayoutParam(img(), "gap", 0.3)).toEqual(img());
  });

  it("setScreenCount grows with empty screens and shrinks without losing images", () => {
    const s = fillEmptySlots(setLayout(img("a"), "cascade"), ["b", "c"]);
    const five = setScreenCount(s, 5);
    expect(five.layout?.count).toBe(5);
    expect(five.slots).toHaveLength(4);
    const back = setScreenCount(five, 3);
    expect(back.layout?.count).toBe(3);
    expect(back.slots).toEqual([{ assetId: "b" }, { assetId: "c" }]);
    expect(setScreenCount(back, 9).layout?.count).toBe(5);
    const four = setScreenCount(fillSlot(five, 4, "e"), 3);
    expect(four.slots?.[3]).toEqual({ assetId: "e" });
  });

  it("fillSlot replaces a screen, shows it, and ignores indices past the layout", () => {
    const s = setLayout(img("a"), "cascade");
    const a = fillSlot(s, 2, "c");
    expect(a.slots?.[1]).toEqual({ assetId: "c" });
    const b = fillSlot(a, 4, "e");
    expect(b.layout?.count).toBe(5);
    expect(fillSlot(b, 5, "x")).toBe(b);
    const z = fillSlot(b, 0, "z");
    expect(z.content).toEqual({ kind: "image", assetId: "z" });
    // A replaced extra screen starts fresh.
    const cropped: Scene = {
      ...b,
      slots: [{ assetId: "b", crop: { x: 0, y: 0, width: 0.5, height: 1 }, annotations: [] }],
    };
    expect(fillSlot(cropped, 1, "n").slots?.[0]).toEqual({ assetId: "n" });
  });

  it("fillEmptySlots fills in order and grows up to the layout's maximum", () => {
    const s = setLayout(img(null), "side-by-side");
    const a = fillEmptySlots(s, ["p", "q"]);
    expect(a.content).toEqual({ kind: "image", assetId: "p" });
    expect(a.slots).toEqual([{ assetId: "q" }]);
    const b = fillEmptySlots(a, ["r", "s", "t"]);
    expect(b.layout?.count).toBe(3);
    expect(b.slots).toEqual([{ assetId: "q" }, { assetId: "r" }]);
    expect(fillEmptySlots(b, [])).toBe(b);
  });

  it("swapSlots moves images with their crops and content annotations", () => {
    const arrow = createAnnotation("arrow", "a1");
    const note = { ...createAnnotation("text", "c1"), anchor: "canvas" as const };
    const redact = createAnnotation("redact", "r2");
    const s: Scene = {
      ...img("a"),
      annotations: [arrow, note],
      layout: { id: "fan", count: 3 },
      slots: [
        { assetId: "b", annotations: [redact], crop: { x: 0, y: 0, width: 1, height: 0.5 } },
        { assetId: "c" },
      ],
    };
    const t = swapSlots(s, 0, 1);
    expect(t.content).toEqual({
      kind: "image",
      assetId: "b",
      crop: { x: 0, y: 0, width: 1, height: 0.5 },
    });
    expect(t.annotations).toEqual([redact, note]);
    expect(t.slots?.[0]).toEqual({ assetId: "a", annotations: [arrow] });
    expect(swapSlots(t, 1, 0)).toEqual({ ...s, annotations: [arrow, note] });
    const u = swapSlots(s, 1, 2);
    expect(u.slots).toEqual([{ assetId: "c" }, s.slots![0]]);
    expect(swapSlots(s, 0, 7)).toBe(s);
    expect(swapSlots(s, 1, 1)).toBe(s);
  });

  it("clearSlot empties a screen and its annotations but keeps the layout's shape", () => {
    const s: Scene = {
      ...img("a"),
      annotations: [
        createAnnotation("rect", "r"),
        { ...createAnnotation("text", "t"), anchor: "canvas" },
      ],
      layout: { id: "overlap", count: 2 },
      slots: [{ assetId: "b", annotations: [createAnnotation("redact", "x")] }],
    };
    const a = clearSlot(s, 1);
    expect(a.slots).toEqual([{ assetId: null }]);
    const b = clearSlot(a, 0);
    expect(b.content).toEqual({ kind: "image", assetId: null });
    expect(b.annotations.map((n) => n.id)).toEqual(["t"]);
    expect(emptySlots(b)).toEqual([0, 1]);
    expect(clearSlot(s, 5)).toBe(s);
  });

  it("round-trips every helper's output through normalization", () => {
    let s = setLayout(img("a"), "grid");
    s = fillEmptySlots(s, ["b", "c", "d", "e"]);
    s = setLayoutParam(s, "gap", 0.6);
    s = swapSlots(s, 0, 3);
    s = clearSlot(s, 2);
    expect(normalizeScene(s).scene).toEqual(s);
    expect(normalizeScene(s).issues).toEqual([]);
  });
});
