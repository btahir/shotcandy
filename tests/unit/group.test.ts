/**
 * Multi-screen layout geometry (layout/group.ts): placement of every layout,
 * mixed shapes, bounding boxes, composition and hit-testing.
 */
import { describe, expect, it } from "vitest";
import {
  GROUP_MAX_SIDE,
  LAYOUTS,
  MapAssetResolver,
  balanceSizes,
  createScene,
  fanPositions,
  layoutGroupScene,
  layoutScene,
  setIn,
  slotAt,
  slotRects,
  type GroupLayout,
  type LayoutId,
  type Point,
  type Rect,
  type Scene,
  type SlotLayout,
} from "@/engine";
import { boundsOfPoints } from "@/engine/math/geometry";

const src = (id: string, width: number, height: number) => ({ id, width, height, images: [] });
const assets = new MapAssetResolver([
  src("d1", 2880, 1800),
  src("d2", 2880, 1800),
  src("d3", 2880, 1800),
  src("d4", 2880, 1800),
  src("d5", 2880, 1800),
  src("d6", 2880, 1800),
  src("p1", 1170, 2532),
  src("p2", 1170, 2532),
  src("p3", 1170, 2532),
  src("big", 8000, 5000),
  src("s1", 1440, 900),
  src("s2", 1440, 900),
]);

/** A plain group scene: no shadow, no frame, padding 80 cu. */
function group(id: LayoutId, ids: (string | null)[], patch: (s: Scene) => Scene = (s) => s): Scene {
  let s = createScene({ content: { kind: "image", assetId: ids[0]! } });
  s = setIn(s, ["card", "shadow", "preset"], "none");
  s = {
    ...s,
    layout: { id, count: ids.length },
    slots: ids.slice(1).map((assetId) => ({ assetId })),
  };
  return patch(s);
}

const lay = (s: Scene) => layoutGroupScene(s, assets)!;
const box = (sl: SlotLayout): Rect => boundsOfPoints(sl.cardQuad);
const centre = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
const overlapArea = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
/** Pixel-snapped placements can differ by a pixel. */
const near = (a: number, b: number, tol = 1.5) =>
  expect(Math.abs(a - b), `${a} vs ${b}`).toBeLessThanOrEqual(tol);
const within = (inner: Rect, outer: Rect, eps = 0.5) =>
  inner.x >= outer.x - eps &&
  inner.y >= outer.y - eps &&
  inner.x + inner.width <= outer.x + outer.width + eps &&
  inner.y + inner.height <= outer.y + outer.height + eps;
/** Drawn aspect of a slot's content (card units -> canvas, flat cards). */
const drawnAspect = (sl: SlotLayout) => sl.card.content.width / sl.card.content.height;

function checkCommon(g: GroupLayout, count: number) {
  expect(g.slots).toHaveLength(count);
  expect(g.slots.map((s) => s.index)).toEqual([...Array(count).keys()]);
  expect([...g.order].sort()).toEqual([...Array(count).keys()]);
  expect(Number.isInteger(g.canvas.width) && Number.isInteger(g.canvas.height)).toBe(true);
  // Bounds are the union of every (rotated, projected) card corner.
  expect(g.bounds).toEqual(boundsOfPoints(g.slots.flatMap((s) => s.cardQuad)));
  expect(within(g.bounds, g.shadowBounds, 1e-6)).toBe(true);
  for (const s of g.slots) {
    expect(s.canvas).toEqual(g.canvas);
    expect(s.canvasToCard).not.toBeNull();
  }
}

describe("every layout", () => {
  for (const def of LAYOUTS) {
    if (def.id === "single") continue;
    for (let n = def.minCount; n <= def.maxCount; n++) {
      for (const [kind, ids] of [
        ["desktop", ["d1", "d2", "d3", "d4", "d5", "d6"]],
        ["phone", ["p1", "p2", "p3", "p1", "p2", "p3"]],
        ["mixed", ["p1", "d1", "p2", "d2", "p3", "d3"]],
      ] as const) {
        it(`${def.id} x${n} (${kind}) fits a fixed canvas with its padding`, () => {
          const s = group(def.id, ids.slice(0, n), (x) =>
            setIn(x, ["canvas", "size"], { kind: "fixed", width: 1600, height: 1000 }),
          );
          const g = lay(s);
          checkCommon(g, n);
          expect(g.canvas).toEqual({ width: 1600, height: 1000 });
          const pad = s.canvas.padding * g.k * 0.5 - 1;
          expect(g.bounds.x).toBeGreaterThanOrEqual(pad);
          expect(g.bounds.y).toBeGreaterThanOrEqual(pad);
          expect(g.bounds.x + g.bounds.width).toBeLessThanOrEqual(1600 - pad);
          expect(g.bounds.y + g.bounds.height).toBeLessThanOrEqual(1000 - pad);
          // Never distorted: each card shows its image at the image's own shape
          // (grids crop to one cell shape instead).
          if (def.id !== "grid")
            for (const sl of g.slots)
              expect(drawnAspect(sl)).toBeCloseTo(
                sl.contentPixels.width / sl.contentPixels.height,
                6,
              );
        });
      }
    }
  }
});

