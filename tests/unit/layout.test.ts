import { describe, expect, it } from "vitest";
import {
  canvasToContent,
  computeCardGeometry,
  computeLayout,
  contentToCanvas,
  contentUnits,
  createScene,
  hitContent,
  MAX_CANVAS_SIDE,
  outputSize,
  setIn,
  type Scene,
} from "@/engine";
import { chromeUnit, deviceScreen } from "@/engine/frames/kinds";
import { PHONE, TABLET } from "@/engine/frames/specs";
import {
  compose,
  contentFade,
  effectiveCrop,
  referenceSide,
  tallCap,
  upscaleFactor,
} from "@/engine/layout/layout";
import { sourceAdvice } from "@/engine/analysis/tone";

const shot = { width: 1440, height: 900 };
const bare = (patch: (s: Scene) => Scene = (s) => s): Scene =>
  patch(
    createScene({
      content: { kind: "image", assetId: "a" },
      canvas: { size: { kind: "auto" }, padding: 100 },
    }),
  );
const noShadow = (s: Scene) =>
  setIn(setIn(s, ["card", "radius"], 0), ["card", "border", "width"], 0);

describe("contentUnits", () => {
  it("normalizes the reference side (long side, capped at 1.8x the short side) to 1000 cu", () => {
    expect(contentUnits({ width: 1440, height: 900 })).toEqual({ width: 1000, height: 625 });
    expect(contentUnits({ width: 1920, height: 1080 }).width).toBeCloseTo(1000, 9);
    expect(referenceSide({ width: 786, height: 1704 })).toBeCloseTo(1.8 * 786, 9);
    // A 1:10 full-page capture measures padding from its width, not its height.
    const tall = contentUnits({ width: 800, height: 8000 });
    expect(tall.width).toBeCloseTo(1000 / 1.8, 9);
    expect(tall.height).toBeCloseTo(10000 / 1.8, 9);
  });

  it("keeps padding proportional to the short side on tall captures", () => {
    const s = bare((x) =>
      setIn(noShadow(x), ["content"], { kind: "image", assetId: "a", tall: "full" }),
    );
    const l = computeLayout(s, { width: 800, height: 8000 });
    // 100 cu of padding = 100 / 1000 * 1440 px (1.8 x 800), not 800 px.
    expect(l.canvas.width).toBe(800 + 2 * 144);
  });
});

describe("long captures", () => {
  const img = (extra: object = {}) =>
    bare((x) => setIn(x, ["content"], { kind: "image", assetId: "a", ...extra }));

  it("shows the top of captures taller than 3:1, with a fade", () => {
    const s = img();
    const e = effectiveCrop(s.content as never, { width: 1600, height: 9000 }, "none");
    expect(e.capped).toBe(true);
    expect(e.crop.height * 9000).toBeCloseTo(1600 * 0.75, 6);
    expect(contentFade(s.content as never, true)).toBeCloseTo(0.18, 9);
    expect(computeLayout(s, { width: 1600, height: 9000 }).contentPixels).toEqual({
      width: 1600,
      height: 1200,
    });
  });

  it("caps narrow (phone) pages and phone frames at phone proportions", () => {
    const e = effectiveCrop({ kind: "image", assetId: "a" }, { width: 1170, height: 8000 }, "none");
    expect((e.crop.height * 8000) / 1170).toBeCloseTo(19.5 / 9, 6);
    expect(tallCap("phone", 3000)).toBeCloseTo(19.5 / 9, 9);
    expect(tallCap("laptop", 3000)).toBe(0.625);
  });

  it("leaves ordinary shots alone and honours 'full' and 'top'", () => {
    const normal = effectiveCrop(
      { kind: "image", assetId: "a" },
      { width: 786, height: 1704 },
      "none",
    );
    expect(normal.capped).toBe(false);
    const full = effectiveCrop(
      { kind: "image", assetId: "a", tall: "full" },
      { width: 1600, height: 9000 },
      "none",
    );
    expect(full.capped).toBe(false);
    const top = effectiveCrop(
      { kind: "image", assetId: "a", tall: "top" },
      { width: 1600, height: 2000 },
      "none",
    );
    expect(top.capped).toBe(true);
    expect(contentFade({ kind: "image", assetId: "a", fade: 0 }, true)).toBe(0);
  });
});

