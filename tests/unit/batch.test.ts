import { describe, expect, it } from "vitest";
import { unzipSync } from "fflate";
import {
  type Scene,
  applyStylePatch,
  createAnnotation,
  createScene,
  getStylePreset,
  setIn,
} from "@/engine";
import {
  type Batch,
  type EditorDoc,
  type EditScope,
  addItems,
  batchAssetIds,
  batchFromScene,
  batchLens,
  customCount,
  docScene,
  duplicateItems,
  isBatch,
  itemGroups,
  itemScene,
  moveItems,
  normalizeBatch,
  nudgeItems,
  removeItems,
  resetOverrides,
  selectAll,
  selectItems,
  useStyleForAll,
} from "@/engine/batch/batch";
import {
  applyStyle,
  diffStyle,
  dropGroups,
  overrideGroups,
  pruneOverrides,
} from "@/engine/batch/style";
import {
  baseName,
  batchArchiveName,
  batchFileName,
  dedupeName,
  naturalCompare,
  sortByName,
  uniqueNames,
} from "@/engine/batch/names";
import { ZipStream } from "@/engine/batch/zip";
import { createEditorStore } from "@/state/editor-store";

const img = (id: string) => ({ kind: "image" as const, assetId: id });
const styled = (id = "sherbet") => applyStylePatch(createScene(), getStylePreset(id)!.patch, id);

/** A batch of n images a, b, c… on the sherbet style. */
function batchOf(n: number): Batch {
  const first = { ...styled(), content: img("img_a") };
  const add = Array.from({ length: n - 1 }, (_, i) => {
    const k = String.fromCharCode(98 + i);
    return { name: `${k}.png`, content: img(`img_${k}`), id: k };
  });
  return addItems(first, add, { currentName: "a.png" }) as Batch;
}
const ids = (b: EditorDoc) => (isBatch(b) ? b.items.map((x) => x.id) : []);
const edit = (b: Batch, scope: EditScope, fn: (s: Scene) => Scene) => {
  const prev = docScene(b);
  return batchLens(() => scope).update(b, fn(prev), prev) as Batch;
};
const pad = (v: number) => (s: Scene) => setIn(s, ["canvas", "padding"], v);

describe("style overrides", () => {
  it("diffs only style, sparsely, and applies back to the same look", () => {
    const a = styled("sherbet");
    const b = setIn(setIn(a, ["canvas", "padding"], 7), ["card", "radius"], 3);
    const d = diffStyle(a, {
      ...b,
      content: img("x"),
      annotations: [createAnnotation("text", "t")],
    });
    expect(d).toEqual({ canvas: { padding: 7 }, card: { radius: 3 } });
    expect(applyStyle(a, d)).toEqual(b);
    expect(diffStyle(a, a)).toBeUndefined();
  });

  it("keeps unions whole, treats absent and null alike, ignores the preset id alone", () => {
    const a = styled("sherbet");
    const mid = styled("midnight");
    const d = diffStyle(a, mid)!;
    expect(d.background).toBeDefined();
    // A fill of another kind is replaced whole, never merged.
    const fill = (d.background as { fill?: unknown }).fill;
    if (fill) expect(fill).toEqual(mid.background.fill);
    expect(applyStyle(a, d).background).toEqual(mid.background);
    const noStack = { ...a, card: { ...a.card, stack: null } };
    expect(diffStyle(a, noStack)).toBeUndefined(); // sherbet has no stack either way
    const renamed = { ...a, meta: { ...a.meta, stylePresetId: "other" } };
    expect(diffStyle(a, renamed)).toBeUndefined();
  });

  it("reports and resets per inspector group", () => {
    const a = styled();
    let b = setIn(a, ["canvas", "padding"], 1);
    b = setIn(b, ["card", "frame", "id"], "browser");
    b = setIn(b, ["canvas", "size"], { kind: "aspect", ratioW: 1, ratioH: 1 });
    b = setIn(b, ["background", "grain", "amount"], 0.5);
    const d = diffStyle(a, b);
    expect(overrideGroups(d)).toEqual(["background", "layout", "frame", "size"]);
    expect(overrideGroups(dropGroups(d, ["layout", "size"]))).toEqual(["background", "frame"]);
    expect(dropGroups(d, ["background", "layout", "frame", "size"])).toBeUndefined();
    expect(pruneOverrides(b, d)).toBeUndefined();
  });
});

