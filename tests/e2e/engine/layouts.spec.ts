/**
 * Multi-screen layouts in a real browser: visual baselines for every layout
 * (plain, window-frame and dark styles; phone and desktop screenshots; empty
 * slot placeholders), and exports of a multi-screen design through the
 * worker at 1x and 2x, matching the main thread pixel for pixel.
 */
import { createAnimation, setIn } from "../../../src/engine";
import { parseGif } from "../../helpers/media";
import { call, dataUrlToBuffer, expect, test } from "../fixtures";
import { DESKTOPS, LAYOUT_SCENES, PHONES, layoutScene } from "../layout-scenes";

test.describe("layout reference scenes", () => {
  for (const ref of LAYOUT_SCENES) {
    test(ref.name, async ({ harness }) => {
      const r = await call(harness, "renderLong", ref.scene, 720, !!ref.placeholders);
      expect(Math.max(r.width, r.height)).toBe(720);
      expect(dataUrlToBuffer(r.dataUrl)).toMatchSnapshot(`${ref.name}.png`);
    });
  }

  test("covers every layout", () => {
    const ids = new Set(LAYOUT_SCENES.map((r) => r.scene.layout!.id));
    expect([...ids].sort()).toEqual(
      ["cascade", "fan", "grid", "hero", "overlap", "side-by-side"].sort(),
    );
  });
});

test.describe("multi-screen export", () => {
  const scene = layoutScene("sherbet", { kind: "fixed", width: 1200, height: 800 }, "hero", [
    DESKTOPS[0]!,
    PHONES[0]!,
    PHONES[1]!,
  ]);

  for (const scale of [1, 2]) {
    test(`worker export matches the main thread at ${scale}x`, async ({ harness }) => {
      const main = await call(harness, "export", scene, "png", scale, "main", true);
      const worker = await call(harness, "export", scene, "png", scale, "worker", true);
      expect(worker.via).toBe("worker");
      expect([worker.decodedWidth, worker.decodedHeight]).toEqual([1200 * scale, 800 * scale]);
      expect(worker.headerDims).toEqual({ width: 1200 * scale, height: 800 * scale });
      expect(worker.pixelHash).toBe(main.pixelHash);
    });
  }

  test("auto canvases export every screen at native size, 2x exactly double", async ({
    harness,
  }) => {
    const auto = setIn(scene, ["canvas", "size"], { kind: "auto" });
    const one = await call(harness, "export", auto, "png", 1, "worker");
    const two = await call(harness, "export", auto, "png", 2, "worker");
    expect([two.decodedWidth, two.decodedHeight]).toEqual([
      (one.decodedWidth as number) * 2,
      (one.decodedHeight as number) * 2,
    ]);
  });

  test("animated export moves the group as one", async ({ harness }) => {
    const moving = { ...scene, animation: { ...createAnimation("float"), duration: 1, fps: 10 } };
    const r = await call(
      harness,
      "animate",
      moving,
      { format: "gif", scale: 0.25, quality: "small" },
      "worker",
    );
    const gif = parseGif(Buffer.from(r.base64, "base64"));
    expect([gif.width, gif.height]).toEqual([300, 200]);
    expect(gif.frames).toBe(10);
  });
});
