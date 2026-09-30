/**
 * Multi-screen designs inside a batch: a design's layout and its other
 * screens belong to that image, never to the shared style.
 */
import { describe, expect, it } from "vitest";
import {
  type Annotation,
  type Scene,
  applyStylePatch,
  clearSlot,
  collectKeepIds,
  createAnnotation,
  createMemoryStore,
  createProjectFile,
  createScene,
  fillSlot,
  getStylePreset,
  parseProject,
  placeScreen,
  serializeProject,
  setIn,
  setLayout,
  setLayoutParam,
  setScreenCount,
  swapSlots,
} from "@/engine";
import {
  type Batch,
  type EditScope,
  addItems,
  batchAssetIds,
  batchFromScene,
  batchLens,
  combineItems,
  docScene,
  duplicateItems,
  isBatch,
  itemAssetIds,
  itemScene,
  normalizeBatch,
  removeItems,
  resetOverrides,
  toSingle,
  useStyleForAll,
} from "@/engine/batch/batch";
import { diffStyle, applyStyle } from "@/engine/batch/style";
import { assetIdForBytes } from "@/engine/input/import";
import { createEditorStore } from "@/state/editor-store";

const img = (id: string) => ({ kind: "image" as const, assetId: id });
const styled = (id = "sherbet") => applyStylePatch(createScene(), getStylePreset(id)!.patch, id);

/** a, b, c… on the sherbet style; image a is on stage. */
function batchOf(n: number): Batch {
  const first = { ...styled(), content: img("img_a") };
  const add = Array.from({ length: n - 1 }, (_, i) => {
    const k = String.fromCharCode(98 + i);
    return { name: `${k}.png`, content: img(`img_${k}`), id: k };
  });
  return addItems(first, add, { currentName: "a.png" }) as Batch;
}

const edit = (b: Batch, scope: EditScope, fn: (s: Scene) => Scene) => {
  const prev = docScene(b);
  return batchLens(() => scope).update(b, fn(prev), prev) as Batch;
};
const pad = (v: number) => (s: Scene) => setIn(s, ["canvas", "padding"], v);

/** Image a on stage as a side-by-side design with screens a, x. */
function withPair(scope: EditScope = "all"): Batch {
  let b = batchOf(3);
  b = edit(b, scope, (s) => setLayout(s, "side-by-side"));
  return edit(b, scope, (s) => fillSlot(s, 1, "img_x"));
}

describe("layout and screens are per image", () => {
  it("go to the image on stage in every scope, never to the shared style", () => {
    for (const scope of ["all", "item", "selected"] as const) {
      const b = withPair(scope);
      const [a, bb, c] = b.items;
      expect(a!.layout).toEqual({ id: "side-by-side", count: 2 });
      expect(a!.slots).toEqual([{ assetId: "img_x" }]);
      expect(a!.overrides).toBeUndefined();
      expect(bb!.layout).toBeUndefined();
      expect(c!.slots).toBeUndefined();
      expect(b.shared.layout).toBeUndefined();
      expect(b.shared.slots).toBeUndefined();
      expect(itemScene(b, a!).layout?.id).toBe("side-by-side");
      expect(itemScene(b, bb!).layout).toBeUndefined();
    }
  });

  it("knobs, counts, swaps and clears stay on that image", () => {
    let b = withPair();
    b = edit(b, "all", (s) => setLayoutParam(s, "spacing", 0.8));
    b = edit(b, "all", (s) => setScreenCount(s, 3));
    b = edit(b, "all", (s) => swapSlots(s, 0, 1));
    const a = b.items[0]!;
    expect(a.layout).toEqual({ id: "side-by-side", count: 3, params: { spacing: 0.8 } });
    expect(a.content.assetId).toBe("img_x");
    expect(a.slots![0]!.assetId).toBe("img_a");
    b = edit(b, "all", (s) => clearSlot(s, 1));
    expect(b.items[0]!.slots![0]).toEqual({ assetId: null });
    expect(b.items.slice(1).every((x) => !x.layout && !x.slots)).toBe(true);
    expect(b.shared.layout).toBeUndefined();
  });

  it("an edit under All changes the look of a multi-screen image, not its screens", () => {
    let b = withPair();
    b = edit(b, "all", pad(33));
    expect(b.shared.canvas.padding).toBe(33);
    const s = itemScene(b, b.items[0]!);
    expect(s.canvas.padding).toBe(33);
    expect(s.layout?.id).toBe("side-by-side");
    expect(s.slots).toEqual([{ assetId: "img_x" }]);
    // Seen from another image, the same edit.
    b = { ...b, active: "b", selected: ["b"] };
    b = edit(b, "all", pad(44));
    expect(itemScene(b, b.items[0]!).canvas.padding).toBe(44);
    expect(b.items[0]!.layout?.id).toBe("side-by-side");
    expect(b.items[0]!.slots).toEqual([{ assetId: "img_x" }]);
  });

  it("a This image edit makes a style override that holds no layout or screens", () => {
    let b = withPair();
    b = edit(b, "item", pad(9));
    expect(b.items[0]!.overrides).toEqual({ canvas: { padding: 9 } });
    b = resetOverrides(b, ["img_a", b.items[0]!.id]);
    expect(b.items[0]!.overrides).toBeUndefined();
    expect(b.items[0]!.layout?.id).toBe("side-by-side");
    expect(b.items[0]!.slots).toEqual([{ assetId: "img_x" }]);
  });

  it("style presets and Use this style for all never copy or clear screens", () => {
    let b = withPair();
    b = edit(b, "all", (s) => applyStylePatch(s, getStylePreset("midnight")!.patch, "midnight"));
    expect(b.items[0]!.layout?.id).toBe("side-by-side");
    expect(b.items[0]!.slots).toEqual([{ assetId: "img_x" }]);
    b = edit(b, "item", pad(3));
    const used = useStyleForAll(b, b.items[0]!.id, true);
    expect(used.shared.layout).toBeUndefined();
    expect(used.shared.slots).toBeUndefined();
    expect(used.items[0]!.layout?.id).toBe("side-by-side");
    expect(used.items[1]!.layout).toBeUndefined();
    expect(itemScene(used, used.items[1]!).canvas.padding).toBe(3);
    // From a single image onto a multi-screen one: it keeps its screens.
    const other = useStyleForAll({ ...b, active: "b" }, "b", true);
    expect(other.items[0]!.layout?.id).toBe("side-by-side");
    expect(other.items[0]!.slots).toEqual([{ assetId: "img_x" }]);
  });

  it("style diffs ignore layout and screens both ways", () => {
    const a = styled();
    const multi = setLayout({ ...a, content: img("p") }, "grid");
    expect(diffStyle(a, multi)).toBeUndefined();
    const applied = applyStyle(a, { layout: { id: "fan", count: 3 }, slots: [] } as never);
    expect(applied.layout).toBeUndefined();
    expect(applied.slots).toBeUndefined();
  });
});

