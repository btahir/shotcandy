import { describe, expect, it } from "vitest";
import {
  SCENE_VERSION,
  addAnnotation,
  applyStylePatch,
  createAnnotation,
  createMigrator,
  createScene,
  deepMerge,
  extractStylePatch,
  getIn,
  loadScene,
  MigrationError,
  normalizeScene,
  removeAnnotation,
  sceneAssetIds,
  setIn,
  updateAnnotation,
  type Scene,
} from "@/engine";

describe("createScene", () => {
  it("produces a valid, normalization-stable scene", () => {
    const s = createScene();
    expect(s.version).toBe(SCENE_VERSION);
    const { scene, issues } = normalizeScene(s);
    expect(issues).toEqual([]);
    expect(scene).toEqual(s);
  });

  it("creates every annotation kind with valid defaults", () => {
    for (const kind of ["text", "arrow", "rect", "redact"] as const) {
      const a = createAnnotation(kind, `id-${kind}`);
      const { scene, issues } = normalizeScene({ ...createScene(), annotations: [a] });
      expect(issues).toEqual([]);
      expect(scene.annotations[0]).toEqual(a);
    }
  });
});

describe("normalizeScene", () => {
  it("returns a blank scene for non-objects", () => {
    for (const bad of [null, 42, "x", []]) {
      const { scene, issues } = normalizeScene(bad);
      expect(scene).toEqual(createScene());
      expect(issues.length).toBeGreaterThan(0);
    }
  });

  it("fills missing sections with defaults", () => {
    const { scene } = normalizeScene({ version: 1 });
    expect(scene.card.shadow.preset).toBe("soft");
    expect(scene.canvas.size).toEqual({ kind: "auto" });
    expect(scene.content).toEqual({ kind: "image", assetId: null });
  });

  it("clamps numbers, normalizes colours and reports issues", () => {
    const { scene, issues } = normalizeScene({
      ...createScene(),
      canvas: { size: { kind: "fixed", width: 99999, height: 630.4 }, padding: -5 },
      card: { radius: 9999, border: { width: 2, color: "RGB(255,0,0)" }, shadow: { strength: 7 } },
      background: { fill: { kind: "solid", color: "not-a-colour" }, grain: { amount: 3 } },
    });
    expect(scene.canvas.size).toEqual({ kind: "fixed", width: 16384, height: 630 });
    expect(scene.canvas.padding).toBe(0);
    expect(scene.card.radius).toBe(500);
    expect(scene.card.border.color).toBe("#ff0000");
    expect(scene.card.shadow.strength).toBe(2);
    expect(scene.background.fill).toEqual({ kind: "solid", color: "#ffffff" });
    expect(scene.background.grain.amount).toBe(1);
    expect(issues.join("\n")).toMatch(/canvas.padding/);
    expect(issues.join("\n")).toMatch(/background.fill.color/);
  });

  it("validates every background fill kind", () => {
    const fills = [
      { kind: "none" },
      { kind: "solid", color: "#abc" },
      {
        kind: "linear",
        angle: 45,
        stops: [
          { offset: 1, color: "#000" },
          { offset: 0, color: "#fff" },
        ],
      },
      { kind: "radial", cx: 0.5, cy: 0.5, radius: 1, stops: [{ offset: 0, color: "#fff" }] },
      { kind: "conic", cx: 0.5, cy: 0.5, angle: 0, stops: [{ offset: 0, color: "#fff" }] },
      { kind: "mesh", base: "#fff", points: [{ x: 0.1, y: 0.1, color: "#f00", radius: 0.5 }] },
      {
        kind: "image",
        assetId: "img_x",
        fit: "cover",
        blur: 10,
        tint: 0.1,
        focusX: 0.5,
        focusY: 0.5,
      },
      { kind: "auto", style: "mesh", variant: 2 },
    ];
    for (const fill of fills) {
      const { scene, issues } = normalizeScene({ background: { fill } });
      expect(issues).toEqual([]);
      expect(scene.background.fill.kind).toBe(fill.kind);
    }
    // Gradient stops are sorted by offset.
    const lin = normalizeScene({ background: { fill: fills[2] } }).scene.background.fill;
    expect(lin.kind === "linear" && lin.stops.map((s) => s.offset)).toEqual([0, 1]);
    // Image fills without an asset degrade to solid.
    expect(
      normalizeScene({ background: { fill: { kind: "image" } } }).scene.background.fill.kind,
    ).toBe("solid");
  });

  it("drops unknown annotations and de-duplicates ids", () => {
    const a = createAnnotation("arrow", "same");
    const b = createAnnotation("rect", "same");
    const { scene, issues } = normalizeScene({
      ...createScene(),
      annotations: [a, { kind: "sparkle", id: "x" }, b, "junk"],
    });
    expect(scene.annotations.map((x) => x.id)).toEqual(["same", "same-2"]);
    expect(issues.some((i) => i.includes("sparkle"))).toBe(true);
  });

  it("forces redactions to be content-anchored", () => {
    const r = { ...createAnnotation("redact", "r"), anchor: "canvas" };
    expect(normalizeScene({ annotations: [r] }).scene.annotations[0]!.anchor).toBe("content");
  });

  describe("solid redactions", () => {
    const redact = (extra: object) => ({ ...createAnnotation("redact", "r"), ...extra });
    const first = (v: unknown) => normalizeScene({ annotations: [v] });

    it("accepts the solid mode with an auto colour by default", () => {
      const { scene, issues } = first(redact({ mode: "solid" }));
      expect(issues).toEqual([]);
      expect(scene.annotations[0]).toMatchObject({ kind: "redact", mode: "solid", fill: "auto" });
    });

    it("keeps a chosen colour, opaque and lower-cased", () => {
      expect(first(redact({ mode: "solid", fill: "#FFFFFF" })).scene.annotations[0]).toMatchObject({
        fill: "#ffffff",
      });
      // Any alpha is dropped: a solid box is never see-through.
      expect(
        first(redact({ mode: "solid", fill: "#12345680" })).scene.annotations[0],
      ).toMatchObject({ fill: "#123456" });
      expect(first(redact({ mode: "solid", fill: "auto" })).scene.annotations[0]).toMatchObject({
        fill: "auto",
      });
    });

    it("falls back to auto, with an issue, for a bad colour", () => {
      const { scene, issues } = first(redact({ mode: "solid", fill: "nope" }));
      expect(scene.annotations[0]).toMatchObject({ fill: "auto" });
      expect(issues.some((i) => i.includes("fill"))).toBe(true);
    });

    it("leaves older blur and pixelate redactions exactly as they were", () => {
      for (const mode of ["blur", "pixelate"] as const) {
        const a = redact({ mode, strength: 20 });
        const { scene, issues } = first(a);
        expect(issues).toEqual([]);
        expect(scene.annotations[0]).toEqual(a);
        expect("fill" in scene.annotations[0]!).toBe(false);
      }
    });

    it("remembers the colour when switched to another mode", () => {
      const a = redact({ mode: "blur", fill: "#000000" });
      expect(first(a).scene.annotations[0]).toEqual(a);
    });

    it("rejects unknown modes as blur", () => {
      const { scene, issues } = first(redact({ mode: "shred" }));
      expect(scene.annotations[0]).toMatchObject({ mode: "blur" });
      expect(issues.some((i) => i.includes("mode"))).toBe(true);
    });

    it("is idempotent and survives a JSON round trip", () => {
      const once = first(redact({ mode: "solid", fill: "#ABCDEF" })).scene;
      const twice = normalizeScene(JSON.parse(JSON.stringify(once)));
      expect(twice.issues).toEqual([]);
      expect(twice.scene).toEqual(once);
    });

    it("normalizes solid redactions on a screen's own marks", () => {
      const { scene, issues } = normalizeScene({
        layout: { id: "grid", count: 2 },
        slots: [{ assetId: "b", annotations: [redact({ mode: "solid", fill: "#000" })] }],
      });
      expect(issues).toEqual([]);
      expect(scene.slots![0]!.annotations![0]).toMatchObject({ mode: "solid", fill: "#000000" });
    });
  });

  it("is idempotent", () => {
    const messy = {
      card: { radius: -3, frame: { id: "macos", theme: "sepia", lights: "mono" } },
      meta: { name: 7 },
    };
    const once = normalizeScene(messy).scene;
    const twice = normalizeScene(once);
    expect(twice.scene).toEqual(once);
    expect(twice.issues).toEqual([]);
    expect(once.card.frame.lights).toBe("mono");
    expect(once.card.frame.theme).toBe("auto");
  });

  it("validates crops within the image", () => {
    const { scene } = normalizeScene({
      content: { kind: "image", assetId: "a", crop: { x: 0.8, y: 0, width: 0.9, height: 1 } },
    });
    const crop = scene.content.kind === "image" ? scene.content.crop! : null;
    expect(crop!.x).toBe(0.8);
    expect(crop!.width).toBeCloseTo(0.2, 12);
    expect(crop!.height).toBe(1);
  });
});

