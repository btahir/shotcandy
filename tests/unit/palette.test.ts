import { describe, expect, it } from "vitest";
import {
  extractPalette,
  quantize,
  resolveAutoFill,
  suggestBackgrounds,
  suggestMixed,
  normalizeScene,
} from "@/engine";
import { downsample, edgeColor } from "@/engine/palette/extract";
import { colorToOklch, parseColor, rgbToOklab, deltaE } from "@/engine/math/color";
import { NEUTRAL_PALETTE } from "@/engine/palette/suggest";

/** Image made of horizontal bands: [hex, share][]. */
function bands(spec: [string, number][], w = 100, h = 100, alpha = 255): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  let row = 0;
  for (const [hex, share] of spec) {
    const c = parseColor(hex);
    const rows = Math.round(share * h);
    for (let y = row; y < Math.min(h, row + rows); y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        data[i] = c.r;
        data[i + 1] = c.g;
        data[i + 2] = c.b;
        data[i + 3] = alpha;
      }
    }
    row += rows;
  }
  return data;
}

const dist = (a: string, b: string) => {
  const x = parseColor(a);
  const y = parseColor(b);
  return deltaE(rgbToOklab(x.r, x.g, x.b), rgbToOklab(y.r, y.g, y.b));
};

describe("quantize", () => {
  it("recovers flat colours and their shares", () => {
    const data = bands([
      ["#ffffff", 0.5],
      ["#3b82f6", 0.3],
      ["#f59e0b", 0.2],
    ]);
    const clusters = quantize(data, { k: 6 });
    expect(clusters).toHaveLength(3);
    expect(dist(clusters[0]!.hex, "#ffffff")).toBeLessThan(0.02);
    expect(dist(clusters[1]!.hex, "#3b82f6")).toBeLessThan(0.02);
    expect(dist(clusters[2]!.hex, "#f59e0b")).toBeLessThan(0.02);
    expect(clusters[0]!.weight).toBeCloseTo(0.5, 2);
    expect(clusters[1]!.weight).toBeCloseTo(0.3, 2);
    expect(clusters.reduce((s, c) => s + c.weight, 0)).toBeCloseTo(1, 6);
  });

  it("keeps small but distinct accents", () => {
    const data = bands([
      ["#fafafa", 0.94],
      ["#e11d48", 0.03],
      ["#16a34a", 0.03],
    ]);
    const hexes = quantize(data).map((c) => c.hex);
    expect(hexes.some((h) => dist(h, "#e11d48") < 0.03)).toBe(true);
    expect(hexes.some((h) => dist(h, "#16a34a") < 0.03)).toBe(true);
  });

  it("merges near-identical shades and ignores transparent pixels", () => {
    const data = bands([
      ["#808080", 0.5],
      ["#818181", 0.5],
    ]);
    expect(quantize(data)).toHaveLength(1);
    expect(quantize(bands([["#ff0000", 1]], 10, 10, 0))).toEqual([]);
  });

  it("is deterministic", () => {
    const data = new Uint8ClampedArray(64 * 64 * 4);
    for (let i = 0; i < data.length; i++) data[i] = (i * 2654435761) % 256;
    expect(quantize(data)).toEqual(quantize(data.slice()));
  });
});

describe("extractPalette", () => {
  it("assigns roles sensibly for a typical UI screenshot", () => {
    const data = bands([
      ["#ffffff", 0.6],
      ["#f1f5f9", 0.2],
      ["#6d28d9", 0.1],
      ["#111827", 0.1],
    ]);
    const p = extractPalette({ data, width: 100, height: 100 });
    expect(dist(p.dominant.hex, "#ffffff")).toBeLessThan(0.02);
    expect(dist(p.vibrant.hex, "#6d28d9")).toBeLessThan(0.03);
    expect(dist(p.dark.hex, "#111827")).toBeLessThan(0.03);
    expect(p.light.lch.L).toBeGreaterThan(0.95);
    expect(p.achromatic).toBe(false);
  });

  it("flags grey screenshots as achromatic", () => {
    const p = extractPalette({
      data: bands([
        ["#ffffff", 0.5],
        ["#333333", 0.5],
      ]),
      width: 100,
      height: 100,
    });
    expect(p.achromatic).toBe(true);
  });

  it("measures the edge colour", () => {
    const w = 10;
    const data = bands([["#ff0000", 1]], w, w);
    // Paint the interior blue: the edge stays red.
    for (let y = 1; y < w - 1; y++)
      for (let x = 1; x < w - 1; x++) data.set([0, 0, 255, 255], (y * w + x) * 4);
    expect(edgeColor({ data, width: w, height: w })).toBe("#ff0000");
  });

  it("downsamples deterministically to a bounded size", () => {
    const data = bands([["#123456", 1]], 1000, 500);
    const small = downsample({ data, width: 1000, height: 500 }, 128);
    expect(small.width).toBe(128);
    expect(small.height).toBe(64);
    expect(Array.from(small.data.slice(0, 4))).toEqual([0x12, 0x34, 0x56, 255]);
  });
});

describe("background suggestions", () => {
  const p = extractPalette({
    data: bands([
      ["#ffffff", 0.7],
      ["#0ea5e9", 0.3],
    ]),
    width: 100,
    height: 100,
  });

  it("returns six valid fills per style, echoing the screenshot hue", () => {
    for (const style of ["mesh", "linear", "radial", "solid", "soft"] as const) {
      const fills = suggestBackgrounds(p, style);
      expect(fills).toHaveLength(6);
      for (const fill of fills) {
        const { issues } = normalizeScene({ background: { fill } });
        expect(issues).toEqual([]);
      }
    }
    const first = suggestBackgrounds(p, "linear")[0]!;
    const hue = first.kind === "linear" ? colorToOklch(first.stops[0]!.color).h : 0;
    expect(Math.abs(((hue - p.vibrant.lch.h + 540) % 360) - 180)).toBeLessThan(25);
    expect(suggestMixed(p)).toHaveLength(6);
  });

  it("resolves auto fills deterministically, with a neutral fallback", () => {
    const fill = { kind: "auto", style: "mesh", variant: 7 } as const;
    expect(resolveAutoFill(fill, p)).toEqual(resolveAutoFill(fill, p));
    expect(resolveAutoFill(fill, null)).toEqual(resolveAutoFill(fill, NEUTRAL_PALETTE));
    expect(resolveAutoFill(fill, p)).toEqual(suggestBackgrounds(p, "mesh")[1]);
  });
});
