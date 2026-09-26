/**
 * Canvas rendering tests in Node (@napi-rs/canvas = Skia, like Chrome).
 * They probe pixels to prove each layer and control does what it claims, and
 * that output is deterministic. Pixel-exact visual baselines live in the
 * Playwright suite (tests/e2e/visual.spec.ts), which renders in a real browser.
 */
import { describe, expect, it } from "vitest";
import {
  MapAssetResolver,
  RenderCache,
  computeLayout,
  contentToCanvas,
  createAnnotation,
  createScene,
  renderToCanvas,
  setIn,
  type AssetResolver,
  type BackgroundFill,
  type Scene,
} from "@/engine";
import { parseColor } from "@/engine/math/color";
import { nodeEnv, pixel, pixelsOf, syntheticScreenshot } from "../helpers/node-canvas";

const shot = syntheticScreenshot(800, 500);
const assets: AssetResolver = new MapAssetResolver([shot]);

/** Plain scene: solid bg, no shadow, no radius, fixed 1000x700 canvas. */
function base(patch: (s: Scene) => Scene = (s) => s): Scene {
  let s = createScene({ content: { kind: "image", assetId: shot.id } });
  s = setIn(s, ["canvas"], { size: { kind: "fixed", width: 1000, height: 700 }, padding: 100 });
  s = setIn(s, ["background", "fill"], { kind: "solid", color: "#204060" });
  s = setIn(s, ["card", "shadow", "preset"], "none");
  s = setIn(s, ["card", "radius"], 0);
  return patch(s);
}

function render(scene: Scene, scale = 1) {
  return renderToCanvas(scene, assets, { env: nodeEnv, cache: new RenderCache(), scale });
}

const rgb = (hex: string) => {
  const c = parseColor(hex);
  return [c.r, c.g, c.b];
};
function expectColor(px: number[], hex: string, tol = 3) {
  const want = rgb(hex);
  for (let i = 0; i < 3; i++)
    expect(Math.abs(px[i]! - want[i]!), `channel ${i}: ${px} vs ${hex}`).toBeLessThanOrEqual(tol);
}
const lum = (p: number[]) => 0.2126 * p[0]! + 0.7152 * p[1]! + 0.0722 * p[2]!;
function hash(buf: Uint8ClampedArray): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < buf.length; i++) h = Math.imul(h ^ buf[i]!, 0x01000193);
  return (h >>> 0).toString(16);
}

describe("determinism", () => {
  const rich = base((s) => ({
    ...setIn(
      setIn(
        setIn(s, ["background"], {
          fill: {
            kind: "mesh",
            base: "#fde2e4",
            points: [
              { x: 0.1, y: 0.1, color: "#a78bfa", radius: 0.5 },
              { x: 0.9, y: 0.9, color: "#5eead4", radius: 0.5 },
            ],
          },
          grain: { amount: 0.3, size: 1, seed: 9 },
        }),
        ["card", "shadow"],
        { preset: "deep", strength: 1, color: "#000" },
      ),
      ["card", "frame", "id"],
      "macos",
    ),
    annotations: [createAnnotation("arrow", "a"), createAnnotation("redact", "r")],
  }));

  it("renders identical pixels for identical input", () => {
    expect(hash(pixelsOf(render(rich).canvas))).toBe(hash(pixelsOf(render(rich).canvas)));
  });

  it("caching never changes output", () => {
    const cache = new RenderCache();
    const a = renderToCanvas(rich, assets, { env: nodeEnv, cache });
    const b = renderToCanvas(rich, assets, { env: nodeEnv, cache });
    expect(cache.hits).toBeGreaterThan(0);
    expect(hash(pixelsOf(a.canvas))).toBe(hash(pixelsOf(b.canvas)));
    expect(hash(pixelsOf(a.canvas))).toBe(hash(pixelsOf(render(rich).canvas)));
  });

  it("tilted renders are deterministic too", () => {
    const t = setIn(rich, ["card", "tilt"], {
      rotateX: 12,
      rotateY: -20,
      rotateZ: 0,
      perspective: 2.5,
    });
    expect(hash(pixelsOf(render(t).canvas))).toBe(hash(pixelsOf(render(t).canvas)));
  });
});

