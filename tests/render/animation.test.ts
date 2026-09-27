/**
 * Animated rendering in Node (Skia): frame n always gives the same pixels,
 * draw-on progress changes what is drawn, and the GIF pipeline writes a valid
 * file with the right frame count and timing.
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  type Scene,
  MapAssetResolver,
  RenderCache,
  addAnnotation,
  createAnimation,
  createAnnotation,
  createScene,
  evaluateFrame,
  renderToCanvas,
  setIn,
} from "@/engine";
import { renderAnimation } from "@/engine/animation/export";
import { parseGif } from "../helpers/media";
import { nodeEnv, pixelsOf, syntheticScreenshot } from "../helpers/node-canvas";

const shot = syntheticScreenshot(640, 400);
const assets = new MapAssetResolver([shot]);
const ctx = { assets };

function scene(preset: string): Scene {
  let s = createScene({ content: { kind: "image", assetId: shot.id } });
  s = setIn(s, ["canvas", "size"], { kind: "fixed", width: 480, height: 300 });
  s = setIn(s, ["canvas", "padding"], 60);
  s = setIn(s, ["background", "fill"], {
    kind: "mesh",
    base: "#fff1e6",
    points: [
      { x: 0.1, y: 0.2, color: "#ff8fab", radius: 0.6 },
      { x: 0.9, y: 0.8, color: "#8b6cff", radius: 0.5 },
    ],
  });
  s = addAnnotation(s, createAnnotation("arrow", "a1"));
  s = addAnnotation(s, { ...createAnnotation("rect", "r1"), x: 0.1, y: 0.1 });
  return { ...s, animation: { ...createAnimation(preset), duration: 2, fps: 15 } };
}

const hash = (s: Scene, cache?: RenderCache) =>
  createHash("sha256")
    .update(
      pixelsOf(
        renderToCanvas(s, assets, { env: nodeEnv, cache: cache ?? new RenderCache() }).canvas,
      ),
    )
    .digest("hex");

describe("frame determinism", () => {
  for (const preset of ["reveal", "sweep", "float", "drift", "draw", "focus", "flip", "scroll"]) {
    it(`${preset}: frame n renders identical pixels every time`, () => {
      const s = scene(preset);
      const n = 11;
      const a = hash(evaluateFrame(s, n, ctx));
      // Same frame after rendering other frames through a shared cache.
      const shared = new RenderCache();
      for (const m of [0, 5, 20, 3]) hash(evaluateFrame(s, m, ctx), shared);
      const b = hash(evaluateFrame(s, n, ctx), shared);
      expect(b).toBe(a);
    });
  }

  it("different frames of a moving preset differ", () => {
    const s = scene("sweep");
    expect(hash(evaluateFrame(s, 3, ctx))).not.toBe(hash(evaluateFrame(s, 9, ctx)));
  });
});

describe("draw-on rendering", () => {
  it("draws nothing for hidden annotations and everything once revealed", () => {
    const s = scene("draw");
    const hidden = { ...s, annotations: s.annotations.map((a) => ({ ...a, reveal: 0 })) };
    const none = { ...s, annotations: [] };
    const full = { ...s, annotations: s.annotations.map((a) => ({ ...a, reveal: undefined })) };
    const half = { ...s, annotations: s.annotations.map((a) => ({ ...a, reveal: 0.5 })) };
    const strip = (x: Scene) => ({ ...x, animation: undefined });
    expect(hash(strip(hidden))).toBe(hash(strip(none)));
    expect(hash(strip(half))).not.toBe(hash(strip(full)));
    expect(hash(strip(half))).not.toBe(hash(strip(none)));
  });

  it("types text progressively", () => {
    let s = createScene({ content: { kind: "image", assetId: shot.id } });
    s = addAnnotation(s, {
      ...createAnnotation("text", "t"),
      text: "Hello there",
      background: "#ff4f7b",
    });
    const at = (r: number) => ({
      ...s,
      annotations: s.annotations.map((a) => ({ ...a, reveal: r })),
    });
    const hashes = new Set([0.1, 0.4, 0.7, 1].map((r) => hash(at(r))));
    expect(hashes.size).toBe(4);
  });
});

describe("GIF export", () => {
  it("writes a valid looping GIF with exact frame timing", async () => {
    const s = scene("float");
    let progress = 0;
    const r = await renderAnimation(
      s,
      assets,
      { format: "gif", scale: 0.5, quality: "balanced" },
      nodeEnv,
      {
        onProgress: (p) => {
          expect(p.done).toBeGreaterThan(progress - 1);
          progress = p.done;
        },
        yieldNow: () => Promise.resolve(),
      },
    );
    expect(r.mime).toBe("image/gif");
    expect(r.frames).toBe(30);
    expect(r.width).toBe(240);
    const g = parseGif(new Uint8Array(await r.blob.arrayBuffer()));
    expect(g.version).toBe("GIF89a");
    expect(g.trailer).toBe(true);
    expect([g.width, g.height]).toEqual([240, 150]);
    expect(g.frames).toBe(30);
    expect(g.loop).toBe(0);
    expect(g.delays.reduce((a, b) => a + b, 0)).toBe(200); // 2.0 s
    expect(g.globalColors).toBeLessThanOrEqual(128);
  });

  it("encodes byte-identical GIFs for the same scene", async () => {
    const s = scene("reveal");
    const run = async () =>
      Buffer.from(
        await (
          await renderAnimation(
            s,
            assets,
            { format: "gif", scale: 0.4, quality: "small" },
            nodeEnv,
            {
              yieldNow: () => Promise.resolve(),
            },
          )
        ).blob.arrayBuffer(),
      ).toString("base64");
    expect(await run()).toBe(await run());
  });

  it("can be cancelled between frames", async () => {
    let n = 0;
    await expect(
      renderAnimation(
        scene("drift"),
        assets,
        { format: "gif", scale: 0.3, quality: "small" },
        nodeEnv,
        {
          onProgress: () => void n++,
          isCancelled: () => n >= 3,
          yieldNow: () => Promise.resolve(),
        },
      ),
    ).rejects.toThrow(/cancelled/);
  });
});
