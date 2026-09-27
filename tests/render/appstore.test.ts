/** App Store sets in Node (Skia): exact sizes, flowing backgrounds, text, opaque PNGs, ZIPs. */
import { writeFileSync, mkdirSync } from "node:fs";
import { unzipSync } from "fflate";
import { PNG } from "pngjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type AppStoreSet,
  MapAssetResolver,
  RenderCache,
  SET_STYLES,
  createSet,
  createSetTemplate,
  deepMerge,
  headlineWidth,
  layoutScene,
  normalizeScene,
  normalizeSet,
  renderToCanvas,
  setCanvasSize,
  setMeasureEnvironment,
  slideScene,
} from "@/engine";
import { encodePngRgb, zipFiles } from "@/engine/appstore/pack";
import { nodeEnv, pixel, pixelsOf, syntheticScreenshot } from "../helpers/node-canvas";

beforeAll(() => setMeasureEnvironment(nodeEnv));
afterAll(() => setMeasureEnvironment(null));

const shot = syntheticScreenshot(1290, 2796, "#ff4f7b");
const assets = new MapAssetResolver([shot]);

function set(patch: Partial<AppStoreSet> = {}): AppStoreSet {
  return { ...createSet(4), ...patch };
}
const render = (s: ReturnType<typeof slideScene>, scale = 0.25) =>
  renderToCanvas(s, assets, { env: nodeEnv, scale, cache: new RenderCache() }).canvas;

describe("slide scenes", () => {
  it("are exactly the App Store size, portrait or landscape", () => {
    const st = set();
    const tpl = createSetTemplate();
    for (let i = 0; i < st.slides.length; i++) {
      const l = layoutScene(slideScene(st, tpl, i, assets), assets);
      expect(l.canvas).toEqual({ width: 1320, height: 2868 });
    }
    const land = set({ landscape: true, sizePresetId: "appstore-ipad-13" });
    expect(setCanvasSize(land)).toEqual({ width: 2752, height: 2064 });
    expect(layoutScene(slideScene(land, tpl, 0, assets), assets).canvas).toEqual({
      width: 2752,
      height: 2064,
    });
  });

  it("puts the headline above the device and keeps the device on the canvas", () => {
    const st = set();
    const tpl = createSetTemplate();
    const s = slideScene(st, tpl, 0, assets);
    const l = layoutScene(s, assets);
    const head = s.annotations.find((a) => a.id === "headline")!;
    expect(head.kind === "text" && head.y).toBeLessThan(0.2);
    const ys = l.cardQuad.map((p) => p.y);
    const xs = l.cardQuad.map((p) => p.x);
    expect(Math.min(...ys)).toBeGreaterThan(head.kind === "text" ? head.y * 2868 : 0);
    expect(Math.max(...ys)).toBeLessThanOrEqual(2868);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThanOrEqual(1320);
    // Bottom text puts the device on top.
    const bottom = slideScene({ ...st, text: { ...st.text, position: "bottom" } }, tpl, 0, assets);
    const hb = bottom.annotations.find((a) => a.id === "headline")!;
    expect(hb.kind === "text" && hb.y).toBeGreaterThan(0.7);
    // Headlines wrap inside the canvas.
    const long = {
      ...st.slides[0]!,
      headline: "A very long headline that must wrap onto several lines to fit",
    };
    expect(headlineWidth(st, long)).toBeLessThanOrEqual(1320 * 0.84 + 1);
  });

  it("uses the slide's screenshot, or a placeholder screen", () => {
    const st = set();
    st.slides[1] = { ...st.slides[1]!, assetId: shot.id };
    const tpl = createSetTemplate();
    expect(slideScene(st, tpl, 0, assets).content.kind).toBe("placeholder");
    expect(slideScene(st, tpl, 1, assets).content).toEqual({ kind: "image", assetId: shot.id });
  });

  it("flows one background across slides without seams", () => {
    const tpl = deepMerge(createSetTemplate(), {
      background: {
        fill: {
          kind: "linear",
          angle: 90,
          stops: [
            { offset: 0, color: "#ff0000" },
            { offset: 1, color: "#0000ff" },
          ],
        },
        grain: { amount: 0 },
      },
    });
    const st = set();
    const a = render(slideScene(st, tpl, 1, assets));
    const b = render(slideScene(st, tpl, 2, assets));
    const w = 1320 * 0.25;
    const y = 2868 * 0.25 - 4;
    const right = pixel(a, w - 1, y);
    const left = pixel(b, 0, y);
    expect(Math.abs(right[0] - left[0]) + Math.abs(right[2] - left[2])).toBeLessThan(8);
    // Without flow, each slide shows the whole gradient.
    const c = render(slideScene({ ...st, flow: false }, tpl, 2, assets));
    expect(pixel(c, 0, y)[0]).toBeGreaterThan(pixel(b, 0, y)[0] + 60);
    mkdirSync("test-results/appstore", { recursive: true });
    writeFileSync(
      "test-results/appstore/slide-1.png",
      (a as unknown as { toBuffer: (t: string) => Buffer }).toBuffer("image/png"),
    );
  });

  it("scene JSON survives normalization (span included)", () => {
    const s = slideScene(set(), createSetTemplate(), 2, assets);
    const n = normalizeScene(JSON.parse(JSON.stringify(s))).scene;
    expect(n.background.span).toEqual({ index: 2, count: 4 });
    expect(n.annotations.map((x) => x.id)).toEqual(["headline", "subhead"]);
  });

  it("every set style renders", () => {
    const st = set();
    for (const style of SET_STYLES) {
      const tpl = deepMerge(createSetTemplate(), style.patch as never);
      expect(pixelsOf(render(slideScene(st, tpl, 0, assets), 0.1)).length).toBeGreaterThan(0);
    }
  });
});

describe("set validation", () => {
  it("repairs sets read back from storage", () => {
    const s = normalizeSet({
      sizePresetId: "nope",
      slides: [{ headline: 5 }],
      text: { size: 9, color: "red" },
    });
    expect(s.sizePresetId).toBe("appstore-iphone-69");
    expect(s.slides.length).toBe(3);
    expect(s.text.size).toBe(1.4);
    expect(s.text.color).toBe("#2a1f1a");
    expect(normalizeSet(null).slides.length).toBe(5);
  });
});

describe("packing", () => {
  it("encodes opaque 24-bit PNGs with identical pixels", () => {
    const w = 37;
    const h = 11;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      rgba[i * 4] = (i * 7) & 255;
      rgba[i * 4 + 1] = (i * 13) & 255;
      rgba[i * 4 + 2] = (i * 29) & 255;
      rgba[i * 4 + 3] = 255;
    }
    const png = PNG.sync.read(Buffer.from(encodePngRgb(rgba, w, h)));
    expect([png.width, png.height, png.colorType, png.alpha]).toEqual([w, h, 2, false]);
    for (let i = 0; i < w * h; i++) {
      expect([png.data[i * 4], png.data[i * 4 + 1], png.data[i * 4 + 2]]).toEqual([
        rgba[i * 4],
        rgba[i * 4 + 1],
        rgba[i * 4 + 2],
      ]);
    }
  });

  it("zips files", () => {
    const z = zipFiles([
      { name: "set/01.png", data: new Uint8Array([1, 2, 3]) },
      { name: "set/02.png", data: new Uint8Array([4]) },
    ]);
    const out = unzipSync(z);
    expect(Object.keys(out).sort()).toEqual(["set/01.png", "set/02.png"]);
    expect([...out["set/02.png"]!]).toEqual([4]);
  });
});