describe("output size", () => {
  it("matches the canvas spec at every scale", () => {
    for (const scale of [1, 2, 3]) {
      const r = render(base(), scale);
      expect([r.width, r.height]).toEqual([1000 * scale, 700 * scale]);
      expect([
        (r.canvas as { width: number }).width,
        (r.canvas as { height: number }).height,
      ]).toEqual([1000 * scale, 700 * scale]);
    }
    const auto = render(setIn(base(), ["canvas", "size"], { kind: "auto" }));
    expect([auto.width, auto.height]).toEqual([960, 660]); // 800x500 + 2x100cu at 0.8 px/cu
  });
});

describe("background layer", () => {
  const corner = (fill: BackgroundFill, x = 2, y = 2) =>
    pixel(render(setIn(base(), ["background", "fill"], fill)).canvas, x, y);

  it("solid", () => expectColor(corner({ kind: "solid", color: "#ff8800" }), "#ff8800"));

  it("none is transparent", () => expect(corner({ kind: "none" })[3]).toBe(0));

  it("linear follows CSS angles", () => {
    const fill: BackgroundFill = {
      kind: "linear",
      angle: 90,
      stops: [
        { offset: 0, color: "#ff0000" },
        { offset: 1, color: "#0000ff" },
      ],
    };
    expectColor(corner(fill, 1, 350), "#ff0000", 4);
    expectColor(corner(fill, 998, 350), "#0000ff", 4);
    const down: BackgroundFill = { ...fill, angle: 180 };
    expectColor(corner(down, 500, 1), "#ff0000", 4);
  });

  it("radial centres its first stop", () => {
    const fill: BackgroundFill = {
      kind: "radial",
      cx: 0.05,
      cy: 0.05,
      radius: 1,
      stops: [
        { offset: 0, color: "#ffffff" },
        { offset: 1, color: "#000000" },
      ],
    };
    expectColor(corner(fill, 50, 35), "#ffffff", 6);
    expect(lum(corner(fill, 998, 698))).toBeLessThan(40);
  });

  it("conic starts at 12 o'clock", () => {
    const fill: BackgroundFill = {
      kind: "conic",
      cx: 0.5,
      cy: 0.5,
      angle: 0,
      stops: [
        { offset: 0, color: "#ff0000" },
        { offset: 0.5, color: "#00ff00" },
        { offset: 1, color: "#ff0000" },
      ],
    };
    // Straight below the centre is half-way round: green.
    expectColor(corner(fill, 500, 690), "#00ff00", 12);
  });

  it("mesh colours sit at their points", () => {
    const fill: BackgroundFill = {
      kind: "mesh",
      base: "#ffffff",
      points: [
        { x: 0.02, y: 0.02, color: "#ff0000", radius: 0.2 },
        { x: 0.98, y: 0.98, color: "#0000ff", radius: 0.2 },
      ],
    };
    const tl = corner(fill, 20, 14);
    const br = corner(fill, 980, 686);
    expect(tl[0]).toBeGreaterThan(200);
    expect(tl[2]).toBeLessThan(100);
    expect(br[2]).toBeGreaterThan(200);
    expect(br[0]).toBeLessThan(100);
  });

  it("image fills cover the canvas, blur softens and tint lightens", () => {
    const img = syntheticScreenshot(300, 300, "#00ff00");
    const withImg = new MapAssetResolver([shot, img]);
    const fill = (blur: number, tint: number): BackgroundFill => ({
      kind: "image",
      assetId: img.id,
      fit: "cover",
      blur,
      tint,
      focusX: 0.5,
      focusY: 0.5,
    });
    const r = (f: BackgroundFill) =>
      renderToCanvas(setIn(base(), ["background", "fill"], f), withImg, {
        env: nodeEnv,
        cache: new RenderCache(),
      }).canvas;
    // The top-left of the synthetic image is its light sidebar.
    expectColor(pixel(r(fill(0, 0)), 5, 5), "#f1f5f9", 3);
    const sharp = pixelsOf(r(fill(0, 0)));
    const blurred = pixelsOf(r(fill(40, 0)));
    const variance = (d: Uint8ClampedArray) => {
      let s = 0;
      let s2 = 0;
      let n = 0;
      for (let y = 0; y < 100; y++)
        for (let x = 0; x < 1000; x += 7) {
          const v = d[(y * 1000 + x) * 4 + 1]!;
          s += v;
          s2 += v * v;
          n++;
        }
      return s2 / n - (s / n) ** 2;
    };
    expect(variance(blurred)).toBeLessThan(variance(sharp) * 0.8);
    expect(lum(pixel(r(fill(0, 0.5)), 500, 20))).toBeGreaterThan(
      lum(pixel(r(fill(0, 0)), 500, 20)),
    );
  });

  it("auto fills derive from the screenshot palette", () => {
    const blue = syntheticScreenshot(800, 500, "#2563eb");
    const red = syntheticScreenshot(800, 500, "#dc2626");
    const bgOf = (a: typeof blue) => {
      const s = setIn(setIn(base(), ["content", "assetId"], a.id), ["background", "fill"], {
        kind: "auto",
        style: "solid",
        variant: 0,
      });
      return pixel(
        renderToCanvas(s, new MapAssetResolver([a]), { env: nodeEnv, cache: new RenderCache() })
          .canvas,
        3,
        3,
      );
    };
    const b = bgOf(blue);
    const r = bgOf(red);
    expect(b[2]).toBeGreaterThan(b[0]!);
    expect(r[0]).toBeGreaterThan(r[2]!);
  });

  it("grain adds seeded texture only when enabled", () => {
    const g = (amount: number, seed: number) =>
      pixelsOf(render(setIn(base(), ["background", "grain"], { amount, size: 1, seed })).canvas);
    const plain = g(0, 1);
    expect(hash(g(0.5, 1))).not.toBe(hash(plain));
    expect(hash(g(0.5, 1))).toBe(hash(g(0.5, 1)));
    expect(hash(g(0.5, 2))).not.toBe(hash(g(0.5, 1)));
  });
});

