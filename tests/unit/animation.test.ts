/** The animation timeline: easing, timing maths, presets and determinism (no pixels). */
import { describe, expect, it } from "vitest";
import {
  type AnimationSpec,
  type AssetSource,
  type Scene,
  MapAssetResolver,
  addAnnotation,
  contentToCanvas,
  createAnimation,
  createAnnotation,
  createScene,
  cubicBezier,
  evaluateFrame,
  evaluateScene,
  frameCount,
  getEasing,
  getMotionPreset,
  gifDelays,
  layoutScene,
  listMotionPresets,
  loadScene,
  motionFrame,
  normalizeScene,
  planAnimation,
  revealAnnotations,
  setIn,
  SCENE_VERSION,
} from "@/engine";

const shot: AssetSource = { id: "shot", width: 1600, height: 1000, images: [] };
const tall: AssetSource = { id: "tall", width: 1200, height: 6000, images: [] };
const assets = new MapAssetResolver([shot, tall]);
const ctx = { assets };

function animated(preset: string, patch: Partial<AnimationSpec> = {}, base?: Scene): Scene {
  const s =
    base ??
    createScene({
      content: { kind: "image", assetId: "shot" },
      background: {
        fill: {
          kind: "mesh",
          base: "#ffeedd",
          points: [
            { x: 0.2, y: 0.2, color: "#ff8fab", radius: 0.6 },
            { x: 0.8, y: 0.7, color: "#8b6cff", radius: 0.5 },
          ],
        },
        grain: { amount: 0, size: 1, seed: 1 },
      },
    });
  return { ...s, animation: { ...createAnimation(preset), ...patch } };
}

describe("easing", () => {
  it("maps the ends exactly and is monotone for smooth curves", () => {
    for (const id of ["smooth", "snappy", "gentle", "linear"] as const) {
      const e = getEasing(id);
      expect(e(0)).toBe(0);
      expect(e(1)).toBe(1);
      let prev = -1;
      for (let i = 0; i <= 100; i++) {
        const v = e(i / 100);
        expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
        prev = v;
      }
    }
  });

  it("overshoots with the bouncy curve and matches CSS cubic-bezier values", () => {
    const pop = getEasing("bounce");
    expect(Math.max(...Array.from({ length: 101 }, (_, i) => pop(i / 100)))).toBeGreaterThan(1.05);
    // cubic-bezier(.25,.1,.25,1) ("ease") at t=0.5 is ~0.8024 in browsers.
    expect(cubicBezier(0.25, 0.1, 0.25, 1)(0.5)).toBeCloseTo(0.8024, 3);
  });
});

describe("timing", () => {
  it("counts frames and keeps GIF delays on the exact timeline", () => {
    expect(frameCount(3, 30)).toBe(90);
    expect(frameCount(2.5, 24)).toBe(60);
    for (const [frames, fps] of [
      [90, 30],
      [60, 24],
      [45, 15],
      [100, 50],
    ] as const) {
      const d = gifDelays(frames, fps);
      expect(d).toHaveLength(frames);
      expect(d.reduce((a, b) => a + b, 0)).toBe(Math.round((frames / fps) * 100));
      expect(Math.min(...d)).toBeGreaterThanOrEqual(2); // browsers slow down delays < 2 cs
    }
  });

  it("maps once, boomerang and periodic progress", () => {
    const reveal = getMotionPreset("reveal")!;
    const once = { ...createAnimation("reveal"), duration: 4, loop: "once" as const };
    expect(motionFrame(once, reveal, 0).raw).toBe(0);
    expect(motionFrame(once, reveal, 4 * 0.72).raw).toBeCloseTo(1, 9);
    expect(motionFrame(once, reveal, 3.9).raw).toBe(1); // holds the end pose
    const boom = { ...once, loop: "boomerang" as const };
    expect(motionFrame(boom, reveal, 0).raw).toBe(0);
    expect(motionFrame(boom, reveal, 2).raw).toBe(1);
    expect(motionFrame(boom, reveal, 4).raw).toBe(0); // wraps: frame N == frame 0
    const float = getMotionPreset("float")!;
    const f = motionFrame({ ...createAnimation("float"), duration: 4 }, float, 1);
    expect(f.phase).toBeCloseTo(0.25, 9);
  });
});