describe("migrations", () => {
  const steps = [
    {
      from: 1,
      to: 2,
      migrate: (d: Record<string, unknown>) => ({ ...d, padding: (d.pad as number) * 2 }),
    },
    { from: 2, to: 3, migrate: (d: Record<string, unknown>) => ({ ...d, renamed: d.padding }) },
  ];

  it("runs steps in order up to the current version", () => {
    const m = createMigrator(3, steps);
    const { doc, applied } = m.migrate({ version: 1, pad: 5 });
    expect(doc).toEqual({ version: 3, pad: 5, padding: 10, renamed: 10 });
    expect(applied).toEqual([2, 3]);
    expect(m.migrate({ version: 3, x: 1 }).applied).toEqual([]);
  });

  it("does not mutate its input", () => {
    const input = { version: 1, pad: 1 };
    createMigrator(3, steps).migrate(input);
    expect(input).toEqual({ version: 1, pad: 1 });
  });

  it("treats unversioned documents as v1", () => {
    expect(createMigrator(3, steps).migrate({ pad: 2 }).doc.padding).toBe(4);
  });

  it("rejects newer, invalid or unmigratable documents", () => {
    const m = createMigrator(3, steps);
    expect(() => m.migrate({ version: 4 })).toThrow(/newer/);
    expect(() => m.migrate({ version: "2" })).toThrow(MigrationError);
    expect(() => m.migrate(null)).toThrow(MigrationError);
    expect(() => createMigrator(3, [steps[1]!]).migrate({ version: 1 })).toThrow(/no migration/);
    expect(() => createMigrator(3, [{ from: 1, to: 3, migrate: (d) => d }])).toThrow(/bump/);
    expect(() => createMigrator(3, [steps[0]!, steps[0]!])).toThrow(/duplicate/);
  });

  it("supports a custom version key (project files use formatVersion)", () => {
    const m = createMigrator(
      2,
      [{ from: 1, to: 2, migrate: (d) => ({ ...d, ok: true }) }],
      "formatVersion",
    );
    expect(m.migrate({ formatVersion: 1 }).doc).toEqual({ formatVersion: 2, ok: true });
  });

  it("loads current scenes and normalizes them", () => {
    const s = createScene({ meta: { name: "x" } });
    const loaded = loadScene(s);
    expect(loaded.scene).toEqual(s);
    expect(loaded.migratedFrom).toBeNull();
    expect(() => loadScene({ ...s, version: 99 })).toThrow(/newer/);
  });
});