describe("card layers", () => {
  const l = computeLayout(base(), { width: 800, height: 500 });
  const at = (u: number, v: number) => contentToCanvas(l, u, v);

  it("draws the screenshot pixel-true in the content rect", () => {
    const c = render(base()).canvas;
    const p = at(0.05, 0.5); // sidebar
    expectColor(pixel(c, p.x, p.y), "#f1f5f9", 2);
    const q = at(0.4, 0.14); // accent button
    expectColor(pixel(c, q.x, q.y), "#3b82f6", 2);
  });

  it("rounds corners (and continuous corners cut deeper)", () => {
    const tl = at(0, 0);
    const probe = { x: tl.x + 4, y: tl.y + 4 };
    const square = pixel(render(base()).canvas, probe.x, probe.y);
    const round = pixel(render(setIn(base(), ["card", "radius"], 60)).canvas, probe.x, probe.y);
    expectColor(square, "#f1f5f9", 2);
    expectColor(round, "#204060", 2);
    // Continuous corners remove more of the corner box than circular ones.
    const r = Math.ceil(60 * l.k);
    const coverage = (smoothing: number) => {
      const c = render(
        setIn(setIn(base(), ["card", "radius"], 60), ["card", "smoothing"], smoothing),
      ).canvas;
      const d = pixelsOf(c);
      let n = 0;
      for (let y = Math.round(tl.y); y < tl.y + r; y++)
        for (let x = Math.round(tl.x); x < tl.x + r; x++) if (d[(y * 1000 + x) * 4 + 1]! > 150) n++;
      return n;
    };
    expect(coverage(1)).toBeLessThan(coverage(0) - 20);
  });

  it("casts shadows below the card", () => {
    const s = setIn(base(), ["card", "shadow"], {
      preset: "deep",
      strength: 1.5,
      color: "#000000",
    });
    const below = at(0.5, 1);
    const above = at(0.5, 0);
    const c = render(s).canvas;
    const bgL = lum(rgb("#204060"));
    const belowL = lum(pixel(c, below.x, below.y + 12));
    const aboveL = lum(pixel(c, above.x, above.y - 12));
    expect(belowL).toBeLessThan(bgL - 5);
    expect(belowL).toBeLessThan(aboveL);
    expectColor(pixel(render(base()).canvas, below.x, below.y + 12), "#204060", 1);
  });

  it("paints the border ring and inset plate", () => {
    const bordered = setIn(base(), ["card", "border"], { width: 20, color: "#ff00ff" });
    const lb = computeLayout(bordered, { width: 800, height: 500 });
    const tl = contentToCanvas(lb, 0, 0);
    expectColor(pixel(render(bordered).canvas, tl.x - 20 * lb.k * 0.5, tl.y + 50), "#ff00ff", 2);
    const inset = setIn(base(), ["card", "inset"], { width: 40, color: "#00ffff" });
    const li = computeLayout(inset, { width: 800, height: 500 });
    const itl = contentToCanvas(li, 0, 0);
    expectColor(pixel(render(inset).canvas, itl.x - 40 * li.k * 0.5, itl.y + 50), "#00ffff", 2);
    // "auto" extends the screenshot's edge colour.
    const auto = setIn(inset, ["card", "inset", "color"], "auto");
    const edgePx = pixel(render(auto).canvas, itl.x - 40 * li.k * 0.5, itl.y + 50);
    expect(lum(edgePx)).toBeGreaterThan(200);
  });
});

