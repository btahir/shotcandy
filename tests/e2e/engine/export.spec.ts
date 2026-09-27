/**
 * Export correctness in a real browser: every size preset at every scale
 * produces a file of exactly the stated dimensions; formats encode with the
 * right MIME type; the worker path matches the main thread pixel for pixel;
 * renders are deterministic.
 */
import {
  SIZE_PRESETS,
  applyStylePatch,
  createScene,
  getStylePreset,
  setIn,
  type Scene,
} from "../../../src/engine";
import { call, expect, test } from "../fixtures";

function sceneFor(asset: string, size: Scene["canvas"]["size"], styleId = "sherbet"): Scene {
  const s = applyStylePatch(
    createScene({ content: { kind: "image", assetId: asset } }),
    getStylePreset(styleId)!.patch,
    styleId,
  );
  return setIn(s, ["canvas", "size"], size);
}

test.describe("export dimensions", () => {
  for (const preset of SIZE_PRESETS) {
    test(`${preset.id} at 1x-4x`, async ({ harness }) => {
      const asset =
        preset.id.includes("story") || preset.id.includes("9x16") || preset.id.includes("iphone")
          ? "mobile"
          : "dashboard";
      const scene = sceneFor(asset, preset.size);
      for (const scale of [1, 2, 3, 4]) {
        // JPEG keeps the 4x encodes fast; dimensions are format-independent.
        const r = await call(harness, "export", scene, "jpeg", scale, "main");
        expect(r.decodedWidth).toBe(r.width);
        expect(r.decodedHeight).toBe(r.height);
        if (preset.size.kind === "fixed") {
          expect([r.width, r.height]).toEqual([
            preset.size.width * scale,
            preset.size.height * scale,
          ]);
        } else if (preset.size.kind === "aspect") {
          expect((r.width as number) / (r.height as number)).toBeCloseTo(
            preset.size.ratioW / preset.size.ratioH,
            2,
          );
        }
      }
    });
  }
});

test.describe("formats", () => {
  test("PNG, JPEG and WebP encode with the right type and size", async ({ harness }) => {
    const scene = sceneFor("dashboard", { kind: "fixed", width: 1200, height: 630 });
    for (const format of ["png", "jpeg", "webp"] as const) {
      const r = await call(harness, "export", scene, format, 2, "main");
      expect(r.mime).toBe(`image/${format}`);
      expect([r.decodedWidth, r.decodedHeight]).toEqual([2400, 1260]);
    }
    const png = await call(harness, "export", scene, "png", 1, "main");
    expect(png.headerDims).toEqual({ width: 1200, height: 630 });
  });

  test("auto size exports the screenshot at native resolution", async ({ harness }) => {
    const scene = setIn(
      sceneFor("dashboard", { kind: "auto" }, "from-your-shot"),
      ["canvas", "padding"],
      100,
    );
    const r = await call(harness, "export", scene, "png", 1, "main");
    // 2880x1800 shot + 2 x 100 cu padding at 2.88 px/cu.
    expect([r.width, r.height]).toEqual([3456, 2376]);
  });
});

test.describe("parity and determinism", () => {
  const scenes: [string, () => Scene][] = [
    [
      "mesh + frame + shadow",
      () => sceneFor("dashboard", { kind: "fixed", width: 1600, height: 1000 }),
    ],
    [
      "auto palette + grain",
      () =>
        setIn(
          sceneFor("settings", { kind: "fixed", width: 1200, height: 900 }, "from-your-shot"),
          ["background", "grain", "amount"],
          0.3,
        ),
    ],
    [
      "tilt",
      () => sceneFor("kanban", { kind: "fixed", width: 1600, height: 1000 }, "tilted-taffy"),
    ],
  ];
  for (const [name, make] of scenes) {
    test(`worker export matches main thread: ${name}`, async ({ harness }) => {
      const scene = make();
      const main = await call(harness, "export", scene, "png", 1, "main", true);
      const worker = await call(harness, "export", scene, "png", 1, "worker", true);
      expect(worker.via).toBe("worker");
      expect(worker.pixelHash).toBe(main.pixelHash);
    });
  }

  test("repeated renders are pixel-identical", async ({ harness }) => {
    const scene = make3();
    const a = await call(harness, "render", scene, 1, true);
    const b = await call(harness, "render", scene, 1, true);
    const c = await call(harness, "render", scene, 1, false);
    expect(b.dataUrl).toBe(a.dataUrl);
    expect(c.dataUrl).toBe(a.dataUrl);
  });
});

function make3(): Scene {
  return setIn(
    sceneFor("editor", { kind: "fixed", width: 1200, height: 800 }, "midnight"),
    ["card", "tilt"],
    {
      rotateX: 10,
      rotateY: -18,
      rotateZ: 2,
      perspective: 2.5,
    },
  );
}
