/**
 * Rendering multi-screen designs in Node (@napi-rs/canvas): every screen is
 * drawn where the layout says, back to front, with its own image; empty
 * screens are skipped or drawn as placeholders; single designs are untouched.
 */
import { createCanvas } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import {
  MapAssetResolver,
  RenderCache,
  STYLE_PRESETS,
  applyStylePatch,
  createScene,
  evaluateFrame,
  getStylePreset,
  layoutGroupScene,
  listMotionPresets,
  renderToCanvas,
  setIn,
  type AssetSource,
  type LayoutId,
  type Point,
  type Scene,
} from "@/engine";
import { parseColor } from "@/engine/math/color";
import { applyMat3 } from "@/engine/math/matrix";
import { nodeEnv, pixel, pixelsOf } from "../helpers/node-canvas";

function solid(id: string, width: number, height: number, color: string): AssetSource {
  const c = createCanvas(width, height);
  const g = c.getContext("2d");
  g.fillStyle = color;
  g.fillRect(0, 0, width, height);
  return {
    id,
    width,
    height,
    images: [{ image: c as unknown as CanvasImageSource, width, height }],
  };
}

const COLORS = {
  r: "#e11d48",
  g: "#16a34a",
  b: "#2563eb",
  y: "#eab308",
  m: "#9333ea",
  c: "#0891b2",
};
const assets = new MapAssetResolver([
  solid("r", 400, 800, COLORS.r),
  solid("g", 400, 800, COLORS.g),
  solid("b", 800, 500, COLORS.b),
  solid("y", 800, 500, COLORS.y),
  solid("m", 400, 800, COLORS.m),
  solid("c", 800, 500, COLORS.c),
]);
const BG = "#204060";

function group(id: LayoutId, ids: (string | null)[], patch: (s: Scene) => Scene = (s) => s): Scene {
  let s = createScene({ content: { kind: "image", assetId: ids[0]! } });
  s = setIn(s, ["canvas"], { size: { kind: "fixed", width: 1200, height: 800 }, padding: 80 });
  s = setIn(s, ["background", "fill"], { kind: "solid", color: BG });
  s = setIn(s, ["card", "shadow", "preset"], "none");
  s = setIn(s, ["card", "radius"], 0);
  return patch({
    ...s,
    layout: { id, count: ids.length },
    slots: ids.slice(1).map((assetId) => ({ assetId })),
  });
}

function render(scene: Scene, opts: { scale?: number; emptySlots?: "skip" | "placeholder" } = {}) {
  return renderToCanvas(scene, assets, { env: nodeEnv, cache: new RenderCache(), ...opts });
}

function hash(buf: Uint8ClampedArray): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < buf.length; i++) h = Math.imul(h ^ buf[i]!, 0x01000193);
  return (h >>> 0).toString(16);
}

function expectColor(px: number[], hex: string, tol = 4) {
  const c = parseColor(hex);
  const want = [c.r, c.g, c.b];
  for (let i = 0; i < 3; i++)
    expect(Math.abs(px[i]! - want[i]!), `channel ${i}: ${px} vs ${hex}`).toBeLessThanOrEqual(tol);
}

/** Canvas point at normalized content coordinates (u, v) of screen i. */
function at(scene: Scene, i: number, u = 0.5, v = 0.5): Point {
  const sl = layoutGroupScene(scene, assets)!.slots[i]!;
  const c = sl.card.content;
  return applyMat3(sl.cardToCanvas, { x: c.x + u * c.width, y: c.y + v * c.height });
}