describe("batch model", () => {
  it("composes each item from the shared style, its overrides and its own parts", () => {
    const b = batchOf(3);
    const s = itemScene(b, b.items[1]!);
    expect(s.content).toEqual(img("img_b"));
    expect(s.meta.name).toBe("b");
    expect(s.canvas.padding).toBe(b.shared.canvas.padding);
    expect(itemScene(b, b.items[1]!)).toBe(s); // memoized per (shared, item)
  });

  it("adds: empty editor takes the first image, a single design becomes a batch, a batch appends", () => {
    const empty = createScene();
    const one = addItems(empty, [{ name: "x.png", content: img("img_x") }], {
      prepareFirst: (s) => ({ ...s, meta: { ...s.meta, stylePresetId: "prepared" } }),
    });
    expect(isBatch(one)).toBe(false);
    expect((one as Scene).content).toEqual(img("img_x"));
    expect((one as Scene).meta.stylePresetId).toBe("prepared");

    const two = addItems(empty, [
      { name: "x.png", content: img("img_x") },
      { name: "y.png", content: img("img_y") },
    ]) as Batch;
    expect(two.items.map((x) => x.name)).toEqual(["x.png", "y.png"]);
    expect(two.active).toBe(two.items[0]!.id);

    const single = {
      ...styled(),
      content: img("img_s"),
      annotations: [createAnnotation("rect", "r")],
    };
    const b = addItems(single, [{ name: "n.png", content: img("img_n") }], {
      currentName: "s.png",
      activate: true,
    }) as Batch;
    expect(b.items.map((x) => x.name)).toEqual(["s.png", "n.png"]);
    expect(b.active).toBe(b.items[0]!.id); // the current image stays on stage
    expect(b.items[0]!.annotations).toHaveLength(1); // its marks stay with it
    expect(b.shared.annotations).toEqual([]);
    expect(itemScene(b, b.items[0]!).card).toEqual(single.card); // its look is the shared style

    const c = addItems(b, [{ name: "m.png", content: img("img_m") }], { activate: true }) as Batch;
    expect(c.items).toHaveLength(3);
    expect(c.active).toBe(c.items[2]!.id);
  });

  it("removes down to a single design or the empty editor", () => {
    const b = batchOf(3);
    const two = removeItems(b, ["b"]) as Batch;
    expect(ids(two)).toEqual([b.items[0]!.id, "c"]);
    const one = removeItems(two, ["c"]);
    expect(isBatch(one)).toBe(false);
    expect((one as Scene).content).toEqual(img("img_a"));
    const none = removeItems(b, ids(b));
    expect(isBatch(none)).toBe(false);
    expect((none as Scene).content).toEqual({ kind: "image", assetId: null });
  });

  it("moves the active image to its neighbour when it is removed", () => {
    let b = batchOf(4);
    b = selectItems(b, "b");
    expect((removeItems(b, ["b"]) as Batch).active).toBe("c");
    b = selectItems(b, "d");
    expect((removeItems(b, ["d"]) as Batch).active).toBe("c");
  });

  it("reorders by drop position and by nudging a selection", () => {
    const b = batchOf(5); // a b c d e
    const name = (x: Batch) => x.items.map((i) => i.name[0]).join("");
    expect(name(moveItems(b, ["b"], 4))).toBe("acdbe");
    expect(name(moveItems(b, ["d", "b"], 0))).toBe("bdace");
    expect(name(moveItems(b, ["e"], 0))).toBe("eabcd");
    expect(moveItems(b, ["b"], 1)).toBe(b); // dropped where it was
    expect(name(nudgeItems(b, ["b", "c"], 1))).toBe("adbce");
    expect(name(nudgeItems(b, ["b", "d"], -1))).toBe("badce");
    expect(nudgeItems(b, [b.items[0]!.id], -1)).toBe(b);
  });

  it("duplicates after each original and selects the copies", () => {
    const b = duplicateItems(batchOf(3), ["b"]);
    expect(b.items.map((x) => x.name)).toEqual(["a.png", "b.png", "b.png", "c.png"]);
    expect(b.items[2]!.id).not.toBe("b");
    expect(b.active).toBe(b.items[2]!.id);
  });

  it("selects like Finder: click, toggle, range, all", () => {
    let b = batchOf(5);
    b = selectItems(b, "b");
    expect(b.selected).toEqual(["b"]);
    b = selectItems(b, "d", "toggle");
    expect(b.selected).toEqual(["b", "d"]);
    expect(b.active).toBe("d");
    b = selectItems(b, "d", "toggle");
    expect(b.selected).toEqual(["b"]);
    expect(b.active).toBe("b");
    b = selectItems(b, "e", "range", "c");
    expect(b.selected).toEqual(["c", "d", "e"]);
    expect(selectAll(b).selected).toHaveLength(5);
  });

  it("routes edits: per-image parts to the item, style by scope", () => {
    let b = batchOf(3);
    const shared = b.shared.canvas.padding;
    // Annotations and crop always stay with the image on stage.
    b = edit(b, "all", (s) => ({ ...s, annotations: [createAnnotation("redact", "r")] }));
    expect(b.items[0]!.annotations).toHaveLength(1);
    expect(b.items[1]!.annotations).toHaveLength(0);
    expect(b.items[0]!.overrides).toBeUndefined();
    // "This image": an override on the active item only.
    b = edit(b, "item", pad(shared + 11));
    expect(itemGroups(b.items[0]!)).toEqual(["layout"]);
    expect(itemScene(b, b.items[1]!).canvas.padding).toBe(shared);
    // "All": the shared style changes; others follow, the image on stage too.
    b = selectItems(b, "b");
    b = edit(b, "item", (s) => setIn(s, ["card", "radius"], 2));
    b = selectItems(b, b.items[0]!.id);
    b = edit(b, "all", (s) => setIn(pad(99)(s), ["card", "radius"], 30));
    expect(b.shared.canvas.padding).toBe(99);
    expect(itemScene(b, b.items[0]!).canvas.padding).toBe(99); // the edit wins on the image you see
    expect(itemScene(b, b.items[2]!).card.radius).toBe(30);
    expect(itemScene(b, b.items[1]!).card.radius).toBe(2); // b keeps its own corners
    expect(itemScene(b, b.items[1]!).canvas.padding).toBe(99);
  });

  it("drops an override once it matches the shared style again", () => {
    let b = batchOf(2);
    const p = b.shared.canvas.padding;
    b = edit(b, "item", pad(p + 5));
    expect(b.items[0]!.overrides).toBeDefined();
    b = edit(b, "item", pad(p));
    expect(b.items[0]!.overrides).toBeUndefined();
  });

  it("edits every selected image under Selected", () => {
    let b = batchOf(4);
    b = selectItems(b, "b");
    b = selectItems(b, "c", "toggle");
    b = edit(b, "selected", pad(3));
    expect(itemScene(b, b.items[1]!).canvas.padding).toBe(3);
    expect(itemScene(b, b.items[2]!).canvas.padding).toBe(3);
    expect(itemScene(b, b.items[3]!).canvas.padding).toBe(b.shared.canvas.padding);
    expect(customCount(b)).toBe(2);
  });

  it("applies a style preset to all (keeping others' changes) or to one image", () => {
    let b = batchOf(3);
    b = selectItems(b, "b");
    b = edit(b, "item", (s) => setIn(s, ["background", "grain", "amount"], 0.77));
    b = selectItems(b, b.items[0]!.id);
    const mid = getStylePreset("midnight")!.patch;
    const all = edit(b, "all", (s) => applyStylePatch(s, mid, "midnight"));
    expect(all.shared.meta.stylePresetId).toBe("midnight");
    expect(itemScene(all, all.items[2]!).card).toEqual(applyStylePatch(b.shared, mid).card);
    expect(itemScene(all, all.items[1]!).background.grain.amount).toBe(0.77);
    const one = edit(b, "item", (s) => applyStylePatch(s, mid, "midnight"));
    expect(one.shared).toBe(b.shared);
    expect(itemScene(one, one.items[0]!).meta.stylePresetId).toBe("midnight");
    expect(itemGroups(one.items[0]!)).toContain("background");
  });

  it("resets overrides per group and per image", () => {
    let b = batchOf(2);
    b = edit(b, "item", (s) => setIn(pad(1)(s), ["card", "frame", "id"], "browser"));
    expect(itemGroups(b.items[0]!)).toEqual(["layout", "frame"]);
    const r1 = resetOverrides(b, [b.items[0]!.id], ["frame"]);
    expect(itemGroups(r1.items[0]!)).toEqual(["layout"]);
    const r2 = resetOverrides(b, [b.items[0]!.id]);
    expect(r2.items[0]!.overrides).toBeUndefined();
    expect(resetOverrides(r2, [r2.items[0]!.id])).toBe(r2);
  });

  it("uses one image's style for all, keeping the others' own changes", () => {
    let b = batchOf(3);
    b = selectItems(b, "b");
    b = edit(b, "item", (s) => setIn(s, ["card", "radius"], 5));
    b = selectItems(b, "c");
    b = edit(b, "item", (s) => setIn(pad(1)(s), ["card", "radius"], 9));
    const u = useStyleForAll(b, "c");
    expect(u.shared.canvas.padding).toBe(1);
    expect(u.items.find((x) => x.id === "c")!.overrides).toBeUndefined();
    expect(itemScene(u, u.items[0]!).card.radius).toBe(9);
    expect(itemScene(u, u.items[1]!).card.radius).toBe(5); // b keeps its corners
    expect(itemScene(u, u.items[1]!).canvas.padding).toBe(1); // …and follows the rest
    const r = useStyleForAll(b, "c", true);
    expect(customCount(r)).toBe(0);
  });

  it("stores a solid redaction with its image", () => {
    let b = batchOf(2);
    const r = { ...createAnnotation("redact", "r"), mode: "solid" as const, fill: "#000000" };
    b = edit(b, "all", (s) => ({ ...s, annotations: [r] }));
    const back = normalizeBatch(JSON.parse(JSON.stringify(b))) as Batch;
    expect(back.items[0]!.annotations).toEqual([r]);
    expect(back.items[1]!.annotations).toEqual([]);
    expect(itemScene(back, back.items[0]!).annotations).toEqual([r]);
  });

  it("lists the assets it needs", () => {
    const b = batchOf(3);
    expect(batchAssetIds(b).sort()).toEqual(["img_a", "img_b", "img_c"]);
  });

  it("validates stored batches", () => {
    let b = batchOf(3);
    b = edit(b, "item", pad(3));
    const back = normalizeBatch(JSON.parse(JSON.stringify(b))) as Batch;
    // Colours come back lower-cased; everything else as it was, and stable.
    expect(back.items.map((x) => [x.id, x.name, x.content, x.overrides])).toEqual(
      b.items.map((x) => [x.id, x.name, x.content, x.overrides]),
    );
    expect(back.active).toBe(b.active);
    expect(normalizeBatch(JSON.parse(JSON.stringify(back)))).toEqual(back);
    expect(normalizeBatch(null)).toBeNull();
    expect(normalizeBatch({ shared: {}, items: [] })).toBeNull();
    const broken = JSON.parse(JSON.stringify(b));
    broken.items[1].content = { kind: "image", assetId: null };
    broken.items[2].overrides = { canvas: { padding: -50 } };
    broken.active = "nope";
    const fixed = normalizeBatch(broken) as Batch;
    expect(fixed.items).toHaveLength(2);
    expect(fixed.active).toBe(fixed.items[0]!.id);
    expect(fixed.items[1]!.overrides).toEqual({ canvas: { padding: 0 } });
    const single = JSON.parse(JSON.stringify(b));
    single.items = single.items.slice(0, 1);
    expect(isBatch(normalizeBatch(single))).toBe(false);
    expect(normalizeBatch(b, 2) as Batch).toMatchObject({ items: [{}, {}] });
  });

  it("turns a single design into a batch without changing its look", () => {
    const s = { ...styled("midnight"), content: img("img_q") };
    const b = batchFromScene(s, { name: "q.png" });
    expect(itemScene(b, b.items[0]!)).toEqual({ ...s, meta: { ...s.meta, name: "q" } });
  });
});

