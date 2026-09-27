/**
 * Generates the static showcase art used by the product (empty-state fan,
 * sample thumbnails, about and tool-page examples) with the real engine, so
 * the marketing images are exactly what the editor produces.
 *
 * Run: SHOWCASE=1 pnpm vitest run tests/render/showcase.test.ts
 * Output (committed): brand/empty, brand/samples/thumbs, brand/showcase
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { GlobalFonts, type Canvas, createCanvas, loadImage } from "@napi-rs/canvas";
import { describe, it } from "vitest";
import {
  MapAssetResolver,
  RenderCache,
  type Scene,
  applyStylePatch,
  createScene,
  getStylePreset,
  layoutScene,
  registerFont,
  renderToCanvas,
} from "@/engine";
import { loadAsset, nodeEnv } from "../helpers/node-canvas";

const RUN = !!process.env.SHOWCASE;

describe.skipIf(!RUN)("showcase art", () => {
  it("renders", async () => {
    GlobalFonts.registerFromPath("public/fonts/figtree-latin-wght-normal.woff2", "Figtree");
    GlobalFonts.registerFromPath(
      "public/fonts/bricolage-grotesque-latin-opsz-normal.woff2",
      "Bricolage Grotesque",
    );
    registerFont({ id: "ui", label: "UI", stack: "Figtree" });
    registerFont({ id: "sans", label: "Sans", stack: "Figtree" });
    registerFont({ id: "display", label: "Display", stack: '"Bricolage Grotesque"' });

    const names = [
      "dashboard-light",
      "mobile-habits",
      "terminal-code",
      "kanban-light",
      "landing-hero",
      "settings-dark",
      "editor-dark",
      "tablet-reader",
    ];
    const srcs = await Promise.all(
      names.map((n) => loadAsset(n, `brand/samples/sample-${n}.png`)),
    );
    const walls = await Promise.all(
      ["strawberry-satin", "peach-dunes", "grape-aurora", "gummy-blobs"].map(async (w) => {
        const img = await loadImage(`brand/backgrounds/${w}.webp`);
        return {
          id: `builtin:${w}`,
          width: img.width,
          height: img.height,
          images: [{ image: img as unknown as CanvasImageSource, width: img.width, height: img.height }],
        };
      }),
    );
    const assets = new MapAssetResolver([...srcs, ...walls]);
    const cache = new RenderCache();

    const render = (
      out: string,
      style: string,
      sample: string,
      width: number,
      size: Scene["canvas"]["size"],
      extra: (s: Scene) => Scene = (s) => s,
    ) => {
      let s = createScene({ content: { kind: "image", assetId: sample } });
      s = applyStylePatch(s, getStylePreset(style)!.patch, style);
      s = extra({ ...s, canvas: { ...s.canvas, size } });
      const layout = layoutScene(s, assets);
      const scale = width / layout.canvas.width;
      const r = renderToCanvas(s, assets, { env: nodeEnv, cache, scale });
      writeFileSync(out, (r.canvas as unknown as Canvas).toBuffer("image/webp", 86));
      console.log(out, r.width, r.height);
    };
    const aspect = (w: number, h: number) => ({ kind: "aspect" as const, ratioW: w, ratioH: h });
    const title = (t: string, url = "") => (s: Scene) => ({
      ...s,
      card: { ...s.card, frame: { ...s.card.frame, title: t, url } },
    });

    mkdirSync("brand/empty", { recursive: true });
    render("brand/empty/fan-mint.webp", "mint-julep", "dashboard-light", 340, aspect(16, 11));
    render("brand/empty/fan-midnight.webp", "midnight", "dashboard-light", 340, aspect(16, 11));
    render("brand/empty/fan-sherbet.webp", "sherbet", "dashboard-light", 340, aspect(16, 11));
    render("brand/empty/fan-phone.webp", "phone-sorbet", "mobile-habits", 340, aspect(16, 11));

    // Sample button thumbnails (2x of 46 x 32), cropped from the top-left like the mock.
    mkdirSync("brand/samples/thumbs", { recursive: true });
    for (const [n, pos] of [
      ["dashboard-light", "left"],
      ["mobile-habits", "center"],
      ["terminal-code", "left"],
    ] as const) {
      const src = await loadImage(`brand/samples/sample-${n}.png`);
      const c = createCanvas(92, 64);
      const g = c.getContext("2d");
      const s = Math.max(92 / src.width, 64 / src.height) * (n === "mobile-habits" ? 1 : 1.6);
      const w = src.width * s;
      const x = pos === "center" ? (92 - w) / 2 : 0;
      g.drawImage(src, x, 0, w, src.height * s);
      writeFileSync(`brand/samples/thumbs/sample-${n}.webp`, c.toBuffer("image/webp", 88));
    }

    mkdirSync("brand/showcase", { recursive: true });
    // About page: before/after.
    render("brand/showcase/about-after.webp", "tangerine", "kanban-light", 840, aspect(4, 3), title("Marmalade"));
    // Tool pages: hero + three examples each.
    const hero = (id: string, style: string, sample: string, size: Scene["canvas"]["size"] = aspect(16, 11), t = title("")) =>
      render(`brand/showcase/${id}.webp`, style, sample, 1100, size, t);
    const ex = (id: string, style: string, sample: string, size: Scene["canvas"]["size"] = aspect(4, 3), t = title("")) =>
      render(`brand/showcase/${id}.webp`, style, sample, 720, size, t);
    hero("macos-hero", "sherbet", "dashboard-light", aspect(16, 11), title("Quokka — Overview"));
    ex("macos-1", "sherbet", "dashboard-light");
    ex("macos-2", "grape-soda", "terminal-code", aspect(4, 3), (s) => ({
      ...s,
      card: { ...s.card, frame: { ...s.card.frame, theme: "dark" } },
    }));
    ex("macos-3", "satin", "kanban-light", aspect(4, 3), (s) => ({
      ...s,
      card: { ...s.card, frame: { ...s.card.frame, id: "macos" } },
    }));
    hero("beautifier-hero", "tangerine", "landing-hero");
    ex("beautifier-1", "from-your-shot", "settings-dark");
    ex("beautifier-2", "cotton-candy", "kanban-light");
    ex("beautifier-3", "phone-sorbet", "mobile-habits");
    hero("og-hero", "aurora-pop", "landing-hero", { kind: "fixed", width: 1200, height: 630 });
    ex("og-1", "sherbet", "dashboard-light", { kind: "fixed", width: 1200, height: 630 });
    ex("og-2", "licorice", "editor-dark", { kind: "fixed", width: 1200, height: 630 });
    ex("og-3", "gummy", "kanban-light", { kind: "fixed", width: 1200, height: 630 });
  }, 120_000);
});
