import { describe, expect, it } from "vitest";
import {
  colorToOklch,
  contrastRatio,
  mixColors,
  normalizeColor,
  oklabToRgb,
  oklchToHex,
  parseColor,
  rgbToOklab,
  toCss,
  toHex,
  withAlpha,
} from "@/engine/math/color";
import { containRect, coverRect, gcd, boundsOfPoints } from "@/engine/math/geometry";
import {
  IDENTITY,
  applyMat3,
  invert,
  isAffine,
  multiply,
  projectTiltPoint,
  rectToQuad,
  rotation,
  squareToQuad,
  tiltHomography,
} from "@/engine/math/matrix";
import { flattenPath, polygonArea, projectPath, roundedRectPath } from "@/engine/math/path";
import { boxesForGauss, gaussianBlurRGBA, pixelateRGBA } from "@/engine/math/blur";
import { hashBytes, hashString, mulberry32, stableStringify } from "@/engine/math/random";

describe("color", () => {
  it("parses and normalizes every accepted notation", () => {
    expect(normalizeColor("#ABC")).toBe("#aabbcc");
    expect(normalizeColor("#abcd")).toBe("#aabbccdd");
    expect(normalizeColor("#FF000080")).toBe("#ff000080");
    expect(normalizeColor("rgb(255, 0, 0)")).toBe("#ff0000");
    expect(normalizeColor("rgba(0, 0, 255, 0.5)")).toBe("#0000ff80");
    expect(normalizeColor("rgb(0 128 0 / 50%)")).toBe("#00800080");
    expect(() => parseColor("red")).toThrow();
    expect(() => parseColor("#12")).toThrow();
  });

  it("formats CSS with alpha multiplication", () => {
    expect(toCss("#ff000080", 0.5)).toBe("rgba(255, 0, 0, 0.251)");
    expect(toCss({ r: 1, g: 2, b: 3, a: 1 })).toBe("rgba(1, 2, 3, 1)");
    expect(withAlpha("#123456", 0)).toBe("#12345600");
    expect(toHex({ r: 300, g: -5, b: 12.4, a: 1 })).toBe("#ff000c");
  });

  it("round-trips sRGB through OKLab", () => {
    for (const [r, g, b] of [
      [0, 0, 0],
      [255, 255, 255],
      [255, 0, 0],
      [18, 200, 97],
      [120, 60, 240],
    ] as const) {
      const back = oklabToRgb(rgbToOklab(r, g, b));
      expect(Math.round(back.r)).toBe(r);
      expect(Math.round(back.g)).toBe(g);
      expect(Math.round(back.b)).toBe(b);
    }
    expect(rgbToOklab(255, 255, 255).L).toBeCloseTo(1, 3);
  });

  it("gamut-maps OKLCH colours into sRGB", () => {
    const hex = oklchToHex({ L: 0.7, C: 0.5, h: 150 });
    expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    const lch = colorToOklch(hex);
    expect(lch.L).toBeCloseTo(0.7, 1);
    expect(lch.C).toBeLessThan(0.5);
  });

  it("mixes perceptually and computes WCAG contrast", () => {
    expect(mixColors("#000000", "#ffffff", 0)).toBe("#000000");
    expect(mixColors("#000000", "#ffffff", 1)).toBe("#ffffff");
    const mid = colorToOklch(mixColors("#000000", "#ffffff", 0.5));
    expect(mid.L).toBeCloseTo(0.5, 2);
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5);
  });
});