describe("batch operations keep screens", () => {
  it("a multi-screen single design becomes the first image of a batch with its screens", () => {
    let s: Scene = setLayout({ ...styled(), content: img("img_a") }, "hero");
    s = fillSlot(fillSlot(s, 1, "img_x"), 2, "img_y");
    const b = batchFromScene(s, { name: "a.png" });
    expect(b.items[0]!.layout).toEqual({ id: "hero", count: 3 });
    expect(b.items[0]!.slots!.map((x) => x.assetId)).toEqual(["img_x", "img_y"]);
    expect(b.shared.layout).toBeUndefined();
    const grown = addItems(s, [{ name: "b.png", content: img("img_b") }], {
      currentName: "a.png",
    }) as Batch;
    expect(grown.items[0]!.slots!.map((x) => x.assetId)).toEqual(["img_x", "img_y"]);
    expect(grown.items[1]!.slots).toBeUndefined();
  });

  it("duplicate, remove and collapse to one image keep them", () => {
    const b = withPair();
    const dup = duplicateItems(b, [b.items[0]!.id]);
    expect(dup.items[1]!.slots).toEqual([{ assetId: "img_x" }]);
    expect(dup.items[1]!.layout?.id).toBe("side-by-side");
    const single = removeItems(b, ["b", "c"]);
    expect(isBatch(single)).toBe(false);
    expect((single as Scene).layout?.id).toBe("side-by-side");
    expect((single as Scene).slots).toEqual([{ assetId: "img_x" }]);
    expect(toSingle(b).slots).toEqual([{ assetId: "img_x" }]);
  });

  it("switching to Single keeps the screens on the item, and back restores them", () => {
    let b = withPair();
    b = edit(b, "all", (s) => setLayout(s, "single"));
    expect(b.items[0]!.layout).toBeUndefined();
    expect(b.items[0]!.slots).toEqual([{ assetId: "img_x" }]);
    b = edit(b, "all", (s) => setLayout(s, "side-by-side"));
    expect(itemScene(b, b.items[0]!).slots).toEqual([{ assetId: "img_x" }]);
  });

  it("asset ids include every screen, shown or kept for later", () => {
    let b = withPair();
    expect(batchAssetIds(b).sort()).toEqual(["img_a", "img_b", "img_c", "img_x"]);
    b = edit(b, "all", (s) => setLayout(s, "single"));
    expect(batchAssetIds(b)).toContain("img_x");
    expect(itemAssetIds(b.items[0]!)).toEqual(["img_a", "img_x"]);
    expect([...collectKeepIds({ batch: JSON.parse(JSON.stringify(b)) })].sort()).toEqual([
      "img_a",
      "img_b",
      "img_c",
      "img_x",
    ]);
  });
});

