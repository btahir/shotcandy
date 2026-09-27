/** Round-2 review fixes that need real pixels or text measurement (Skia in Node). */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type AppStoreSet,
  DEFAULT_CAPTION,
  createScene,
  normalizeScene,
  renderToCanvas,
  setIn,
  EMPTY_ASSETS,
  MapAssetResolver,
  createSet,
  createSetTemplate,
  deviceCrop,
  headlineLineCount,
  layoutScene,
  normalizeSet,
  orientationMismatch,
  slideScene,
  RenderCache,
  fromGradientEdit,
  measureText,
  postLayout,
  richRuns,
  samplePost,
  setMeasureEnvironment,
  wrapText,
} from "@/engine";
import { drawBackground } from "@/engine/render/background";
import { nodeEnv, pixel, syntheticScreenshot } from "../helpers/node-canvas";

beforeAll(() => setMeasureEnvironment(nodeEnv));
afterAll(() => setMeasureEnvironment(null));

const URL60 = "https://quokka.dev/blog/onboarding-rewrite-2026-what-we-learned";
const WORD40 = "supercalifragilisticexpialidociousness-x";

describe("N2: long URLs and words wrap inside the card", () => {
  it("never produces a line wider than the text box", () => {
    for (const variant of ["social", "testimonial"] as const) {
      const base = samplePost(variant);
      const c = { ...base, text: `Read this: ${URL60} and ${WORD40} ${WORD40}${WORD40} done.` };
      const L = postLayout(c);
      const max = L.width - L.pad * 2;
      for (const line of L.lines)
        expect(measureText(L.bodyFont, line)).toBeLessThanOrEqual(max + 0.5);
      // Nothing lost: the lines hold every character of the text (spaces aside).
      expect(L.lines.join("").replace(/\s/g, "")).toBe(c.text.replace(/\s/g, ""));
    }
  });

  it("prefers breaking a URL after a slash or dash", () => {
    const font = "400 20px sans-serif";
    const lines = wrapText(font, URL60, 260);
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines.slice(0, -1)) expect(/[/\-_.?&=#:,]$/.test(l)).toBe(true);
  });
});

describe("N5: conic gradients have no seam", () => {
  it("blends the last colour back into the first", () => {
    const fill = fromGradientEdit({
      type: "conic",
      angle: 0,
      stops: [
        { offset: 0, color: "#ff8fb0" },
        { offset: 0.5, color: "#7a5cff" },
        { offset: 1, color: "#ffc7b8" },
      ],
    });
    expect(fill.kind).toBe("conic");
    if (fill.kind !== "conic") return;
    // No closing stop squeezed 0.001 away from its neighbour.
    for (let i = 1; i < fill.stops.length; i++)
      expect(fill.stops[i]!.offset - fill.stops[i - 1]!.offset).toBeGreaterThan(0.1);
    const W = 240;
    const c = nodeEnv.createCanvas(W, W);
    const g = c.getContext("2d") as unknown as Parameters<typeof drawBackground>[0];
    drawBackground(g, fill, { amount: 0, size: 1, seed: 1 }, W, W, {
      env: nodeEnv,
      cache: new RenderCache(),
      assets: EMPTY_ASSETS,
      palette: null,
      unit: 1,
      scale: 1,
    });
    // angle 0 puts the join straight up from the centre: compare pixels either side of it.
    const diff = (a: number[], b: number[]) =>
      Math.max(...a.slice(0, 3).map((v, i) => Math.abs(v - b[i]!)));
    const across = diff(pixel(c, W / 2 - 3, 12), pixel(c, W / 2 + 3, 12));
    const elsewhere = diff(pixel(c, 12, W / 2 - 3), pixel(c, 12, W / 2 + 3));
    expect(across).toBeLessThan(18);
    expect(across).toBeLessThanOrEqual(elsewhere + 12);
  });
});

describe("N3/N4: App Store slides", () => {
  const shot = syntheticScreenshot(1290, 2796, "#ff4f7b");
  const wide = syntheticScreenshot(2880, 1800, "#4f8bff");
  const assets = new MapAssetResolver([shot, wide]);
  const tpl = createSetTemplate();

  it("puts every device at the same height whatever the headline length", () => {
    const base = createSet(4);
    const set: AppStoreSet = {
      ...base,
      slides: base.slides.map((s, i) => ({
        ...s,
        assetId: shot.id,
        headline: [
          "Short",
          "A headline that wraps onto a second line",
          "One more that is long enough to need three whole lines here",
          "Hi",
        ][i]!,
      })),
    };
    const tops = set.slides.map((_, i) => {
      const l = layoutScene(slideScene(set, tpl, i, assets), assets);
      return Math.round(Math.min(...l.cardQuad.map((p) => p.y)));
    });
    expect(new Set(tops).size).toBe(1);
    for (const pos of ["bottom"] as const) {
      const s2 = { ...set, text: { ...set.text, position: pos } };
      const bottoms = s2.slides.map((_, i) => {
        const l = layoutScene(slideScene(s2, tpl, i, assets), assets);
        return Math.round(Math.max(...l.cardQuad.map((p) => p.y)));
      });
      expect(new Set(bottoms).size).toBe(1);
    }
    expect(headlineLineCount(set, set.slides[2]!)).toBeGreaterThanOrEqual(2);
  });

  it("spots landscape shots in portrait sets and crops them to the device", () => {
    const set = createSet(3);
    expect(orientationMismatch(set, wide)).toBe(true);
    expect(orientationMismatch(set, shot)).toBe(false);
    const crop = deviceCrop(set, wide);
    expect(crop.height).toBe(1);
    expect(((crop.width * 2880) / 1800) * (2796 / 1290)).toBeCloseTo(1, 2);
    const s: AppStoreSet = {
      ...set,
      slides: set.slides.map((sl, i) => (i === 0 ? { ...sl, assetId: wide.id, crop } : sl)),
    };
    const scene = slideScene(s, tpl, 0, assets);
    expect(scene.content).toMatchObject({ kind: "image", crop });
    expect(normalizeSet(JSON.parse(JSON.stringify(s))).slides[0]!.crop).toEqual(crop);
  });
});

describe("N2: a wrapped link keeps its colour on every line", () => {
  it("marks the continuation of a URL as accent", () => {
    const text = `Read ${URL60} today`;
    const L = postLayout({ ...samplePost("social"), text });
    const runs = richRuns(text, L.lines);
    const accentText = runs
      .flat()
      .filter(([, on]) => on)
      .map(([t]) => t)
      .join("");
    expect(accentText).toBe(URL60);
  });
});

describe("N14: caption card on tall canvases", () => {
  const wide = syntheticScreenshot(2880, 1800, "#4f8bff");
  const assets = new MapAssetResolver([wide]);
  const base = setIn(
    createScene({ content: { kind: "image", assetId: wide.id } }),
    ["canvas", "size"],
    { kind: "fixed", width: 1080, height: 1920, presetId: "instagram-story" },
  );

  it("puts the text at the top and the card in the space below, inside the canvas", () => {
    const plain = layoutScene(base, assets);
    const withCap = layoutScene({ ...base, caption: { ...DEFAULT_CAPTION } }, assets);
    expect(withCap.canvas).toEqual({ width: 1080, height: 1920 });
    const cap = withCap.caption!;
    expect(cap.height).toBeGreaterThan(200);
    expect(cap.blocks.map((b) => b.role)).toEqual(["headline", "subhead"]);
    const top = Math.min(...withCap.cardQuad.map((p) => p.y));
    const bottom = Math.max(...withCap.cardQuad.map((p) => p.y));
    const last = cap.blocks[cap.blocks.length - 1]!;
    expect(top).toBeGreaterThan(last.box.y + last.box.height);
    // Text and card sit together as a group, centred: equal space above and below.
    const above = cap.blocks[0]!.box.y;
    expect(Math.abs(above - (1920 - bottom))).toBeLessThan(4);
    expect(bottom).toBeLessThanOrEqual(1920);
    // The empty band shrinks: the card sits lower than when centred.
    expect(top).toBeGreaterThan(Math.min(...plain.cardQuad.map((p) => p.y)));
    // Disabled or empty captions change nothing.
    const off = layoutScene({ ...base, caption: { ...DEFAULT_CAPTION, enabled: false } }, assets);
    expect(off.cardQuad).toEqual(plain.cardQuad);
    const empty = layoutScene(
      { ...base, caption: { ...DEFAULT_CAPTION, headline: " ", subhead: "" } },
      assets,
    );
    expect(empty.caption).toBeUndefined();
  });

  it("grows an auto canvas by the caption height and keeps native pixels", () => {
    const auto = setIn(base, ["canvas", "size"], { kind: "auto" });
    const plain = layoutScene(auto, assets);
    const withCap = layoutScene({ ...auto, caption: { ...DEFAULT_CAPTION } }, assets);
    expect(withCap.canvas.width).toBe(plain.canvas.width);
    expect(withCap.canvas.height).toBe(plain.canvas.height + Math.round(withCap.caption!.height));
    expect(withCap.k).toBe(plain.k);
  });

  it("draws the headline in ink on light backgrounds and white on dark ones", () => {
    const render = (color: string) => {
      const s = setIn(
        { ...base, caption: { ...DEFAULT_CAPTION, headline: "████", subhead: "" } },
        ["background", "fill"],
        { kind: "solid", color },
      );
      const l = layoutScene(s, assets);
      const b = l.caption!.blocks[0]!;
      const { canvas } = renderToCanvas(s, assets, { env: nodeEnv, cache: new RenderCache() });
      return pixel(canvas, 540, Math.round(b.lines[0]!.y));
    };
    expect(render("#fbf5ec")[0]).toBeLessThan(80);
    expect(render("#1a1411")[0]).toBeGreaterThan(200);
    expect(
      normalizeScene(JSON.parse(JSON.stringify({ ...base, caption: DEFAULT_CAPTION }))).scene
        .caption,
    ).toEqual(DEFAULT_CAPTION);
  });
});