describe("evaluateScene", () => {
  it("returns a static scene untouched", () => {
    const s = createScene({ content: { kind: "image", assetId: "shot" } });
    expect(evaluateScene(s, 1.2, ctx)).toBe(s);
    expect(
      evaluateScene({ ...s, animation: { ...createAnimation("reveal"), preset: "nope" } }, 1, ctx),
    ).toEqual({
      ...s,
      animation: { ...createAnimation("reveal"), preset: "nope" },
    });
  });

  it("is pure and deterministic for every preset", () => {
    for (const p of listMotionPresets()) {
      const s = animated(p.id);
      const before = JSON.stringify(s);
      for (const t of [0, 0.37, 1.1, 2.9]) {
        const a = evaluateScene(s, t, ctx);
        const b = evaluateScene(s, t, ctx);
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      }
      expect(JSON.stringify(s)).toBe(before);
    }
  });

  it("pins the canvas so every frame has the same output size", () => {
    for (const p of listMotionPresets()) {
      for (const size of [
        { kind: "auto" as const },
        { kind: "aspect" as const, ratioW: 16, ratioH: 9 },
        { kind: "fixed" as const, width: 1200, height: 630 },
      ]) {
        const s = setIn(animated(p.id), ["canvas", "size"], size);
        const n = frameCount(s.animation!.duration, s.animation!.fps);
        const sizes = new Set<string>();
        for (let i = 0; i < n; i += 7) {
          const l = layoutScene(evaluateFrame(s, i, ctx), assets);
          sizes.add(`${l.canvas.width}x${l.canvas.height}`);
        }
        expect(sizes.size, `${p.id} ${size.kind}`).toBe(1);
      }
    }
  });

  it("keeps the card's pixels-per-unit steady while it tilts", () => {
    const s = animated("sweep");
    const k0 = layoutScene(evaluateScene(s, 0, ctx), assets).k;
    const k1 = layoutScene(evaluateScene(s, s.animation!.duration / 4, ctx), assets).k;
    expect(k1).toBeCloseTo(k0, 6);
  });

  it("loops periodic presets seamlessly", () => {
    for (const id of ["float", "sweep", "drift"]) {
      const s = animated(id);
      const a = evaluateScene(s, 0, ctx);
      const b = evaluateScene(s, s.animation!.duration, ctx);
      expect(JSON.stringify(b)).toBe(JSON.stringify(a));
      // Phase 0 is the rest pose (the still image).
      expect(a.card.transform).toEqual(
        expect.objectContaining({ offsetX: s.card.transform.offsetX }),
      );
      expect(a.card.tilt.rotateY).toBeCloseTo(s.card.tilt.rotateY, 9);
      expect(a.background.fill).toEqual(s.background.fill);
    }
  });

  it("ends the zoom-in reveal on the rest pose", () => {
    const s = animated("reveal", { loop: "once", duration: 3 });
    const end = evaluateScene(s, 2.99, ctx);
    expect(end.card.tilt.rotateX).toBeCloseTo(s.card.tilt.rotateX, 9);
    expect(end.card.transform.scale).toBeCloseTo(s.card.transform.scale, 6);
    const start = evaluateScene(s, 0, ctx);
    expect(start.card.transform.scale).toBeLessThan(0.9);
    expect(start.card.tilt.rotateX).toBeGreaterThan(10);
  });

  it("zooms the focus point towards the centre of the canvas", () => {
    const s = animated("focus", { focusX: 0.8, focusY: 0.2, loop: "boomerang", duration: 4 });
    const zoomed = evaluateScene(s, 2, ctx); // boomerang hold
    const l = layoutScene(zoomed, assets);
    const fp = contentToCanvas(l, 0.8, 0.2);
    expect(fp.x).toBeCloseTo(l.canvas.width / 2, 0);
    expect(fp.y).toBeCloseTo(l.canvas.height / 2, 0);
    expect(zoomed.card.transform.scale).toBeGreaterThan(1.5);
  });

  it("scrolls a tall screenshot through a viewport", () => {
    const base = createScene({ content: { kind: "image", assetId: "tall" } });
    const s = animated("scroll", { loop: "once", duration: 6 }, base);
    const top = evaluateScene(s, 0, ctx);
    const bottom = evaluateScene(s, 5.9, ctx);
    expect(top.content.kind === "image" && top.content.crop?.y).toBe(0);
    const c = bottom.content.kind === "image" ? bottom.content.crop! : null;
    expect(c!.y + c!.height).toBeCloseTo(1, 6);
    expect(c!.height).toBeCloseTo((1200 * (10 / 16)) / 6000, 6);
  });

  it("falls back to a Ken Burns push for screenshots that are not tall", () => {
    const s = animated("scroll", { loop: "once" });
    const a = evaluateScene(s, 0, ctx);
    const b = evaluateScene(s, s.animation!.duration * 0.9, ctx);
    expect(b.card.transform.scale).toBeGreaterThan(a.card.transform.scale);
  });

  it("drifts every kind of background fill seamlessly", () => {
    const fills: Scene["background"]["fill"][] = [
      {
        kind: "linear",
        angle: 120,
        stops: [
          { offset: 0, color: "#ff0000" },
          { offset: 1, color: "#0000ff" },
        ],
      },
      {
        kind: "radial",
        cx: 0.5,
        cy: 0.5,
        radius: 1,
        stops: [
          { offset: 0, color: "#ff0000" },
          { offset: 1, color: "#0000ff" },
        ],
      },
      {
        kind: "conic",
        cx: 0.5,
        cy: 0.5,
        angle: 0,
        stops: [
          { offset: 0, color: "#ff0000" },
          { offset: 1, color: "#0000ff" },
        ],
      },
      { kind: "auto", style: "mesh", variant: 0 },
    ];
    for (const fill of fills) {
      const s = setIn(animated("drift"), ["background", "fill"], fill);
      const mid = evaluateScene(s, s.animation!.duration / 4, ctx);
      expect(JSON.stringify(mid.background.fill)).not.toBe(JSON.stringify(fill));
    }
  });
});

