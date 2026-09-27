/**
 * Contact sheet: every built-in style on every sample screenshot, rendered by
 * the real engine. The quality gate for the preset library: every tile must
 * look deliberate on landscape, portrait, light and dark captures.
 *
 * Run:  CONTACT=1 pnpm vitest run tests/render/contact-sheet.test.ts
 * Env:  CONTACT_OUT=<dir>   output folder (default: test-results/contact)
 *       CONTACT_SIZE=<id>   size preset id for every tile (default: auto)
 *       CONTACT_STYLES=a,b  only these style ids
 *       CONTACT_TILE=<px>   tile width (default 420)
 *
 * Writes one sheet per style (`<size>-<style>.png`, 4 x 2 tiles).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { GlobalFonts, type Canvas, createCanvas, loadImage } from "@napi-rs/canvas";
import { describe, it } from "vitest";
import {
  MapAssetResolver,
  RenderCache,
  STYLE_PRESETS,
  type AssetSource,
  type Scene,
  applyStylePatch,
  createScene,
  getSizePreset,
  layoutScene,
  registerFont,
  renderToCanvas,
  WALLPAPER_PRESETS,
} from "@/engine";
import { loadAsset, nodeEnv } from "../helpers/node-canvas";

const RUN = !!process.env.CONTACT;
const OUT = process.env.CONTACT_OUT ?? "test-results/contact";
const TILE = Number(process.env.CONTACT_TILE ?? 420);

export const SAMPLES = [
  "dashboard-light",
  "editor-dark",
  "kanban-light",
  "landing-hero",
  "mobile-habits",
  "settings-dark",
  "tablet-reader",
  "terminal-code",
] as const;

export function registerSheetFonts(): void {
  GlobalFonts.registerFromPath("public/fonts/figtree-latin-wght-normal.woff2", "Figtree");
  GlobalFonts.registerFromPath(
    "public/fonts/bricolage-grotesque-latin-opsz-normal.woff2",
    "Bricolage Grotesque",
  );
  registerFont({ id: "ui", label: "UI", stack: "Figtree" });
  registerFont({ id: "sans", label: "Sans", stack: "Figtree" });
  registerFont({ id: "display", label: "Display", stack: '"Bricolage Grotesque"' });
}

export async function loadSheetAssets(): Promise<MapAssetResolver> {
  const srcs = await Promise.all(SAMPLES.map((n) => loadAsset(n, `brand/samples/sample-${n}.png`)));
  const walls: AssetSource[] = await Promise.all(
    WALLPAPER_PRESETS.map(async (w) => {
      const id = w.fill.kind === "image" ? w.fill.assetId : "";
      const img = await loadImage(`brand/backgrounds/${id.replace("builtin:", "")}.webp`);
      return {
        id,
        width: img.width,
        height: img.height,
        images: [
          { image: img as unknown as CanvasImageSource, width: img.width, height: img.height },
        ],
      };
    }),
  );
  return new MapAssetResolver([...srcs, ...walls]);
}

describe.skipIf(!RUN)("contact sheet", () => {
  it("renders every style x every sample", async () => {
    registerSheetFonts();
    mkdirSync(OUT, { recursive: true });
    const assets = await loadSheetAssets();
    const cache = new RenderCache();
    const sizeId = process.env.CONTACT_SIZE ?? "auto";
    const size = getSizePreset(sizeId)!.size;
    const only = process.env.CONTACT_STYLES?.split(",");
    const styles = STYLE_PRESETS.filter((s) => !only || only.includes(s.id));

    const tileH = Math.round(TILE * 0.78);
    const gap = 14;
    const label = 26;

    for (const style of styles) {
      const cols = 4;
      const rows = Math.ceil(SAMPLES.length / cols);
      const W = cols * TILE + (cols + 1) * gap;
      const H = rows * (tileH + label) + (rows + 1) * gap + 34;
      const sheet = createCanvas(W, H);
      const g = sheet.getContext("2d");
      g.fillStyle = "#e9e4dc";
      g.fillRect(0, 0, W, H);
      g.fillStyle = "#2a1f1a";
      g.font = "700 20px Figtree";
      g.fillText(`${style.name}  ·  ${style.id}  ·  ${sizeId}`, gap, 26);
      for (let i = 0; i < SAMPLES.length; i++) {
        const sample = SAMPLES[i]!;
        let s: Scene = createScene({ content: { kind: "image", assetId: sample } });
        s = applyStylePatch(s, style.patch, style.id);
        s = { ...s, canvas: { ...s.canvas, size } };
        const layout = layoutScene(s, assets);
        const scale = Math.min(TILE / layout.canvas.width, tileH / layout.canvas.height);
        const r = renderToCanvas(s, assets, { env: nodeEnv, cache, scale });
        const c = r.canvas as unknown as Canvas;
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = gap + col * (TILE + gap);
        const y = 34 + gap + row * (tileH + label + gap);
        // Checkerboard shows transparency; the tile is centred in its cell.
        g.fillStyle = "#d8d2c8";
        g.fillRect(x, y, TILE, tileH);
        g.drawImage(c, x + (TILE - c.width) / 2, y + (tileH - c.height) / 2);
        g.fillStyle = "#6b5d52";
        g.font = "500 14px Figtree";
        g.fillText(`${sample}  ${layout.canvas.width}×${layout.canvas.height}`, x, y + tileH + 18);
      }
      writeFileSync(`${OUT}/${sizeId}-${style.id}.png`, sheet.toBuffer("image/png"));
    }
    console.log(`wrote ${styles.length} sheets to ${OUT}`);
  }, 600_000);
});

/**
 * Close-ups: CONTACT_FULL="style:sample:scale[:size],..." writes full renders
 * (`full-<style>-<sample>@<scale>.png`) for pixel-level checks of shadows,
 * frames and textures at 1x and 2x.
 */