describe("editor store over batch documents", () => {
  function setup(scope: EditScope = "all") {
    let t = 0;
    let sc = scope;
    const store = createEditorStore<EditorDoc>(styled(), {
      lens: batchLens(() => sc),
      now: () => t,
    });
    return { store, tick: (ms: number) => (t += ms), scope: (s: EditScope) => (sc = s) };
  }

  it("keeps plain scene edits working and makes each batch operation one named step", () => {
    const { store } = setup();
    store.update((s) => ({ ...s, content: img("img_a") }));
    store.updateDoc(
      (d) =>
        addItems(d, [
          { name: "b.png", content: img("img_b") },
          { name: "c.png", content: img("img_c") },
        ]),
      { label: "Add 2 images" },
    );
    expect(isBatch(store.getState().doc)).toBe(true);
    expect(store.getState().undoLabel).toBe("Add 2 images");
    const b = store.getState().doc as Batch;
    store.updateDoc((d) => removeItems(d as Batch, [b.items[1]!.id, b.items[2]!.id]), {
      label: "Remove 2 images",
    });
    expect(isBatch(store.getState().doc)).toBe(false);
    store.undo();
    expect((store.getState().doc as Batch).items).toHaveLength(3);
    expect(store.getState().redoLabel).toBe("Remove 2 images");
    store.undo();
    expect(isBatch(store.getState().doc)).toBe(false);
    expect(store.getState().scene.content).toEqual(img("img_a"));
  });

  it("edits the active image's scene through the lens, with undo and coalescing", () => {
    const { store, tick, scope } = setup();
    store.reset(batchOf(3));
    for (let v = 1; v <= 5; v++) {
      store.update(pad(v), { coalesce: "canvas.padding" });
      tick(50);
    }
    expect((store.getState().doc as Batch).shared.canvas.padding).toBe(5);
    store.undo();
    expect((store.getState().doc as Batch).shared.canvas.padding).toBe(
      batchOf(3).shared.canvas.padding,
    );
    scope("item");
    store.update(pad(40));
    expect(store.getState().scene.canvas.padding).toBe(40);
    // Selecting another image is not an undo step, and shows its own scene.
    store.updateDoc((d) => selectItems(d as Batch, "b"), { transient: true });
    expect(store.getState().scene.content).toEqual(img("img_b"));
    expect(store.getState().scene.canvas.padding).not.toBe(40);
    store.undo(); // reverts the override and shows that image again
    expect(store.getState().scene.content).toEqual(img("img_a"));
    expect((store.getState().doc as Batch).items[0]!.overrides).toBeUndefined();
  });

  it("drops the annotation selection when another image comes on stage", () => {
    const { store } = setup();
    store.reset(batchOf(2));
    store.update((s) => ({ ...s, annotations: [createAnnotation("text", "t1")] }));
    store.select("t1");
    store.updateDoc((d) => selectItems(d as Batch, "b"), { transient: true });
    expect(store.getState().selection).toBeNull();
  });

  it("keeps the scene reference while an unrelated part of the document changes", () => {
    const { store } = setup();
    store.reset(batchOf(3));
    const s = store.getState().scene;
    store.updateDoc((d) => resetOverrides(d as Batch, ["c"]));
    store.updateDoc((d) => selectItems(d as Batch, "b", "toggle"), { transient: true });
    expect(store.getState().scene.content).toEqual(img("img_b"));
    store.updateDoc((d) => selectItems(d as Batch, "b", "toggle"), { transient: true });
    expect(store.getState().scene).toBe(s);
  });
});