describe("annotation draw-on", () => {
  it("staggers reveals and never hides redactions", () => {
    let s = animated("draw", { loop: "once", duration: 3 });
    s = addAnnotation(s, createAnnotation("arrow", "a1"));
    s = addAnnotation(s, createAnnotation("redact", "r1"));
    s = addAnnotation(s, createAnnotation("text", "t1"));
    const list = revealAnnotations(s.annotations, 0.2);
    expect(list[0]!.reveal).toBeGreaterThan(0);
    expect(list[1]!.reveal).toBeUndefined();
    expect(list[2]!.reveal ?? 1).toBeLessThan(list[0]!.reveal!);
    const start = evaluateScene(s, 0, ctx);
    expect(start.annotations.find((a) => a.id === "a1")!.reveal).toBe(0);
    expect(start.annotations.find((a) => a.id === "r1")!.reveal).toBeUndefined();
    const end = evaluateScene(s, 2.95, ctx);
    expect(end.annotations.every((a) => a.reveal === undefined)).toBe(true);
  });

  it("leaves annotations alone when draw-on is off", () => {
    let s = animated("reveal", { annotations: false });
    s = addAnnotation(s, createAnnotation("arrow", "a1"));
    expect(evaluateScene(s, 0, ctx).annotations[0]!.reveal).toBeUndefined();
  });
});

describe("schema", () => {
  it("normalizes animation settings and migrates v1 scenes", () => {
    const { scene, issues } = normalizeScene({
      ...createScene(),
      animation: { preset: "float", duration: 99, fps: 5, easing: "wobbly", loop: "boomerang" },
    });
    expect(scene.animation).toMatchObject({
      preset: "float",
      duration: 20,
      fps: 10,
      easing: "smooth",
      loop: "boomerang",
    });
    expect(issues.length).toBeGreaterThan(0);
    const v1 = { ...createScene(), version: 1 };
    const loaded = loadScene(v1);
    expect(loaded.scene.version).toBe(SCENE_VERSION);
    expect(loaded.migratedFrom).toBe(1);
    expect(loaded.scene.animation).toBeUndefined();
  });

  it("never persists render-time reveal progress", () => {
    const s = addAnnotation(createScene(), { ...createAnnotation("arrow", "a"), reveal: 0.3 });
    expect(normalizeScene(s).scene.annotations[0]!.reveal).toBeUndefined();
  });
});

describe("planAnimation", () => {
  it("sizes video to even dimensions and caps GIF fps", () => {
    const s = setIn(animated("float", { fps: 60 }), ["canvas", "size"], {
      kind: "fixed",
      width: 1201,
      height: 631,
    });
    const v = planAnimation(s, assets, { format: "mp4", scale: 1 });
    expect([v.width % 2, v.height % 2]).toEqual([0, 0]);
    expect(v.fps).toBe(60);
    expect(v.frames).toBe(240);
    const g = planAnimation(s, assets, { format: "gif", scale: 0.5 });
    expect(g.fps).toBe(50);
    expect(g.width).toBe(601);
  });
});