describe("frames", () => {
  const framed = (id: string, theme: "light" | "dark" = "light") =>
    base((s) => setIn(setIn(s, ["card", "frame", "id"], id), ["card", "frame", "theme"], theme));

  it("macOS window: title bar with traffic lights above the content", () => {
    const s = framed("macos");
    const l = computeLayout(s, { width: 800, height: 500 });
    const c = render(s).canvas;
    const barY = l.cardQuad[0].y + l.card.content.y * l.k * 0.5;
    const red = pixel(c, l.cardQuad[0].x + 13.9 * l.k, barY);
    expect(red[0]).toBeGreaterThan(220);
    expect(red[1]).toBeLessThan(130);
    const bar = pixel(c, l.cardQuad[0].x + l.card.size.width * l.k * 0.5, barY);
    expect(lum(bar)).toBeGreaterThan(225);
    const dark = pixel(
      render(framed("macos", "dark")).canvas,
      l.cardQuad[0].x + l.card.size.width * l.k * 0.5,
      barY,
    );
    expect(lum(dark)).toBeLessThan(70);
  });

  it("devices draw a dark bezel around the screen", () => {
    for (const id of ["phone", "tablet", "laptop"]) {
      const s = framed(id);
      const l = computeLayout(s, { width: 800, height: 500 });
      const tl = contentToCanvas(l, 0, 0.5);
      const bezel = pixel(render(s).canvas, tl.x - 3, tl.y);
      expect(lum(bezel), id).toBeLessThan(40);
    }
  });

  it("browser shows an address field", () => {
    const s = base((x) =>
      setIn(
        setIn(x, ["card", "frame", "id"], "browser"),
        ["card", "frame", "url"],
        "shotcandy.app",
      ),
    );
    const l = computeLayout(s, { width: 800, height: 500 });
    const mid = { x: 500, y: l.cardQuad[0].y + l.card.content.y * l.k * 0.5 };
    expect(lum(pixel(render(s).canvas, mid.x + 60, mid.y - 6))).toBeGreaterThan(245);
  });
});