describe("batch names", () => {
  it("sorts naturally", () => {
    const files = ["shot-10.png", "shot-2.png", "Shot-1.png", "a/b.png"].map((name) => ({ name }));
    expect(sortByName(files).map((f) => f.name)).toEqual([
      "a/b.png",
      "Shot-1.png",
      "shot-2.png",
      "shot-10.png",
    ]);
    expect(naturalCompare("img9", "img10")).toBeLessThan(0);
    expect(
      sortByName([
        { name: "x.png", path: "b/x.png" },
        { name: "y.png", path: "a/y.png" },
      ]).map((f) => f.name),
    ).toEqual(["y.png", "x.png"]);
  });

  it("keeps the original base name and numbers collisions", () => {
    const now = new Date(2026, 8, 29, 10, 0, 0);
    const v = { n: 3, width: 100, height: 50, scale: 2, format: "png" as const, now };
    expect(baseName("shots/Login screen.png")).toBe("Login screen");
    expect(batchFileName("{name}-{w}x{h}@{scale}x", { ...v, source: "login.PNG" })).toBe(
      "login.png",
    );
    expect(batchFileName("{n}-{name}", { ...v, source: "login.png" })).toBe("3-login.png");
    expect(batchFileName("{name}", { ...v, source: "a.png", format: "jpeg" })).toBe("a.jpg");
    expect(batchFileName("{name}", { ...v, source: "" })).toBe("shotcandy.png");
    expect(uniqueNames(["a.png", "A.png", "a.png", "b.png"])).toEqual([
      "a.png",
      "A (2).png",
      "a (3).png",
      "b.png",
    ]);
    const taken = new Set(["a.png"]);
    expect(dedupeName("a.png", taken)).toBe("a (2).png");
    expect(batchArchiveName(12, now)).toBe("shotcandy-12-images-2026-09-29");
  });
});

describe("streaming zip", () => {
  it("stores files as they are added, byte for byte", async () => {
    const z = new ZipStream();
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array(70_000).map((_, i) => i % 251);
    z.add("Shotcandy/a.png", a);
    z.add("Shotcandy/b é.png", b);
    const blob = await z.finish();
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    expect(Object.keys(files)).toEqual(["Shotcandy/a.png", "Shotcandy/b é.png"]);
    expect(files["Shotcandy/a.png"]).toEqual(a);
    expect(files["Shotcandy/b é.png"]).toEqual(b);
    // Stored, not deflated: the archive is barely larger than the files.
    expect(blob.size).toBeLessThan(a.length + b.length + 400);
  });
});