describe("small sources", () => {
  it("upscale auto canvases by a whole number to at least 1200 px", () => {
    const s = bare(noShadow);
    expect(upscaleFactor(s, { width: 200, height: 150 })).toBe(6);
    expect(upscaleFactor(s, { width: 999, height: 600 })).toBe(2);
    expect(upscaleFactor(s, { width: 1000, height: 600 })).toBe(1);
    expect(upscaleFactor(setIn(s, ["canvas", "upscale"], "off"), { width: 200, height: 150 })).toBe(
      1,
    );
    const l = computeLayout(s, { width: 200, height: 125 });
    expect(l.k).toBeCloseTo(0.2 * 6, 9);
    expect(sourceAdvice({ width: 200, height: 125 })).toMatchObject({ small: true, upscale: 6 });
    expect(sourceAdvice({ width: 2880, height: 1800 }).small).toBe(false);
  });
});

describe("auto canvas", () => {
  it("hugs the card at native resolution, pixel-exact", () => {
    const l = computeLayout(bare(noShadow), shot);
    // 1000x625 cu + 2x100 cu padding at 1.44 px/cu.
    expect(l.canvas).toEqual({ width: 1728, height: 1188 });
    expect(l.k).toBeCloseTo(1.44, 12);
    const tl = contentToCanvas(l, 0, 0);
    const br = contentToCanvas(l, 1, 1);
    expect(tl).toEqual({ x: 144, y: 144 });
    expect(br.x - tl.x).toBeCloseTo(1440, 9);
    expect(br.y - tl.y).toBeCloseTo(900, 9);
  });

  it("caps huge canvases", () => {
    const l = computeLayout(bare(), { width: 30000, height: 20000 });
    expect(Math.max(l.canvas.width, l.canvas.height)).toBeLessThanOrEqual(MAX_CANVAS_SIDE);
  });

  it("grows to an aspect ratio along one axis only (contain)", () => {
    const s = bare((x) =>
      setIn(
        setIn(noShadow(x), ["canvas", "size"], { kind: "aspect", ratioW: 1, ratioH: 1 }),
        ["canvas", "fit"],
        "contain",
      ),
    );
    const l = computeLayout(s, shot);
    expect(l.canvas).toEqual({ width: 1728, height: 1728 });
    expect(l.k).toBeCloseTo(1.44, 12);
    const tall = computeLayout(
      setIn(s, ["canvas", "size"], { kind: "aspect", ratioW: 16, ratioH: 9 }),
      shot,
    );
    expect(tall.canvas.width / tall.canvas.height).toBeCloseTo(16 / 9, 2);
    expect(tall.canvas.height).toBe(1188);
  });
});

const contain = (s: Scene) => setIn(s, ["canvas", "fit"], "contain");