describe("patch helpers", () => {
  it("deep-merges objects and replaces on discriminant change", () => {
    const base = { a: 1, fill: { kind: "solid", color: "#fff" }, nested: { x: 1, y: 2 } };
    expect(deepMerge(base, { nested: { y: 3 } })).toEqual({ ...base, nested: { x: 1, y: 3 } });
    expect(deepMerge(base, { fill: { kind: "mesh", base: "#000", points: [] } }).fill).toEqual({
      kind: "mesh",
      base: "#000",
      points: [],
    });
    expect(deepMerge(base, { fill: { color: "#000" } }).fill).toEqual({
      kind: "solid",
      color: "#000",
    });
    expect(deepMerge([1, 2], [3])).toEqual([3]);
  });

  it("applies style patches without touching content, size or annotations", () => {
    const s: Scene = {
      ...createScene({ content: { kind: "image", assetId: "img_1" } }),
      canvas: { size: { kind: "fixed", width: 1200, height: 630 }, padding: 10 },
      annotations: [createAnnotation("text", "t")],
    };
    const next = applyStylePatch(
      s,
      { canvas: { padding: 99 }, card: { radius: 3, frame: { id: "macos" } } },
      "p1",
    );
    expect(next.content).toBe(s.content);
    expect(next.annotations).toBe(s.annotations);
    expect(next.canvas.size).toEqual(s.canvas.size);
    expect(next.canvas.padding).toBe(99);
    expect(next.card.frame).toEqual({ ...s.card.frame, id: "macos" });
    expect(next.meta.stylePresetId).toBe("p1");
  });

  it("extracts a style patch that reproduces the style", () => {
    const styled = applyStylePatch(createScene(), {
      card: { radius: 40, tilt: { rotateX: 10 }, shadow: { preset: "deep" } },
      background: { fill: { kind: "solid", color: "#123456" } },
    });
    const patch = extractStylePatch(styled);
    const replayed = applyStylePatch(createScene(), patch);
    expect(replayed.card).toEqual(styled.card);
    expect(replayed.background).toEqual(styled.background);
  });

  it("round-trips composition layers and clears them with null", () => {
    const styled = applyStylePatch(createScene(), {
      canvas: { anchor: "top-left", bleed: 0.3 },
      background: {
        texture: { kind: "paper", amount: 0.5, seed: 3 },
        vignette: { amount: 0.4, spotlight: 0.5, color: "#000000" },
      },
      card: {
        stack: { count: 2, x: 0, y: -40, rotate: 0, shrink: 0.05, color: "auto" },
        reflection: { opacity: 0.3, height: 0.4, gap: 4 },
      },
    });
    const replayed = applyStylePatch(createScene(), extractStylePatch(styled));
    expect(replayed.card.stack).toEqual(styled.card.stack);
    expect(replayed.background.texture).toEqual(styled.background.texture);
    expect(replayed.canvas).toMatchObject({ anchor: "top-left", bleed: 0.3 });
    const cleared = applyStylePatch(styled, {
      background: { texture: null, vignette: null },
      card: { stack: null, reflection: null },
    });
    expect("stack" in cleared.card).toBe(false);
    expect("texture" in cleared.background).toBe(false);
    // Normalization keeps the new fields and drops junk.
    const n = normalizeScene({ ...styled, card: { ...styled.card, stack: { count: 9 } } }).scene;
    expect(n.card.stack!.count).toBe(3);
    expect(n.background.vignette).toEqual(styled.background.vignette);
  });

  it("sets values immutably with structural sharing", () => {
    const s = createScene();
    const next = setIn(s, ["card", "radius"], 42);
    expect(next.card.radius).toBe(42);
    expect(s.card.radius).not.toBe(42);
    expect(next.background).toBe(s.background);
    expect(setIn(s, ["card", "radius"], s.card.radius)).toBe(s);
    expect(getIn(next, ["card", "radius"])).toBe(42);
    expect(getIn(next, ["nope", "deeper"])).toBeUndefined();
  });

  it("adds, updates and removes annotations", () => {
    let s = addAnnotation(createScene(), createAnnotation("rect", "r1"));
    s = updateAnnotation(s, "r1", { x: 0.9 });
    expect(s.annotations[0]).toMatchObject({ id: "r1", kind: "rect", x: 0.9 });
    s = removeAnnotation(s, "r1");
    expect(s.annotations).toEqual([]);
  });

  it("lists asset ids, optionally without built-ins", () => {
    const s = createScene({
      content: { kind: "image", assetId: "img_a" },
      background: {
        fill: {
          kind: "image",
          assetId: "builtin:peach-dunes",
          fit: "cover",
          blur: 0,
          tint: 0,
          focusX: 0.5,
          focusY: 0.5,
        },
        grain: { amount: 0, size: 1, seed: 1 },
      },
    });
    expect(sceneAssetIds(s)).toEqual(["img_a", "builtin:peach-dunes"]);
    expect(sceneAssetIds(s, { includeBuiltin: false })).toEqual(["img_a"]);
  });
});
