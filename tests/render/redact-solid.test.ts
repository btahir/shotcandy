/**
 * Solid-box redaction: an opaque box that leaves nothing of what it covers in
 * any render (preview sizes, exports, thumbnails, tilted cards, grid cells,
 * animation frames), with an "auto" colour that suits the pixels around it.
 */
import { createCanvas } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import {
  MapAssetResolver,
  REDACT_ON_DARK,
  REDACT_ON_LIGHT,
  RenderCache,
  contentToCanvas,
  createAnimation,
  createAnnotation,
  createScene,
  evaluateFrame,
  layoutScene,
  parseColor,
  renderToCanvas,
  setIn,
  type AssetSource,
  type RedactAnnotation,
  type Scene,
} from "@/engine";
import { nodeEnv, pixel, pixelsOf } from "../helpers/node-canvas";

/** The band that holds "the secret": image rows 40..120, columns 40..360 of 400 x 800. */
const BAND = { x0: 40, y0: 40, x1: 360, y1: 120 };

/**
 * A phone-sized capture on a plain background with a secret band. `variant`
 * changes only the pixels inside the band, so two variants differ only where
 * the box covers.
 */
function capture(id: string, variant: 0 | 1, bg = "#d8d8d8"): AssetSource {
  const W = 400;
  const H = 800;
  const c = createCanvas(W, H);
  const g = c.getContext("2d");
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  for (let y = BAND.y0; y < BAND.y1; y += 2)
    for (let x = BAND.x0; x < BAND.x1; x += 2) {
      const on = ((x + y) / 2 + variant) % 2 === 0;
      g.fillStyle = on ? "#000000" : "#ff2d55";
      g.fillRect(x, y, 2, 2);
    }
  return {
    id,
    width: W,
    height: H,
    images: [{ image: c as unknown as CanvasImageSource, width: W, height: H }],
  };
}

/** The box exactly over the band (its edges touch the secret: the hardest case). */
function box(fill: RedactAnnotation["fill"] = "#000000"): RedactAnnotation {
  return {
    ...(createAnnotation("redact", "s1") as RedactAnnotation),
    x: BAND.x0 / 400,
    y: BAND.y0 / 800,
    w: (BAND.x1 - BAND.x0) / 400,
    h: (BAND.y1 - BAND.y0) / 800,
    mode: "solid",
    fill,
  };
}

const assets = new MapAssetResolver([
  capture("a", 0),
  capture("b", 1),
  capture("dark", 0, "#1e1f24"),
  capture("d1", 0),
  capture("d2", 1),
  capture("d3", 0),
]);

function scene(assetId: string, r: RedactAnnotation | null): Scene {
  let s = createScene({ content: { kind: "image", assetId } });
  s = setIn(s, ["card", "shadow", "preset"], "none");
  return { ...s, annotations: r ? [r] : [] };
}

const render = (s: Scene, scale = 1) =>
  renderToCanvas(s, assets, { env: nodeEnv, cache: new RenderCache(), scale }).canvas;

/** Two scenes that differ only in the secret render byte-identical pixels. */
function same(sa: Scene, sb: Scene, scale = 1): boolean {
  const pa = pixelsOf(render(sa, scale));
  const pb = pixelsOf(render(sb, scale));
  return pa.length === pb.length && pa.every((v, i) => v === pb[i]);
}

const withAsset = (s: Scene, id: string): Scene => ({
  ...s,
  content: { ...s.content, assetId: id } as Scene["content"],
});

describe("solid redaction", () => {
  it("fills every pixel of the box with the opaque colour", () => {
    const s = scene("a", box("#123456"));
    const out = render(s);
    const l = layoutScene(s, assets);
    const p0 = contentToCanvas(l, BAND.x0 / 400, BAND.y0 / 800);
    const p1 = contentToCanvas(l, BAND.x1 / 400, BAND.y1 / 800);
    let n = 0;
    for (let y = Math.ceil(p0.y + 1); y < Math.floor(p1.y - 1); y++)
      for (let x = Math.ceil(p0.x + 1); x < Math.floor(p1.x - 1); x++) {
        expect(pixel(out, x, y)).toEqual([0x12, 0x34, 0x56, 255]);
        n++;
      }
    expect(n).toBeGreaterThan(1000);
  });

  it("leaves nothing of what is underneath, anywhere in the image", () => {
    const cases: [string, Scene, number][] = [
      ["single", scene("a", box()), 1],
      ["export 2x", scene("a", box()), 2],
      ["thumbnail", scene("a", box()), 0.23],
      ["auto colour", scene("a", box("auto")), 1],
      [
        "tilted",
        setIn(scene("a", box()), ["card", "tilt"], {
          rotateX: 12,
          rotateY: -24,
          rotateZ: 3,
          perspective: 2.2,
        }),
        1,
      ],
      [
        "smooth sampling",
        { ...scene("a", box()), content: { kind: "image", assetId: "a", sampling: "smooth" } },
        1,
      ],
    ];
    for (const [label, s, scale] of cases) {
      expect(same(s, withAsset(s, "b"), scale), label).toBe(true);
    }
  });

  it("the check above is meaningful: blur and no redaction both differ", () => {
    const blur = { ...box(), mode: "blur" as const, strength: 12 };
    expect(same(scene("a", blur), scene("b", blur))).toBe(false);
    expect(same(scene("a", null), scene("b", null))).toBe(false);
  });

  it("hides the secret on a grid cell that shows part of the image", () => {
    const grid = (id: string): Scene => ({
      ...scene(id, box()),
      layout: { id: "grid", count: 4 },
      slots: [{ assetId: "d1" }, { assetId: "d2" }, { assetId: "d3" }],
    });
    expect(same(grid("a"), grid("b"))).toBe(true);
    expect(same(grid("a"), grid("b"), 0.3)).toBe(true);
  });

  it("hides the secret on every animation frame", () => {
    const anim = (id: string): Scene => ({
      ...scene(id, box("auto")),
      animation: { ...createAnimation("focus"), duration: 1, fps: 10 },
    });
    for (const n of [0, 4, 9]) {
      const fa = evaluateFrame(anim("a"), n, { assets });
      const fb = evaluateFrame(anim("b"), n, { assets });
      expect(same(fa, fb), `frame ${n}`).toBe(true);
    }
  });

  it("draws a translucent custom colour opaque", () => {
    const s = scene("a", box("#ff000080"));
    const l = layoutScene(s, assets);
    const c = contentToCanvas(l, 0.5, 0.1);
    expect(pixel(render(s), c.x, c.y)).toEqual([255, 0, 0, 255]);
  });

  it("auto picks dark on light surroundings and light on dark ones, at every size", () => {
    for (const [id, want] of [
      ["a", REDACT_ON_LIGHT],
      ["dark", REDACT_ON_DARK],
    ] as const) {
      const s = scene(id, box("auto"));
      const l = layoutScene(s, assets);
      const rgb = parseColor(want);
      for (const scale of [0.3, 1, 2]) {
        const c = contentToCanvas(l, 0.5, 0.1);
        expect(pixel(render(s, scale), c.x * scale, c.y * scale), `${id} @${scale}`).toEqual([
          rgb.r,
          rgb.g,
          rgb.b,
          255,
        ]);
      }
    }
  });

  it("older blur and pixelate redactions render as before", () => {
    // Same scene with and without a stray fill: fill only matters to solid boxes.
    const pix = { ...box(), mode: "pixelate" as const, strength: 20, fill: undefined };
    const withFill = { ...pix, fill: "#ffffff" };
    expect(same(scene("a", pix), scene("a", withFill))).toBe(true);
  });
});