describe("fixed canvas", () => {
  it("uses exact dimensions and fits the card inside the padding", () => {
    const s = bare((x) =>
      contain(setIn(noShadow(x), ["canvas", "size"], { kind: "fixed", width: 1200, height: 630 })),
    );
    const l = computeLayout(s, shot);
    expect(l.canvas).toEqual({ width: 1200, height: 630 });
    // Height-bound: 630 px over 625 + 200 cu.
    expect(l.k).toBeCloseTo(630 / 825, 9);
    const tl = contentToCanvas(l, 0, 0);
    const br = contentToCanvas(l, 1, 1);
    expect(Math.round(tl.y)).toBe(Math.round(100 * l.k));
    expect(br.x + tl.x).toBeCloseTo(1200, 0); // centred
  });

  it("applies card scale and offset", () => {
    let s = bare((x) =>
      contain(setIn(noShadow(x), ["canvas", "size"], { kind: "fixed", width: 1000, height: 1000 })),
    );
    const base = computeLayout(s, shot);
    s = setIn(s, ["card", "transform"], { scale: 0.5, offsetX: 0.25, offsetY: 0 });
    const l = computeLayout(s, shot);
    expect(l.k).toBeCloseTo(base.k * 0.5, 9);
    const c = contentToCanvas(l, 0.5, 0.5);
    expect(c.x).toBeCloseTo(750, 0);
    expect(c.y).toBeCloseTo(contentToCanvas(base, 0.5, 0.5).y, 0);
  });

  it("auto fit grows the card instead of leaving wide empty bands", () => {
    const s = bare((x) =>
      setIn(noShadow(x), ["canvas", "size"], { kind: "fixed", width: 1080, height: 1080 }),
    );
    const c = computeLayout(contain(s), shot);
    const a = computeLayout(s, shot);
    expect(a.k).toBeGreaterThan(c.k * 1.3);
    expect(a.k).toBeLessThanOrEqual(c.k * 1.5 + 1e-9);
    // It bleeds off the right edge (anchored left, keeping its padding there).
    const tl = contentToCanvas(a, 0, 0);
    const br = contentToCanvas(a, 1, 1);
    expect(tl.x).toBeCloseTo(100 * a.k, 0);
    expect(br.x).toBeGreaterThan(1080);
    // Vertically it keeps its padding, centred.
    expect(Math.abs(tl.y - (1080 - br.y))).toBeLessThan(2);
    expect(tl.y).toBeGreaterThan(90 * a.k);
  });

  it("small bands stay contained, with an optical lift", () => {
    const s = bare((x) =>
      setIn(noShadow(x), ["canvas", "size"], { kind: "fixed", width: 1920, height: 1080 }),
    );
    const a = computeLayout(s, shot);
    const c = computeLayout(contain(s), shot);
    expect(a.k).toBeCloseTo(c.k, 9);
    const portrait = computeLayout(
      setIn(s, ["canvas", "size"], { kind: "fixed", width: 1080, height: 1350 }),
      shot,
    );
    const tl = contentToCanvas(portrait, 0, 0);
    const br = contentToCanvas(portrait, 1, 1);
    expect(tl.y).toBeLessThan(1350 - br.y); // a touch above centre
  });

  it("fill covers the loose axis and bleeds more", () => {
    const s = bare((x) =>
      setIn(
        setIn(noShadow(x), ["canvas", "size"], { kind: "fixed", width: 1080, height: 1920 }),
        ["canvas", "fit"],
        "fill",
      ),
    );
    const l = computeLayout(s, shot);
    const tl = contentToCanvas(l, 0, 0);
    const br = contentToCanvas(l, 1, 1);
    // Grows until only 45 % of the card's width shows, running off the right edge.
    expect((1080 - tl.x) / (br.x - tl.x)).toBeCloseTo(0.45, 2);
    const auto = computeLayout(setIn(s, ["canvas", "fit"], "auto"), shot);
    expect(l.k).toBeGreaterThan(auto.k);
  });

  it("anchor and bleed compose auto canvases that run off an edge", () => {
    const s = bare((x) =>
      setIn(setIn(noShadow(x), ["canvas", "anchor"], "top"), ["canvas", "bleed"], 0.2),
    );
    const l = computeLayout(s, shot);
    // Width: card + 2 padding; height: padding + 80 % of the card.
    expect(l.canvas).toEqual({ width: 1728, height: Math.round((100 + 0.8 * 625) * 1.44) });
    const br = contentToCanvas(l, 1, 1);
    expect(br.y).toBeGreaterThan(l.canvas.height);
    const corner = compose(
      setIn(setIn(noShadow(bare()), ["canvas", "anchor"], "top-left"), ["canvas", "bleed"], 0.3),
      1000,
      625,
    );
    expect(corner).toMatchObject({ bleedX: true, bleedY: true, cardX: 100, cardY: 100 });
    expect(corner.width).toBeCloseTo(100 + 700, 9);
  });

  it("keeps every export scale an exact multiple", () => {
    const s = bare((x) =>
      setIn(x, ["canvas", "size"], { kind: "fixed", width: 1080, height: 1350 }),
    );
    const l = computeLayout(s, shot);
    for (const scale of [1, 2, 3, 4]) {
      expect(outputSize(l, scale)).toEqual({ width: 1080 * scale, height: 1350 * scale });
    }
  });
});