describe("side by side", () => {
  it("puts screens in a row with equal gaps, centred on one line, in screen order", () => {
    const g = lay(group("side-by-side", ["d1", "d2", "d3"]));
    const [a, b, c] = g.slots.map(box);
    const gap1 = b!.x - (a!.x + a!.width);
    const gap2 = c!.x - (b!.x + b!.width);
    expect(gap1).toBeGreaterThan(10);
    near(gap2, gap1);
    near(centre(a!).y, centre(c!).y);
    expect(overlapArea(a!, b!)).toBe(0);
  });

  it("spacing widens the gaps", () => {
    const gap = (v: number) => {
      const g = lay(
        group("side-by-side", ["d1", "d2"], (s) => ({
          ...s,
          layout: { ...s.layout!, params: { spacing: v } },
        })),
      );
      return (box(g.slots[1]!).x - (box(g.slots[0]!).x + box(g.slots[0]!).width)) / g.k;
    };
    near(gap(0), 0, 0.5);
    near(gap(1), 240, 0.5);
  });

  it("tilt turns the outer screens inwards (perspective) and keeps them apart", () => {
    const g = lay(
      group("side-by-side", ["p1", "p2", "p3"], (s) => ({
        ...s,
        layout: { ...s.layout!, params: { tilt: 0.6 } },
      })),
    );
    expect(g.slots.map((s) => s.perspective)).toEqual([true, false, true]);
    const [a, b, c] = g.slots.map(box);
    expect(overlapArea(a!, b!)).toBe(0);
    expect(overlapArea(b!, c!)).toBe(0);
    // Open book: the left screen's inner (right) edge recedes, so it is shorter.
    const q = g.slots[0]!.cardQuad;
    expect(q[2].y - q[1].y).toBeLessThan(q[3].y - q[0].y);
  });

  it("balances a phone next to a desktop: the phone is taller, the desktop wider", () => {
    const g = lay(group("side-by-side", ["p1", "d1"]));
    const [p, d] = g.slots.map(box);
    expect(p!.height).toBeGreaterThan(d!.height);
    expect(d!.width).toBeGreaterThan(p!.width);
    expect(p!.height / d!.height).toBeLessThan(1.6);
  });

  it("stands screens on the floor when the style has a reflection", () => {
    const g = lay(
      group("side-by-side", ["p1", "d1"], (s) =>
        setIn(s, ["card", "reflection"], { opacity: 0.3, height: 0.4, gap: 6 }),
      ),
    );
    const [p, d] = g.slots.map(box);
    near(p!.y + p!.height, d!.y + d!.height);
    expect(g.reflection).toBe(true);
  });
});

describe("overlap", () => {
  it("puts a smaller screen partly behind the front one, along the direction", () => {
    const g = lay(group("overlap", ["d1", "d2"]));
    const [f, b] = g.slots.map(box);
    expect(g.order).toEqual([1, 0]);
    expect(b!.width).toBeLessThan(f!.width);
    const hidden = overlapArea(f!, b!) / (b!.width * b!.height);
    expect(hidden).toBeGreaterThan(0.05);
    expect(hidden).toBeLessThan(0.6);
    // Default direction: up and to the right.
    expect(centre(b!).x).toBeGreaterThan(centre(f!).x);
    expect(centre(b!).y).toBeLessThan(centre(f!).y);
  });

  it("more overlap hides more, and the angle steers the back screen", () => {
    const hidden = (overlap: number, angle = -30) => {
      const g = lay(
        group("overlap", ["d1", "d2"], (s) => ({
          ...s,
          layout: { ...s.layout!, params: { overlap, angle } },
        })),
      );
      const [f, b] = g.slots.map(box);
      return { area: overlapArea(f!, b!) / (b!.width * b!.height), f: centre(f!), b: centre(b!) };
    };
    expect(hidden(0.8).area).toBeGreaterThan(hidden(0.2).area);
    expect(hidden(0).area).toBeCloseTo(0, 3);
    const left = hidden(0.4, 180);
    expect(left.b.x).toBeLessThan(left.f.x);
    near(left.b.y, left.f.y);
  });
});

