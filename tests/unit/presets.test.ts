import { describe, expect, it } from "vitest";
import {
  BACKGROUND_PRESETS,
  DEFAULT_STYLE_ID,
  SHADOW_PRESETS,
  SIZE_PRESETS,
  STYLE_BASE,
  STYLE_FAMILIES,
  STYLE_PRESETS,
  applyStylePatch,
  computeLayout,
  createScene,
  getSizePreset,
  getStylePreset,
  normalizeScene,
  outputSize,
  resolveShadowLayers,
  rotateSize,
  setIn,
} from "@/engine";
import { completeStylePatch } from "@/engine/presets/styles";

describe("size presets", () => {
  it("covers the brief's list with exact dimensions", () => {
    const want: Record<string, [number, number]> = {
      og: [1200, 630],
      "instagram-square": [1080, 1080],
      "instagram-portrait": [1080, 1350],
      "instagram-story": [1080, 1920],
    };
    for (const [id, [w, h]] of Object.entries(want)) {
      expect(getSizePreset(id)!.size).toMatchObject({ kind: "fixed", width: w, height: h });
    }
    for (const id of ["auto", "16x9", "4x3", "1x1", "4x5", "9x16", "x-post", "linkedin-post"]) {
      expect(getSizePreset(id)).toBeDefined();
    }
    expect(SIZE_PRESETS.filter((p) => p.group === "appstore").length).toBeGreaterThanOrEqual(3);
    expect(new Set(SIZE_PRESETS.map((p) => p.id)).size).toBe(SIZE_PRESETS.length);
  });

  it("every social/store preset cites an official source", () => {
    for (const p of SIZE_PRESETS.filter((x) => x.group === "social" || x.group === "appstore")) {
      expect(p.source, p.id).toMatch(/^https:\/\//);
    }
  });

  it("exports every preset at exactly its size at each scale", () => {
    const shots = [
      { width: 2880, height: 1800 },
      { width: 786, height: 1704 },
    ];
    for (const p of SIZE_PRESETS) {
      for (const shot of shots) {
        const s = setIn(
          createScene({ content: { kind: "image", assetId: "a" } }),
          ["canvas", "size"],
          p.size,
        );
        const l = computeLayout(s, shot);
        for (const scale of [1, 2, 3, 4]) {
          const o = outputSize(l, scale);
          if (p.size.kind === "fixed") {
            expect(o).toEqual({ width: p.size.width * scale, height: p.size.height * scale });
          } else if (p.size.kind === "aspect") {
            expect(o.width / o.height).toBeCloseTo(p.size.ratioW / p.size.ratioH, 2);
          }
          expect(Number.isInteger(o.width) && Number.isInteger(o.height)).toBe(true);
        }
      }
    }
  });

  it("rotates sizes for landscape variants", () => {
    expect(rotateSize({ kind: "fixed", width: 1, height: 2 })).toEqual({
      kind: "fixed",
      width: 2,
      height: 1,
    });
    expect(rotateSize({ kind: "aspect", ratioW: 9, ratioH: 16 })).toMatchObject({
      ratioW: 16,
      ratioH: 9,
    });
    expect(rotateSize({ kind: "auto" })).toEqual({ kind: "auto" });
  });
});

describe("style presets", () => {
  it("ships at least 12 styles with unique ids and a valid default", () => {
    expect(STYLE_PRESETS.length).toBeGreaterThanOrEqual(12);
    expect(new Set(STYLE_PRESETS.map((s) => s.id)).size).toBe(STYLE_PRESETS.length);
    expect(getStylePreset(DEFAULT_STYLE_ID)).toBeDefined();
    const families = new Set(STYLE_FAMILIES.map((f) => f.id));
    for (const s of STYLE_PRESETS) expect(families.has(s.family), s.id).toBe(true);
  });

  it("every style applies cleanly and fully specifies the look", () => {
    for (const style of STYLE_PRESETS) {
      const applied = applyStylePatch(createScene(), style.patch, style.id);
      const { scene, issues } = normalizeScene(applied);
      expect(issues, style.id).toEqual([]);
      expect(scene.meta.stylePresetId).toBe(style.id);
      expect(style.patch.background?.fill, style.id).toBeDefined();
      expect(Object.keys(style.patch.card ?? {}).sort()).toEqual(
        Object.keys(STYLE_BASE.card!).sort(),
      );
    }
  });

  it("applying one style after another equals applying it alone", () => {
    const [a, b] = [STYLE_PRESETS[0]!, STYLE_PRESETS[STYLE_PRESETS.length - 1]!];
    const direct = applyStylePatch(createScene(), b.patch, b.id);
    const chained = applyStylePatch(applyStylePatch(createScene(), a.patch, a.id), b.patch, b.id);
    expect(chained.card).toEqual(direct.card);
    expect(chained.background).toEqual(direct.background);
    expect(chained.canvas.padding).toBe(direct.canvas.padding);
  });

  it("resolves @background references and rejects unknown ones", () => {
    const bg = BACKGROUND_PRESETS.find((b) => b.group === "mesh")!;
    const p = completeStylePatch({ background: { fill: `@${bg.id}` } });
    expect(p.background?.fill).toEqual(bg.fill);
    expect(() => completeStylePatch({ background: { fill: "@does-not-exist" } })).toThrow();
  });

  it("references only known shadows and frames", () => {
    const shadowIds = new Set(SHADOW_PRESETS.map((s) => s.id));
    for (const s of STYLE_PRESETS) {
      expect(shadowIds.has(s.patch.card!.shadow!.preset!), s.id).toBe(true);
      expect(["none", "macos", "browser", "phone", "tablet", "laptop"]).toContain(
        s.patch.card!.frame!.id,
      );
    }
  });
});

describe("backgrounds and shadows", () => {
  it("every background preset is a valid fill + grain", () => {
    expect(BACKGROUND_PRESETS.length).toBeGreaterThan(20);
    for (const b of BACKGROUND_PRESETS) {
      const { issues } = normalizeScene({ background: { fill: b.fill, grain: b.grain } });
      expect(issues, b.id).toEqual([]);
    }
  });

  it("resolves shadow layers with strength", () => {
    const base = resolveShadowLayers({ preset: "deep", strength: 1, color: "#000" });
    const half = resolveShadowLayers({ preset: "deep", strength: 0.5, color: "#000" });
    expect(base.length).toBeGreaterThan(1);
    half.forEach((l, i) => expect(l.opacity).toBeCloseTo(base[i]!.opacity / 2, 9));
    expect(resolveShadowLayers({ preset: "deep", strength: 0, color: "#000" })).toEqual([]);
    expect(resolveShadowLayers({ preset: "nope", strength: 1, color: "#000" })).toEqual([]);
    const custom = [{ x: 1, y: 2, blur: 3, spread: 0, opacity: 0.9 }];
    expect(
      resolveShadowLayers({ preset: "custom", strength: 2, color: "#000", layers: custom })[0]!
        .opacity,
    ).toBe(1);
  });
});
