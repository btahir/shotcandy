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
import { chromeUnit } from "@/engine/frames/kinds";

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
  it("normalizes the longer side to 1000 cu", () => {
    expect(contentUnits({ width: 1440, height: 900 })).toEqual({ width: 1000, height: 625 });
    expect(contentUnits({ width: 786, height: 1704 }).height).toBe(1000);
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

  it("grows to an aspect ratio along one axis only", () => {
    const s = bare((x) =>
      setIn(noShadow(x), ["canvas", "size"], { kind: "aspect", ratioW: 1, ratioH: 1 }),
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

describe("fixed canvas", () => {
  it("uses exact dimensions and fits the card inside the padding", () => {
    const s = bare((x) =>
      setIn(noShadow(x), ["canvas", "size"], { kind: "fixed", width: 1200, height: 630 }),
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
      setIn(noShadow(x), ["canvas", "size"], { kind: "fixed", width: 1000, height: 1000 }),
    );
    const base = computeLayout(s, shot);
    s = setIn(s, ["card", "transform"], { scale: 0.5, offsetX: 0.25, offsetY: 0 });
    const l = computeLayout(s, shot);
    expect(l.k).toBeCloseTo(base.k * 0.5, 9);
    const c = contentToCanvas(l, 0.5, 0.5);
    expect(c.x).toBeCloseTo(750, 0);
    expect(c.y).toBeCloseTo(500, 0);
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

  it("caps chrome on very tall captures (1.6 W rule)", () => {
    expect(chromeUnit({ width: 1000, height: 625 })).toBe(1);
    const tall = contentUnits({ width: 1440, height: 6000 });
    expect(chromeUnit(tall)).toBeCloseTo((1.6 * 1440) / 6000, 9);
    const s = bare((x) => setIn(x, ["card", "frame", "id"], "macos"));
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