describe("hero", () => {
  it("centres screen 0 in front, smaller screens set back on both sides", () => {
    const g = lay(group("hero", ["p1", "p2", "p3"]));
    const [h, l, r] = g.slots.map(box);
    expect(g.order[2]).toBe(0);
    near(centre(h!).x, centre(g.bounds).x);
    expect(centre(l!).x).toBeLessThan(h!.x);
    expect(centre(r!).x).toBeGreaterThan(h!.x + h!.width);
    expect(l!.height).toBeLessThan(h!.height);
    // Symmetric about the hero.
    near(centre(h!).x - centre(l!).x, centre(r!).x - centre(h!).x);
    expect(g.slots[1]!.perspective && g.slots[2]!.perspective).toBe(true);
  });

  it("side size scales the flanks", () => {
    const side = (size: number) =>
      box(
        lay(
          group("hero", ["d1", "d2", "d3"], (s) => ({
            ...s,
            layout: { ...s.layout!, params: { size, tilt: 0 } },
          })),
        ).slots[1]!,
      ).width;
    expect(side(1)).toBeGreaterThan(side(0));
  });
});

describe("cascade", () => {
  it("steps screens back diagonally, screen 0 in front, each still showing", () => {
    const g = lay(group("cascade", ["d1", "d2", "d3", "d4"]));
    expect(g.order).toEqual([3, 2, 1, 0]);
    const cs = g.slots.map((s) => centre(box(s)));
    const step = { x: cs[1]!.x - cs[0]!.x, y: cs[1]!.y - cs[0]!.y };
    expect(step.x).toBeGreaterThan(0);
    expect(step.y).toBeLessThan(0);
    for (let i = 2; i < cs.length; i++) {
      near(cs[i]!.x - cs[i - 1]!.x, step.x);
      near(cs[i]!.y - cs[i - 1]!.y, step.y);
    }
    // Every back screen shows a good strip beyond the one in front.
    const [a, b] = g.slots.map(box);
    expect(1 - overlapArea(a!, b!) / (b!.width * b!.height)).toBeGreaterThan(0.2);
  });
});

describe("fan", () => {
  it("fans screens around a pivot below them, screen 0 in the middle on top", () => {
    const g = lay(group("fan", ["p1", "p2", "p3", "p1", "p2"]));
    expect(g.order[4]).toBe(0);
    const rot = g.slots.map((s) => s.placement.rotate);
    expect(rot[0]).toBe(0);
    expect(rot[1]).toBeCloseTo(-rot[2]!, 9);
    expect(rot[3]).toBeCloseTo(-rot[4]!, 9);
    expect(Math.abs(rot[3]!)).toBeGreaterThan(Math.abs(rot[1]!));
    // Rotated corners are inside the bounds (the bbox includes rotation).
    for (const s of g.slots)
      for (const p of s.cardQuad)
        expect(within({ ...p, width: 0, height: 0 }, g.bounds)).toBe(true);
    // Outer screens sit lower (an arc).
    expect(centre(box(g.slots[3]!)).y).toBeGreaterThan(centre(box(g.slots[0]!)).y);
  });

  it("spread widens the angle", () => {
    const outer = (spread: number) =>
      lay(
        group("fan", ["p1", "p2", "p3"], (s) => ({
          ...s,
          layout: { ...s.layout!, params: { spread } },
        })),
      ).slots[1]!.placement.rotate;
    expect(Math.abs(outer(1))).toBeGreaterThan(Math.abs(outer(0)));
  });

  it("orders positions from the middle out", () => {
    expect(fanPositions(3)).toEqual([1, 0, 2]);
    expect(fanPositions(4)).toEqual([1, 0, 2, 3]);
    expect(fanPositions(5)).toEqual([2, 1, 3, 0, 4]);
  });
});

