/**
 * Visual regression: renders the reference scenes in Chromium through the
 * real engine and compares the pixels with committed baselines.
 * Update baselines intentionally with `pnpm test:e2e:update`.
 */
import { REFERENCE_SCENES } from "../scenes";
import { call, dataUrlToBuffer, expect, test } from "../fixtures";

test.describe("reference scenes", () => {
  test.beforeEach(async ({ harness }) => {
    await call(harness, "load", "wallpaper", "/fixtures/peach-dunes.webp");
  });

  for (const ref of REFERENCE_SCENES) {
    test(ref.name, async ({ harness }) => {
      const r = await call(harness, "render", ref.scene, ref.scale, true);
      expect(dataUrlToBuffer(r.dataUrl)).toMatchSnapshot(`${ref.name}.png`);
    });
  }

  test("at least 20 reference designs", () => {
    expect(REFERENCE_SCENES.length).toBeGreaterThanOrEqual(20);
  });
});