describe("annotations", () => {
  const l = computeLayout(base(), { width: 800, height: 500 });

  it("arrow, box and text paint where they are placed", () => {
    const arrow = {
      ...createAnnotation("arrow", "a"),
      x1: 0.3,
      y1: 0.8,
      x2: 0.7,
      y2: 0.8,
      color: "#ff0000",
      width: 10,
    };
    const rect = {
      ...createAnnotation("rect", "r"),
      x: 0.1,
      y: 0.1,
      w: 0.2,
      h: 0.2,
      color: "#00ff00",
      width: 8,
      radius: 0,
    };
    const text = {
      ...createAnnotation("text", "t"),
      x: 0.5,
      y: 0.45,
      text: "████",
      color: "#0000ff",
      size: 60,
    };
    const c = render({ ...base(), annotations: [arrow, rect, text] }).canvas;
    const ap = contentToCanvas(l, 0.5, 0.8);
    expectColor(pixel(c, ap.x, ap.y), "#ff0000", 2);
    const rp = contentToCanvas(l, 0.1, 0.2);
    expectColor(pixel(c, rp.x, rp.y), "#00ff00", 2);
    const inside = contentToCanvas(l, 0.2, 0.2);
    expect(pixel(c, inside.x, inside.y)).not.toEqual(pixel(c, rp.x, rp.y));
    const tp = contentToCanvas(l, 0.5, 0.45);
    const tpx = pixel(c, tp.x, tp.y);
    expect(tpx[2]).toBeGreaterThan(tpx[0]! + 80);
  });

  it("canvas-anchored annotations use canvas coordinates", () => {
    const a = {
      ...createAnnotation("rect", "r"),
      anchor: "canvas" as const,
      style: "fill" as const,
      x: 0,
      y: 0,
      w: 0.1,
      h: 0.1,
      color: "#ffff00",
    };
    const p = pixel(render({ ...base(), annotations: [a] }).canvas, 20, 20);
    expect(p[0]).toBeGreaterThan(p[2]! + 20);
  });

  it("spotlight dims everything outside the highlight", () => {
    const a = {
      ...createAnnotation("rect", "r"),
      style: "spotlight" as const,
      x: 0.4,
      y: 0.4,
      w: 0.2,
      h: 0.2,
    };
    const c = render({ ...base(), annotations: [a] }).canvas;
    const plain = render(base()).canvas;
    const out = contentToCanvas(l, 0.05, 0.5);
    const inn = contentToCanvas(l, 0.5, 0.5);
    expect(lum(pixel(c, out.x, out.y))).toBeLessThan(lum(pixel(plain, out.x, out.y)) - 40);
    expect(pixel(c, inn.x, inn.y)).toEqual(pixel(plain, inn.x, inn.y));
  });

  it("redaction blurs and pixelates only its region", () => {
    const region = { x: 0.25, y: 0.2, w: 0.5, h: 0.3 };
    const blur = {
      ...createAnnotation("redact", "b"),
      ...region,
      mode: "blur" as const,
      strength: 20,
    };
    const pix = { ...blur, id: "p", mode: "pixelate" as const, strength: 30 };
    const plain = render(base()).canvas;
    const blurred = render({ ...base(), annotations: [blur] }).canvas;
    const pixelated = render({ ...base(), annotations: [pix] }).canvas;
    // The accent button's crisp edge (inside the region) gets softened.
    const edge = contentToCanvas(l, 0.28, 0.14 + 0.08);
    expect(pixel(blurred, edge.x, edge.y - 1)).not.toEqual(pixel(plain, edge.x, edge.y - 1));
    const outside = contentToCanvas(l, 0.1, 0.9);
    expect(pixel(blurred, outside.x, outside.y)).toEqual(pixel(plain, outside.x, outside.y));
    // Pixelation: neighbouring pixels inside one block are identical.
    const pp = contentToCanvas(l, 0.5, 0.35);
    expect(pixel(pixelated, pp.x, pp.y)).toEqual(pixel(pixelated, pp.x + 1, pp.y + 1));
  });
});

describe("3D tilt", () => {
  const tilted = setIn(base(), ["card", "tilt"], {
    rotateX: 10,
    rotateY: -25,
    rotateZ: 0,
    perspective: 2.5,
  });
  const l = computeLayout(tilted, { width: 800, height: 500 });
  const c = render(tilted).canvas;

  it("warps the card into its projected quad without seams", () => {
    // A row through the middle of the card: every pixel between the quad's
    // edges is card content (never background showing through a seam).
    const mid = contentToCanvas(l, 0.5, 0.6);
    const left = contentToCanvas(l, 0.02, 0.6);
    const right = contentToCanvas(l, 0.98, 0.6);
    const row = pixelsOf(c);
    const y = Math.round(mid.y);
    const bg = rgb("#204060");
    for (let x = Math.ceil(left.x); x < Math.floor(right.x); x++) {
      const i = (y * 1000 + x) * 4;
      const isBg =
        Math.abs(row[i]! - bg[0]!) < 3 &&
        Math.abs(row[i + 1]! - bg[1]!) < 3 &&
        Math.abs(row[i + 2]! - bg[2]!) < 3;
      expect(isBg, `seam at x=${x}`).toBe(false);
    }
  });

  it("maps content to the right place under perspective", () => {
    const q = contentToCanvas(l, 0.4, 0.14);
    expectColor(pixel(c, q.x, q.y), "#3b82f6", 12);
    expectColor(pixel(c, 3, 3), "#204060", 1);
  });

  it("in-plane rotation keeps the content intact", () => {
    const rot = setIn(base(), ["card", "tilt", "rotateZ"], 10);
    const lr = computeLayout(rot, { width: 800, height: 500 });
    const q = contentToCanvas(lr, 0.4, 0.14);
    expectColor(pixel(render(rot).canvas, q.x, q.y), "#3b82f6", 4);
  });
});