describe("grid", () => {
  it("lays uniform cells in 2x2 or rows of 3, a short last row centred, no overlaps", () => {
    const four = lay(group("grid", ["d1", "d2", "d3", "d4"]));
    const five = lay(group("grid", ["d1", "d2", "d3", "d4", "d5"]));
    const six = lay(group("grid", ["p1", "d1", "p2", "d2", "p3", "d3"]));
    for (const g of [four, five, six]) {
      const bs = g.slots.map(box);
      for (let i = 0; i < bs.length; i++)
        for (let j = i + 1; j < bs.length; j++) expect(overlapArea(bs[i]!, bs[j]!)).toBe(0);
      for (const b of bs) {
        near(b.width, bs[0]!.width);
        near(b.height, bs[0]!.height);
      }
    }
    const f = four.slots.map((s) => centre(box(s)));
    near(f[0]!.y, f[1]!.y);
    near(f[0]!.x, f[2]!.x);
    const v = five.slots.map((s) => centre(box(s)));
    near((v[3]!.x + v[4]!.x) / 2, v[1]!.x);
  });

  it("cover-crops mixed shapes to the median cell, keeping each image's top", () => {
    const g = lay(group("grid", ["p1", "d1", "d2", "d3"]));
    for (const s of g.slots) {
      expect(s.content.tall).toBe("full");
      expect(drawnAspect(s)).toBeCloseTo(1.6, 6);
    }
    const phone = g.slots[0]!.content.crop!;
    expect(phone.y).toBe(0);
    expect(phone.width).toBe(1);
    expect(phone.height).toBeCloseTo(1170 / 1.6 / 2532, 6);
    expect(g.slots[1]!.content.crop).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });
});

describe("sizing and composition", () => {
  it("equal shapes keep their single-card size; balancing is scale-free", () => {
    const same = balanceSizes([
      { width: 2880, height: 1800 },
      { width: 1440, height: 900 },
    ]);
    expect(same[0]!.width).toBeCloseTo(1000, 6);
    expect(same[1]).toEqual(same[0]);
    const mixed = balanceSizes([
      { width: 1170, height: 2532 },
      { width: 2880, height: 1800 },
    ]);
    const g = Math.sqrt((mixed[0]!.height / 1203.6) * (mixed[1]!.height / 625));
    expect(g).toBeCloseTo(1, 2);
  });

  it("auto canvases show the screens at native resolution, with the padding around them", () => {
    const g = lay(group("side-by-side", ["s1", "s2"]));
    const s0 = g.slots[0]!;
    expect(s0.card.content.width * s0.k).toBeCloseTo(1440, 6);
    near(g.bounds.x, 80 * g.k);
    near(g.bounds.y, 80 * g.k);
    expect(g.canvas.width).toBe(Math.round(g.bounds.width + 160 * g.k));
  });

  it("caps auto canvases of huge screens", () => {
    const g = lay(group("grid", ["big", "big", "big", "big", "big", "big"]));
    expect(Math.max(g.canvas.width, g.canvas.height)).toBeLessThanOrEqual(GROUP_MAX_SIDE);
  });

  it("the card transform scales and moves the whole group", () => {
    const base = group("fan", ["p1", "p2", "p3"], (s) =>
      setIn(s, ["canvas", "size"], { kind: "fixed", width: 1200, height: 1200 }),
    );
    const a = lay(base);
    const b = lay(setIn(base, ["card", "transform"], { scale: 0.5, offsetX: 0.1, offsetY: 0 }));
    near(b.bounds.width, a.bounds.width / 2);
    near(centre(b.bounds).x - centre(a.bounds).x, 120);
  });

  it("the style's tilt turns the whole group as one plane", () => {
    const flat = lay(group("grid", ["d1", "d2", "d3", "d4"]));
    expect(flat.slots.every((s) => !s.perspective)).toBe(true);
    const tilted = lay(
      group("grid", ["d1", "d2", "d3", "d4"], (s) => setIn(s, ["card", "tilt", "rotateY"], 20)),
    );
    expect(tilted.slots.every((s) => s.perspective)).toBe(true);
    // The far (right) column is drawn smaller than the near one.
    expect(box(tilted.slots[1]!).height).toBeLessThan(box(tilted.slots[0]!).height);
  });

  it("a caption sits above the whole group", () => {
    const g = lay(
      group("side-by-side", ["p1", "p2"], (s) => ({
        ...setIn(s, ["canvas", "size"], { kind: "fixed", width: 1080, height: 1920 }),
        caption: {
          enabled: true,
          headline: "Two screens",
          subhead: "",
          font: "display",
          align: "center",
          color: "auto",
          size: 1,
        },
      })),
    );
    expect(g.caption).toBeDefined();
    const last = g.caption!.blocks[g.caption!.blocks.length - 1]!;
    expect(g.bounds.y).toBeGreaterThan(last.box.y + last.box.height);
  });

  it("a style's bleed cuts only when it makes the screens bigger", () => {
    const wide = (anchor: "top" | "left") =>
      lay(
        group("side-by-side", ["d1", "d2"], (s) => ({
          ...setIn(s, ["canvas", "size"], { kind: "fixed", width: 1600, height: 1000 }),
          canvas: {
            ...s.canvas,
            size: { kind: "fixed", width: 1600, height: 1000 },
            anchor,
            bleed: 0.25,
          },
        })),
      );
    const top = wide("top");
    // A wide row in a 16:10 canvas: bleeding off the bottom gains nothing, so it sits whole.
    expect(within(top.bounds, { x: 0, y: 0, width: 1600, height: 1000 })).toBe(true);
    const left = wide("left");
    // Bleeding sideways makes it bigger: it runs off the right edge by a part of one screen.
    expect(left.bounds.x + left.bounds.width).toBeGreaterThan(1600);
    const cut = left.bounds.x + left.bounds.width - 1600;
    expect(cut).toBeLessThan(box(left.slots[1]!).width * 0.5);
  });

  it("empty screens take the shape of the first image", () => {
    const g = lay(group("side-by-side", ["p1", null]));
    expect(g.slots[1]!.empty).toBe(true);
    near(box(g.slots[1]!).height, box(g.slots[0]!).height);
    const none = lay(group("cascade", [null, null, null]));
    expect(none.slots.every((s) => s.empty)).toBe(true);
    expect(drawnAspect(none.slots[0]!)).toBeCloseTo(1.6, 6);
  });
});