describe("validation and persistence", () => {
  it("round-trips layout and screens (with their marks) through storage", async () => {
    let b = withPair();
    const red = { ...createAnnotation("redact", "r1"), x: 0.1, y: 0.1, w: 0.2, h: 0.1 };
    b = edit(b, "all", (s) => ({
      ...s,
      slots: [{ ...s.slots![0]!, annotations: [red as Annotation] }],
    }));
    b = edit(b, "all", (s) => setLayoutParam(s, "tilt", 0.4));
    const store = createMemoryStore();
    await store.settings.set("batch", { v: 1, batch: b });
    const raw = await store.settings.get<{ batch: unknown }>("batch");
    const back = normalizeBatch(JSON.parse(JSON.stringify(raw!.batch))) as Batch;
    expect(back.items[0]!.layout).toEqual(b.items[0]!.layout);
    expect(back.items[0]!.slots).toEqual(b.items[0]!.slots);
    expect(back.items[1]!.layout).toBeUndefined();
  });

  it("drops what isn't valid: unknown layouts, bad screens, stray knobs", () => {
    const b = batchOf(2);
    const raw = JSON.parse(JSON.stringify(b));
    raw.items[0].layout = { id: "spiral", count: 3 };
    raw.items[0].slots = [{ assetId: "img_x" }, "junk", { assetId: 5 }];
    raw.items[1].layout = { id: "fan", count: 99, params: { spread: 7, gap: 0.2 } };
    const back = normalizeBatch(raw) as Batch;
    expect(back.items[0]!.layout).toBeUndefined();
    expect(back.items[0]!.slots).toEqual([{ assetId: "img_x" }, { assetId: null }]);
    expect(back.items[1]!.layout).toEqual({ id: "fan", count: 5, params: { spread: 1 } });
  });

  it("a Single layout normalizes away; the screens stay", () => {
    const raw = JSON.parse(JSON.stringify(batchOf(2)));
    raw.items[0].layout = { id: "single", count: 1 };
    raw.items[0].slots = [{ assetId: "img_x" }];
    const back = normalizeBatch(raw) as Batch;
    expect(back.items[0]!.layout).toBeUndefined();
    expect(back.items[0]!.slots).toEqual([{ assetId: "img_x" }]);
  });
});

/** Tiny PNGs, each a different colour (asset ids come from the bytes). */
const png = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const PNG_A = png(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
);
const PNG_B = png(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
);
const PNG_C = png(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGPgORH1HwAEQAIu0lxEEAAAAABJRU5ErkJggg==",
);

describe("project files", () => {
  const now = new Date("2026-09-30T12:00:00Z");
  const [a, bId, x] = [PNG_A, PNG_B, PNG_C].map(assetIdForBytes) as [string, string, string];
  const assets = [
    { id: a, blob: new Blob([PNG_A], { type: "image/png" }), width: 1, height: 1 },
    { id: bId, blob: new Blob([PNG_B], { type: "image/png" }), width: 1, height: 1 },
    { id: x, blob: new Blob([PNG_C], { type: "image/png" }), width: 1, height: 1 },
  ];
  const make = () => {
    let s: Scene = { ...createScene(), content: img(a) };
    s = fillSlot(setLayout(s, "overlap"), 1, x);
    return addItems(s, [{ name: "b.png", content: img(bId) }], { currentName: "a.png" }) as Batch;
  };

  it("carry every screen's image and bring the design back whole", async () => {
    const b = make();
    const file = await createProjectFile(itemScene(b, b.items[0]!), assets, {
      appVersion: "t",
      now,
      batch: b,
    });
    expect(Object.keys(file.assets).sort()).toEqual([a, bId, x].sort());
    const back = await parseProject(serializeProject(file));
    expect(back.issues).toEqual([]);
    expect(back.batch!.items[0]!.layout).toEqual({ id: "overlap", count: 2 });
    expect(back.batch!.items[0]!.slots).toEqual([{ assetId: x }]);
  });

  it("a screen whose image is missing comes back empty, and says so", async () => {
    const b = make();
    const file = await createProjectFile(itemScene(b, b.items[0]!), assets, {
      appVersion: "t",
      now,
      batch: b,
    });
    const json = JSON.parse(serializeProject(file));
    delete json.assets[x];
    const back = await parseProject(JSON.stringify(json));
    expect(back.batch!.items[0]!.slots).toEqual([{ assetId: null }]);
    expect(back.batch!.items[0]!.layout?.id).toBe("overlap");
    expect(back.issues.join()).toMatch(/a screen of a\.png is missing/);
  });
});