describe("geometry", () => {
  it("fits with contain and cover", () => {
    const outer = { x: 0, y: 0, width: 100, height: 50 };
    expect(containRect({ width: 200, height: 200 }, outer)).toEqual({
      x: 25,
      y: 0,
      width: 50,
      height: 50,
    });
    expect(coverRect({ width: 200, height: 200 }, outer)).toEqual({
      x: 0,
      y: -25,
      width: 100,
      height: 100,
    });
    expect(coverRect({ width: 200, height: 200 }, outer, { x: 0.5, y: 0 }).y).toBe(0);
    expect(gcd(1920, 1080)).toBe(120);
    expect(boundsOfPoints([])).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});

describe("matrix", () => {
  it("maps the unit square onto an arbitrary quad and back", () => {
    const q = [
      { x: 10, y: 20 },
      { x: 110, y: 5 },
      { x: 130, y: 90 },
      { x: 0, y: 100 },
    ] as const;
    const m = squareToQuad(q[0], q[1], q[2], q[3]);
    const corners = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    corners.forEach(([x, y], i) => {
      const p = applyMat3(m, { x: x!, y: y! });
      expect(p.x).toBeCloseTo(q[i]!.x, 9);
      expect(p.y).toBeCloseTo(q[i]!.y, 9);
    });
    const inv = invert(m)!;
    const back = applyMat3(inv, applyMat3(m, { x: 0.3, y: 0.7 }));
    expect(back.x).toBeCloseTo(0.3, 9);
    expect(back.y).toBeCloseTo(0.7, 9);
    expect(isAffine(m)).toBe(false);
  });

  it("recognises affine maps and composes", () => {
    const r = rectToQuad({ x: 0, y: 0, width: 10, height: 10 }, [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 20 },
      { x: 0, y: 20 },
    ]);
    expect(isAffine(r)).toBe(true);
    expect(applyMat3(r, { x: 5, y: 5 })).toEqual({ x: 10, y: 10 });
    expect(multiply(IDENTITY, rotation(1))).toEqual(rotation(1));
    expect(invert([1, 0, 0, 0, 0, 0, 0, 0, 1])).toBeNull();
  });

  it("projects tilts with CSS-like conventions", () => {
    const t = { rotateX: 0, rotateY: 30, rotateZ: 0, perspective: 3 };
    const right = projectTiltPoint({ x: 100, y: 0 }, t, 600);
    const left = projectTiltPoint({ x: -100, y: 0 }, t, 600);
    // Positive rotateY turns the right edge away: it gets smaller.
    expect(Math.abs(right.x)).toBeLessThan(Math.abs(left.x));
    const top = projectTiltPoint({ x: 50, y: -100 }, { ...t, rotateY: 0, rotateX: 30 }, 600);
    const bottom = projectTiltPoint({ x: 50, y: 100 }, { ...t, rotateY: 0, rotateX: 30 }, 600);
    // Positive rotateX tips the top away: the top edge is narrower.
    expect(Math.abs(top.x)).toBeLessThan(Math.abs(bottom.x));
    // No tilt: the homography is a pure translation to the centre.
    const flat = tiltHomography(200, 100, { rotateX: 0, rotateY: 0, rotateZ: 0, perspective: 3 });
    expect(isAffine(flat)).toBe(true);
    expect(applyMat3(flat, { x: 0, y: 0 })).toEqual({ x: -100, y: -50 });
  });
});

describe("path", () => {
  const r = { x: 0, y: 0, width: 200, height: 100 };

  it("draws circular corners when smoothing is 0", () => {
    const poly = flattenPath(roundedRectPath(r, 20, 0), 64)[0]!;
    const expected = 200 * 100 - (4 - Math.PI) * 20 * 20;
    expect(Math.abs(polygonArea(poly))).toBeCloseTo(expected, -1);
  });

  it("smoothed (squircle) corners remove more area than circular ones", () => {
    const circ = Math.abs(polygonArea(flattenPath(roundedRectPath(r, 20, 0), 64)[0]!));
    const smooth = Math.abs(polygonArea(flattenPath(roundedRectPath(r, 20, 0.6), 64)[0]!));
    expect(smooth).toBeLessThan(circ);
    expect(smooth).toBeGreaterThan(200 * 100 - 4 * 30 * 30);
  });

  it("stays within its rectangle and joins arcs to curves without gaps", () => {
    for (const sm of [0, 0.3, 0.6, 1]) {
      const path = roundedRectPath(r, [0, 30, 60, 10], sm);
      const poly = flattenPath(path, 24)[0]!;
      for (const p of poly) {
        expect(p.x).toBeGreaterThanOrEqual(-1e-6);
        expect(p.x).toBeLessThanOrEqual(200 + 1e-6);
        expect(p.y).toBeGreaterThanOrEqual(-1e-6);
        expect(p.y).toBeLessThanOrEqual(100 + 1e-6);
      }
      // Every arc starts where the previous segment ended.
      let pen = { x: 0, y: 0 };
      for (const c of path) {
        if (c.op === "A") {
          expect(c.cx + c.r * Math.cos(c.a0)).toBeCloseTo(pen.x, 6);
          expect(c.cy + c.r * Math.sin(c.a0)).toBeCloseTo(pen.y, 6);
          pen = { x: c.cx + c.r * Math.cos(c.a1), y: c.cy + c.r * Math.sin(c.a1) };
        } else if (c.op !== "Z") {
          pen = { x: c.x, y: c.y };
        }
      }
    }
  });

  it("clamps oversized radii to half the shorter side", () => {
    const poly = flattenPath(roundedRectPath(r, 500, 0), 64)[0]!;
    // A stadium: area = rect minus corners of radius 50.
    expect(Math.abs(polygonArea(poly))).toBeCloseTo(200 * 100 - (4 - Math.PI) * 50 * 50, -1);
    expect(roundedRectPath({ x: 0, y: 0, width: 0, height: 10 }, 5)).toEqual([]);
  });

  it("projects paths through a homography", () => {
    const m = rectToQuad(r, [
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { x: 400, y: 200 },
      { x: 0, y: 200 },
    ]);
    const projected = projectPath(roundedRectPath(r, 0), m);
    const poly = flattenPath(projected)[0]!;
    expect(Math.abs(polygonArea(poly))).toBeCloseTo(400 * 200, 3);
  });
});

describe("blur and pixelate", () => {
  it("chooses box sizes approximating a Gaussian", () => {
    const boxes = boxesForGauss(10);
    expect(boxes).toHaveLength(3);
    const variance = boxes.reduce((s, w) => s + (w * w - 1) / 12, 0);
    expect(Math.sqrt(variance)).toBeCloseTo(10, 0);
  });

  it("leaves a flat image unchanged and preserves the mean", () => {
    const w = 32;
    const h = 16;
    const flat = new Uint8ClampedArray(w * h * 4).fill(200);
    gaussianBlurRGBA(flat, w, h, 5);
    expect(new Set(flat)).toEqual(new Set([200]));
    const noisy = new Uint8ClampedArray(w * h * 4);
    const rng = mulberry32(3);
    for (let i = 0; i < noisy.length; i++) noisy[i] = i % 4 === 3 ? 255 : Math.floor(rng() * 256);
    const mean = (d: Uint8ClampedArray) => {
      let s = 0;
      for (let i = 0; i < d.length; i += 4) s += d[i]!;
      return s / (d.length / 4);
    };
    const before = mean(noisy);
    gaussianBlurRGBA(noisy, w, h, 3);
    expect(mean(noisy)).toBeCloseTo(before, -1);
  });

  it("pixelates into uniform blocks", () => {
    const w = 8;
    const h = 8;
    const d = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      d[i * 4] = i * 3;
      d[i * 4 + 3] = 255;
    }
    pixelateRGBA(d, w, h, 4);
    expect(d[0]).toBe(d[(3 * w + 3) * 4]);
    expect(d[0]).not.toBe(d[(4 * w + 4) * 4]);
  });
});

describe("random and hashing", () => {
  it("is deterministic", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
    expect(hashString("shotcandy")).toBe(hashString("shotcandy"));
  });

  it("hashes bytes stably and distinctly", () => {
    const x = new Uint8Array(1000).map((_, i) => i % 251);
    const y = x.slice();
    y[999] = 7;
    expect(hashBytes(x)).toBe(hashBytes(x.slice()));
    expect(hashBytes(x)).not.toBe(hashBytes(y));
    expect(hashBytes(new Uint8Array())).toMatch(/^[0-9a-f]{32}$/);
  });

  it("stringifies with sorted keys", () => {
    expect(stableStringify({ b: 1, a: [2, { d: 1, c: undefined }] })).toBe(
      '{"a":[2,{"d":1}],"b":1}',
    );
  });
});