describe("single-card helpers on a group", () => {
  it("layoutScene is screen 0's card on the group's canvas", () => {
    const s = group("hero", ["d1", "d2", "d3"]);
    const g = lay(s);
    const primary = layoutScene(s, assets);
    expect(primary.canvas).toEqual(g.canvas);
    expect(primary.cardQuad).toEqual(g.slots[0]!.cardQuad);
    expect(primary.k).toBe(g.slots[0]!.k);
  });

  it("single designs have no group, even with stored screens", () => {
    const s = { ...group("fan", ["d1", "d2", "d3"]), layout: undefined };
    expect(layoutGroupScene(s, assets)).toBeNull();
    const plain = createScene({ content: { kind: "image", assetId: "d1" } });
    const withSlots = {
      ...setIn(plain, ["card", "shadow", "preset"], "none"),
      slots: [{ assetId: "d2" }],
    };
    expect(layoutScene(withSlots, assets)).toEqual(
      layoutScene(setIn(plain, ["card", "shadow", "preset"], "none"), assets),
    );
  });

  it("slotRects and slotAt find the topmost screen under a point", () => {
    const s = group("overlap", ["d1", "d2"]);
    const rects = slotRects(s, assets);
    expect(rects.map((r) => r.index)).toEqual([0, 1]);
    expect(rects[0]!.depth).toBe(1);
    const [f, b] = rects.map((r) => r.bounds);
    const ov = {
      x: (Math.max(f!.x, b!.x) + Math.min(f!.x + f!.width, b!.x + b!.width)) / 2,
      y: (Math.max(f!.y, b!.y) + Math.min(f!.y + f!.height, b!.y + b!.height)) / 2,
    };
    expect(slotAt(s, assets, ov.x, ov.y)).toBe(0);
    expect(slotAt(s, assets, b!.x + b!.width - 2, b!.y + 2)).toBe(1);
    expect(slotAt(s, assets, 1, 1)).toBeNull();
    const single = slotRects(createScene({ content: { kind: "image", assetId: "d1" } }), assets);
    expect(single).toHaveLength(1);
    expect(single[0]!.index).toBe(0);
  });

  it("slotAt follows rotation", () => {
    const s = group("fan", ["p1", "p2", "p3"], (x) => ({
      ...x,
      layout: { ...x.layout!, params: { spread: 1 } },
    }));
    const r = slotRects(s, assets)[1]!;
    // The bounding box corner outside the rotated card is not a hit.
    const q = r.quad;
    const mid = { x: (q[0].x + q[2].x) / 2, y: (q[0].y + q[2].y) / 2 };
    expect(slotAt(s, assets, mid.x, mid.y)).not.toBeNull();
    const corner = { x: r.bounds.x + 1, y: r.bounds.y + 1 };
    expect(slotAt(s, assets, corner.x, corner.y)).not.toBe(1);
  });
});