describe("card geometry", () => {
  it("adds inset around the content and shrinks inner radii", () => {
    const s = bare((x) =>
      setIn(setIn(x, ["card", "inset"], { width: 40, color: "auto" }), ["card", "radius"], 30),
    );
    const g = computeCardGeometry(s, shot);
    expect(g.plate).toEqual({ x: 0, y: 0, width: 1080, height: 705 });
    expect(g.content).toEqual({ x: 40, y: 40, width: 1000, height: 625 });
    expect(g.plateRadii).toEqual([30, 30, 30, 30]);
    expect(g.contentRadii).toEqual([0, 0, 0, 0]);
  });

  it("grows the card by the border ring", () => {
    const s = bare((x) => setIn(x, ["card", "border"], { width: 12, color: "#fff" }));
    const g = computeCardGeometry(s, shot);
    expect(g.size).toEqual({ width: 1024, height: 649 });
    expect(g.content.x).toBe(12);
    expect(g.borderOutline![0]!.rect).toEqual({ x: 0, y: 0, width: 1024, height: 649 });
  });

  it("adds a macOS title bar in chrome units", () => {
    const s = bare((x) => setIn(x, ["card", "frame", "id"], "macos"));
    const g = computeCardGeometry(s, shot);
    expect(g.content.y).toBeCloseTo(20, 9); // 20 ch, 1 ch = 1 cu for landscape shots
    expect(g.size.height).toBeCloseTo(645, 9);
    expect(g.contentRadii[0]).toBe(0); // top corners sit under the bar
  });

  it("caps chrome on very tall captures (scales with the width)", () => {
    expect(chromeUnit({ width: 1000, height: 625 })).toBe(1);
    const tall = contentUnits({ width: 1440, height: 6000 });
    expect(chromeUnit(tall)).toBeCloseTo(tall.width / 625, 9);
    const s = bare((x) =>
      setIn(setIn(x, ["card", "frame", "id"], "macos"), ["content"], {
        kind: "image",
        assetId: "a",
        tall: "full",
      }),
    );
    const l = computeLayout(s, { width: 1440, height: 6000 });
    const barPx = l.card.content.y * l.k;
    expect(barPx).toBeCloseTo(20 * 1.6 * 1.44, 6); // ~46 px, not 120 px
  });

  it("ignores inset and card radius inside device frames", () => {
    const s = bare((x) =>
      setIn(
        setIn(setIn(x, ["card", "frame", "id"], "phone"), ["card", "inset", "width"], 50),
        ["card", "radius"],
        3,
      ),
    );
    const g = computeCardGeometry(s, { width: 786, height: 1704 });
    expect(g.inset).toBe(0);
    expect(g.content.width).toBeCloseTo(contentUnits({ width: 786, height: 1704 }).width, 9);
    expect(g.contentRadii[0]).toBeGreaterThan(3);
  });

  it("turns phones sideways for landscape shots and keeps content clear of corners and camera", () => {
    const portrait = deviceScreen(PHONE, { width: 461, height: 1000 });
    expect(portrait.orientation).toBe("portrait");
    expect(portrait.content).toEqual({ x: 0, y: 0, width: 461, height: 1000 }); // edge to edge
    const land = deviceScreen(PHONE, { width: 1000, height: 625 });
    expect(land.orientation).toBe("landscape");
    expect(land.screen.width / land.screen.height).toBeGreaterThanOrEqual(1.9 - 1e-9);
    // Letterboxed: content inset from every screen edge, the sharp corner inside the rounded screen.
    const { x, y } = land.content;
    const r = land.screenRadius;
    expect(x).toBeGreaterThan(0);
    expect(y).toBeGreaterThan(0);
    const inside = (px: number, py: number) =>
      px >= r || py >= r || Math.hypot(r - px, r - py) <= r + 1e-9;
    expect(inside(x, y)).toBe(true);
    // The camera (left short edge) sits in the margin, not over the content.
    const cam = ((PHONE.camera.offset ?? 0) + PHONE.camera.diameter) * land.screen.height;
    expect(x).toBeGreaterThanOrEqual(cam);
    // Tablets keep ordinary shots edge to edge.
    expect(deviceScreen(TABLET, { width: 1000, height: 694 }).content.x).toBe(0);
    const s = bare((q) => setIn(q, ["card", "frame", "id"], "phone"));
    const g = computeCardGeometry(s, { width: 1440, height: 900 });
    expect(g.frame!.geometry.orientation).toBe("landscape");
    expect(g.content.width).toBeCloseTo(1000, 9);
  });

  it("letterboxes laptops on the screenshot's edge colour", () => {
    const s = bare((q) => setIn(q, ["card", "frame", "id"], "laptop"));
    const g = computeCardGeometry(s, { width: 786, height: 1704 });
    expect(g.frame!.geometry.screenFill).toBe("edge");
    expect(g.frame!.geometry.screen.width).toBeGreaterThan(g.content.width * 2);
  });

  it("gives laptops a two-part silhouette", () => {
    const s = bare((x) => setIn(x, ["card", "frame", "id"], "laptop"));
    const g = computeCardGeometry(s, shot);
    expect(g.outline).toHaveLength(2);
    expect(g.size.width).toBeGreaterThan(g.content.width * 1.1);
  });

  it("renders unknown frame ids without a frame", () => {
    const s = bare((x) => setIn(x, ["card", "frame", "id"], "hologram"));
    expect(computeCardGeometry(s, shot).frame).toBeNull();
  });
});

