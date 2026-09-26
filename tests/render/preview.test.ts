// Temporary visual scratch test: renders scenes to PNG for manual inspection.
import { writeFileSync, mkdirSync } from "node:fs";
import { describe, it } from "vitest";
import {
  MapAssetResolver,
  applyStylePatch,
  createScene,
  STYLE_PRESETS,
  renderToCanvas,
  RenderCache,
  createAnnotation,
} from "@/engine";
import { loadAsset, nodeEnv, toPng } from "../helpers/node-canvas";

const OUT = process.env.PREVIEW_OUT;
describe.skipIf(!OUT)("preview", () => {
  it("renders all styles", async () => {
    mkdirSync(OUT!, { recursive: true });
    const a = await loadAsset("dash", "brand/samples/sample-dashboard-light.png");
    const m = await loadAsset("mob", "brand/samples/sample-mobile-habits.png");
    const assets = new MapAssetResolver([a, m]);
    for (const p of STYLE_PRESETS) {
      let s = applyStylePatch(
        createScene({
          content: { kind: "image", assetId: p.patch.card?.frame?.id === "phone" ? "mob" : "dash" },
        }),
        p.patch,
        p.id,
      );
      s = { ...s, canvas: { ...s.canvas, size: { kind: "fixed", width: 1200, height: 750 } } };
      if (p.id === "sherbet")
        s = {
          ...s,
          annotations: [
            createAnnotation("arrow", "a1"),
            { ...createAnnotation("text", "t1"), y: 0.2, background: "#ffffff" },
            { ...createAnnotation("rect", "r1") },
            createAnnotation("redact", "b1"),
          ],
        };
      const t0 = performance.now();
      const r = renderToCanvas(s, assets, { env: nodeEnv, cache: new RenderCache(), scale: 1 });
      writeFileSync(`${OUT}/${p.id}.png`, toPng(r.canvas));
      console.log(p.id, r.width, r.height, (performance.now() - t0).toFixed(0) + "ms");
    }
  });
});