describe("combine into one design", () => {
  it("side by side for two or three, a grid for four to six", () => {
    const b = batchOf(7);
    const two = combineItems(b, ["b", "c"], "n2");
    const n2 = two.items.find((x) => x.id === "n2")!;
    expect(n2.layout).toEqual({ id: "side-by-side", count: 2 });
    expect(n2.content.assetId).toBe("img_b");
    expect(n2.slots!.map((s) => s.assetId)).toEqual(["img_c"]);
    const three = combineItems(b, ["c", "b", "d"], "n3").items.find((x) => x.id === "n3")!;
    expect(three.layout).toEqual({ id: "side-by-side", count: 3 });
    // Batch order, not selection order.
    expect([three.content.assetId, ...three.slots!.map((s) => s.assetId)]).toEqual([
      "img_b",
      "img_c",
      "img_d",
    ]);
    for (const n of [4, 5, 6]) {
      const sel = b.items.slice(1, 1 + n).map((x) => x.id);
      const it = combineItems(b, sel, "combo").items.find((x) => x.id === "combo")!;
      expect(it.layout).toEqual({ id: "grid", count: n });
      expect(it.slots!.length).toBe(n - 1);
      expect(it.slots!.every((s) => s.assetId)).toBe(true);
    }
    expect(combineItems(b, ["b"])).toBe(b);
    expect(
      combineItems(
        b,
        b.items.map((x) => x.id),
      ),
    ).toBe(b);
  });

  it("goes after the last one, comes on stage, and leaves the originals alone", () => {
    const b = batchOf(5);
    const next = combineItems(b, ["b", "d"], "new");
    expect(next.items.map((x) => x.id)).toEqual([b.items[0]!.id, "b", "c", "d", "new", "e"]);
    expect(next.active).toBe("new");
    expect(next.selected).toEqual(["new"]);
    for (const x of b.items) expect(next.items.find((y) => y.id === x.id)).toBe(x);
    expect(next.items[4]!.name).toBe("b.png");
  });

  it("keeps the first image's look, marks and caption; redactions stay on their image", () => {
    let b = batchOf(3);
    b = { ...b, active: "b", selected: ["b"] };
    b = edit(b, "item", pad(21));
    const red = (id: string) =>
      ({ ...createAnnotation("redact", id), x: 0.2, y: 0.2, w: 0.3, h: 0.1 }) as Annotation;
    const text = { ...createAnnotation("text", "t1"), anchor: "canvas" } as Annotation;
    b = {
      ...b,
      items: b.items.map((x) =>
        x.id === "b"
          ? { ...x, annotations: [red("r1"), text] }
          : x.id === "c"
            ? { ...x, annotations: [red("r1"), { ...text, id: "t9" }] }
            : x,
      ),
    };
    const out = combineItems(b, ["b", "c"], "n");
    const n = out.items.find((x) => x.id === "n")!;
    expect(n.overrides).toEqual({ canvas: { padding: 21 } });
    expect(n.annotations.map((a) => a.id).sort()).toEqual(["r1", "t1"]);
    // c's redaction comes along on its screen, with an id of its own; its canvas text doesn't.
    expect(n.slots![0]!.annotations!.map((a) => [a.kind, a.id])).toEqual([["redact", "r1-2"]]);
    expect(itemScene(out, n).canvas.padding).toBe(21);
  });

  it("is one undo step in the editor", () => {
    const b = batchOf(3);
    const store = createEditorStore<Batch | Scene>(b, { lens: batchLens(() => "all") });
    store.updateDoc((d) => combineItems(d as Batch, ["b", "c"]), { label: "Combine 2 images" });
    expect((store.getState().doc as Batch).items.length).toBe(4);
    expect(store.getState().undoLabel).toBe("Combine 2 images");
    store.undo();
    expect(store.getState().doc).toBe(b);
  });

  it("placing another design's screenshot brings its crop and marks", () => {
    const base = setLayout({ ...styled(), content: img("p") }, "side-by-side");
    const s = placeScreen(base, 1, {
      assetId: "q",
      crop: { x: 0.1, y: 0, width: 0.8, height: 1 },
      annotations: [{ ...createAnnotation("redact", "z"), anchor: "content" } as Annotation],
    });
    expect(s.slots![0]!.crop).toEqual({ x: 0.1, y: 0, width: 0.8, height: 1 });
    expect(s.slots![0]!.annotations![0]!.id).toBe("z");
    expect(placeScreen(base, 1, { assetId: null })).toBe(base);
  });
});