describe("tilt and hit-testing", () => {
  const tilted = bare((x) =>
    setIn(
      setIn(x, ["canvas", "size"], { kind: "fixed", width: 1600, height: 1000 }),
      ["card", "tilt"],
      {
        rotateX: 15,
        rotateY: -25,
        rotateZ: 0,
        perspective: 2.5,
      },
    ),
  );

  it("fits the projected card inside the canvas", () => {
    const l = computeLayout(tilted, shot);
    expect(l.perspective).toBe(true);
    for (const p of l.cardQuad) {
      expect(p.x).toBeGreaterThanOrEqual(-0.5);
      expect(p.x).toBeLessThanOrEqual(1600.5);
      expect(p.y).toBeGreaterThanOrEqual(-0.5);
      expect(p.y).toBeLessThanOrEqual(1000.5);
    }
  });

  it("round-trips content <-> canvas coordinates", () => {
    for (const s of [bare(), tilted, setIn(bare(), ["card", "tilt", "rotateZ"], 12)]) {
      const l = computeLayout(s, shot);
      for (const [u, v] of [
        [0, 0],
        [0.25, 0.8],
        [1, 1],
      ]) {
        const p = contentToCanvas(l, u!, v!);
        const back = canvasToContent(l, p.x, p.y)!;
        expect(back.x).toBeCloseTo(u!, 6);
        expect(back.y).toBeCloseTo(v!, 6);
      }
      const mid = contentToCanvas(l, 0.5, 0.5);
      expect(hitContent(l, mid.x, mid.y)).toBe(true);
      expect(hitContent(l, 0, 0)).toBe(false);
    }
  });

  it("treats in-plane rotation as affine (no warp needed)", () => {
    const l = computeLayout(setIn(bare(), ["card", "tilt", "rotateZ"], 12), shot);
    expect(l.perspective).toBe(false);
  });
});