describe("multi-screen rendering", () => {
  const cases: [LayoutId, string[]][] = [
    ["side-by-side", ["r", "g", "m"]],
    ["overlap", ["b", "y"]],
    ["hero", ["r", "g", "m"]],
    ["cascade", ["b", "y", "c", "r"]],
    ["fan", ["r", "g", "m", "b", "y"]],
    ["grid", ["r", "g", "b", "y", "m", "c"]],
  ];
  for (const [id, ids] of cases) {
    it(`${id}: each screen shows its own image, and renders are deterministic`, () => {
      const s = group(id, ids);
      const a = render(s);
      for (let i = 0; i < ids.length; i++) {
        // A point near the visible corner of each screen (fronts cover backs' centres).
        const p = at(s, i, 0.5, 0.5);
        const g = layoutGroupScene(s, assets)!;
        const front = g.order.indexOf(i) === g.order.length - 1;
        if (id === "side-by-side" || id === "grid" || front) {
          expectColor(pixel(a.canvas, p.x, p.y), COLORS[ids[i] as keyof typeof COLORS]);
        }
      }
      const b = render(s);
      expect(hash(pixelsOf(b.canvas))).toBe(hash(pixelsOf(a.canvas)));
    });
  }

  it("draws back to front: where screens overlap the front one shows", () => {
    const s = group("cascade", ["b", "y", "c"]);
    const g = layoutGroupScene(s, assets)!;
    const out = render(s);
    // Screen 1's centre is covered by screen 0 (in front).
    const p = at(s, 1, 0.3, 0.7);
    const inFront = g.slots[0]!;
    const q = inFront.canvasToCard ? applyMat3(inFront.canvasToCard, p) : null;
    expect(
      q && q.x > 0 && q.y > 0 && q.x < inFront.card.size.width && q.y < inFront.card.size.height,
    ).toBe(true);
    expectColor(pixel(out.canvas, p.x, p.y), COLORS.b);
    // Its top-right corner peeks out.
    const peek = at(s, 1, 0.95, 0.05);
    expectColor(pixel(out.canvas, peek.x, peek.y), COLORS.y);
  });

  it("empty screens are skipped for export and drawn faintly for the editor", () => {
    const s = group("side-by-side", ["r", null, "m"]);
    const p = at(s, 1);
    const skip = render(s);
    expectColor(pixel(skip.canvas, p.x, p.y), BG);
    const ph = render(s, { emptySlots: "placeholder" });
    const px = pixel(ph.canvas, p.x + 60, p.y + 60);
    const bg = parseColor(BG);
    const diff = Math.abs(px[0]! - bg.r) + Math.abs(px[1]! - bg.g) + Math.abs(px[2]! - bg.b);
    expect(diff).toBeGreaterThan(4);
    expect(diff).toBeLessThan(90);
    // The other screens are identical either way.
    const q = at(s, 2);
    expect(pixel(ph.canvas, q.x, q.y)).toEqual(pixel(skip.canvas, q.x, q.y));
  });

  it("stack ghosts are not drawn behind a group", () => {
    const s = group("side-by-side", ["r", "g"]);
    const stacked = setIn(s, ["card", "stack"], {
      count: 3,
      x: 0,
      y: -40,
      rotate: 4,
      shrink: 0.05,
      color: "#ffffff",
    });
    expect(hash(pixelsOf(render(stacked).canvas))).toBe(hash(pixelsOf(render(s).canvas)));
  });

  it("reflections are drawn under side-by-side screens, not under a fan", () => {
    const refl = { opacity: 0.6, height: 0.5, gap: 4 };
    const sbs = group("side-by-side", ["r", "g"], (s) => setIn(s, ["card", "reflection"], refl));
    const g = layoutGroupScene(sbs, assets)!;
    const q = g.slots[0]!.cardQuad;
    const below = { x: (q[2].x + q[3].x) / 2, y: q[2].y + 12 };
    const px = pixel(render(sbs).canvas, below.x, below.y);
    const bg = parseColor(BG);
    expect(Math.abs(px[0]! - bg.r) + Math.abs(px[1]! - bg.g)).toBeGreaterThan(10);
    const fan = group("fan", ["r", "g", "m"]);
    const withRefl = setIn(fan, ["card", "reflection"], refl);
    expect(hash(pixelsOf(render(withRefl).canvas))).toBe(hash(pixelsOf(render(fan).canvas)));
  });

  it("a single layout, stored screens or not, renders exactly like a plain scene", () => {
    const plain = group("side-by-side", ["r"]);
    const { layout: _l, slots: _s, ...bare } = plain;
    const base = render(bare as Scene);
    const withSlots = { ...(bare as Scene), slots: [{ assetId: "g" }, { assetId: "m" }] };
    expect(hash(pixelsOf(render(withSlots).canvas))).toBe(hash(pixelsOf(base.canvas)));
  });

  it("a recording ignores the layout", () => {
    const s = group("side-by-side", ["r", "g"], (x) => ({
      ...x,
      content: {
        kind: "image",
        assetId: "r",
        clip: { duration: 4, start: 0, end: 4, audio: false, muted: false },
      },
    }));
    const { layout: _l, slots: _s, ...bare } = s;
    expect(hash(pixelsOf(render(s).canvas))).toBe(hash(pixelsOf(render(bare as Scene).canvas)));
  });

  it("every style preset renders a group, and keeps it a group", () => {
    const s = group("hero", ["r", "g", "m"]);
    for (const p of STYLE_PRESETS) {
      const styled = applyStylePatch(s, p.patch, p.id);
      expect(styled.layout, p.id).toBe(s.layout);
      const out = renderToCanvas(styled, assets, {
        env: nodeEnv,
        cache: new RenderCache(),
        scale: 0.15,
      });
      expect(out.width, p.id).toBeGreaterThan(0);
    }
  });

  it("scales exactly: 2x renders are twice the size", () => {
    const s = group("grid", ["r", "g", "b", "y"], (x) =>
      setIn(x, ["canvas", "size"], { kind: "auto" }),
    );
    const one = render(s);
    const two = render(s, { scale: 2 });
    expect([two.width, two.height]).toEqual([one.width * 2, one.height * 2]);
  });

  it("every motion preset animates a group without errors, keeping one canvas size", () => {
    const s = applyStylePatch(group("fan", ["r", "g", "m"]), getStylePreset("sherbet")!.patch);
    for (const m of listMotionPresets()) {
      const anim: Scene = {
        ...s,
        animation: {
          preset: m.id,
          duration: 2,
          fps: 10,
          easing: "smooth",
          loop: "once",
          intensity: 1,
          annotations: true,
          focusX: 0.5,
          focusY: 0.5,
        },
      };
      const sizes = new Set<string>();
      for (const n of [0, 7, 13]) {
        const pose = evaluateFrame(anim, n, { assets });
        const out = renderToCanvas(pose, assets, {
          env: nodeEnv,
          cache: new RenderCache(),
          scale: 0.25,
        });
        sizes.add(`${out.width}x${out.height}`);
      }
      expect(sizes.size, m.id).toBe(1);
    }
  });
});