describe.skipIf(!process.env.CONTACT_FULL)("contact sheet close-ups", () => {
  it("renders full-size tiles", async () => {
    registerSheetFonts();
    mkdirSync(OUT, { recursive: true });
    const assets = await loadSheetAssets();
    const cache = new RenderCache();
    for (const spec of process.env.CONTACT_FULL!.split(",")) {
      const [styleId, sample, scaleStr, sizeId] = spec.split(":");
      const style = STYLE_PRESETS.find((s) => s.id === styleId)!;
      let s: Scene = createScene({ content: { kind: "image", assetId: sample! } });
      s = applyStylePatch(s, style.patch, style.id);
      if (sizeId) s = { ...s, canvas: { ...s.canvas, size: getSizePreset(sizeId)!.size } };
      const scale = Number(scaleStr ?? 1);
      const r = renderToCanvas(s, assets, { env: nodeEnv, cache, scale });
      const out = `${OUT}/full-${styleId}-${sample}${sizeId ? `-${sizeId}` : ""}@${scale}.png`;
      writeFileSync(out, (r.canvas as unknown as Canvas).toBuffer("image/png"));
      console.log(out, r.width, r.height);
    }
  }, 600_000);
});

/**
 * Gallery: every style once, each on a sample that suits it, as one sheet.
 * CONTACT_GALLERY=<file.png> (e.g. docs/screenshots/styles-light.png).
 */
describe.skipIf(!process.env.CONTACT_GALLERY)("style gallery sheet", () => {
  it("renders one tile per style", async () => {
    registerSheetFonts();
    const assets = await loadSheetAssets();
    const cache = new RenderCache();
    const landscape = [
      "dashboard-light",
      "editor-dark",
      "kanban-light",
      "landing-hero",
      "settings-dark",
      "terminal-code",
    ];
    const cols = 6;
    const tw = 440;
    const th = 330;
    const gap = 24;
    const label = 34;
    const rows = Math.ceil(STYLE_PRESETS.length / cols);
    const W = cols * tw + (cols + 1) * gap;
    const H = rows * (th + label) + (rows + 1) * gap;
    const sheet = createCanvas(W, H);
    const g = sheet.getContext("2d");
    g.fillStyle = "#f6eee2";
    g.fillRect(0, 0, W, H);
    STYLE_PRESETS.forEach((style, i) => {
      const sample =
        style.suits === "portrait"
          ? "mobile-habits"
          : style.suits === "tablet"
            ? "tablet-reader"
            : landscape[i % landscape.length]!;
      let s: Scene = createScene({ content: { kind: "image", assetId: sample } });
      s = applyStylePatch(s, style.patch, style.id);
      s = { ...s, canvas: { ...s.canvas, size: getSizePreset("4x3")!.size } };
      const layout = layoutScene(s, assets);
      const scale = Math.min(tw / layout.canvas.width, th / layout.canvas.height);
      const c = renderToCanvas(s, assets, { env: nodeEnv, cache, scale })
        .canvas as unknown as Canvas;
      const x = gap + (i % cols) * (tw + gap);
      const y = gap + Math.floor(i / cols) * (th + label + gap);
      g.save();
      g.beginPath();
      g.roundRect(x, y, tw, th, 14);
      g.clip();
      g.drawImage(c, x + (tw - c.width) / 2, y + (th - c.height) / 2);
      g.restore();
      g.fillStyle = "#2a1f1a";
      g.font = "700 19px Figtree";
      g.fillText(style.name, x + 2, y + th + 25);
    });
    writeFileSync(process.env.CONTACT_GALLERY!, sheet.toBuffer("image/png"));
  }, 600_000);
});
