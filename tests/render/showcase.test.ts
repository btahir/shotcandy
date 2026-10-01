/**
 * Generates the static showcase art used by the product (empty-state fan,
 * sample thumbnails, about and tool-page examples) with the real engine, so
 * the marketing images are exactly what the editor produces.
 *
 * Run: SHOWCASE=1 pnpm vitest run tests/render/showcase.test.ts
 * (SHOWCASE=seo renders only the art of the SEO pages: layouts, batch,
 * redaction and App Store sets, so the older files aren't re-encoded.)
 * Output (committed): brand/empty, brand/samples/thumbs, brand/showcase
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { GlobalFonts, type Canvas, createCanvas, loadImage } from "@napi-rs/canvas";
import { describe, it } from "vitest";
import {
  type AppStoreSet,
  type LayoutId,
  MapAssetResolver,
  RenderCache,
  type RedactAnnotation,
  type Scene,
  SET_STYLES,
  applyStylePatch,
  createAnnotation,
  createScene,
  createSet,
  createSetTemplate,
  getStylePreset,
  layoutScene,
  registerFont,
  renderToCanvas,
  setMeasureEnvironment,
  slideScene,
} from "@/engine";
import { loadAsset, nodeEnv } from "../helpers/node-canvas";

const RUN = !!process.env.SHOWCASE;
const ONLY_SEO = process.env.SHOWCASE === "seo";

describe.skipIf(!RUN || ONLY_SEO)("showcase art", () => {
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
    const srcs = await Promise.all(names.map((n) => loadAsset(n, `brand/samples/sample-${n}.png`)));
    const walls = await Promise.all(
      ["strawberry-satin", "peach-dunes", "grape-aurora", "gummy-blobs"].map(async (w) => {
        const img = await loadImage(`brand/backgrounds/${w}.webp`);
        return {
          id: `builtin:${w}`,
          width: img.width,
          height: img.height,
          images: [
            { image: img as unknown as CanvasImageSource, width: img.width, height: img.height },
          ],
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
    const title =
      (t: string, url = "") =>
      (s: Scene) => ({
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
    render(
      "brand/showcase/about-after.webp",
      "tangerine",
      "kanban-light",
      840,
      aspect(4, 3),
      title("Marmalade"),
    );
    // Tool pages: hero + three examples each.
    const hero = (
      id: string,
      style: string,
      sample: string,
      size: Scene["canvas"]["size"] = aspect(16, 11),
      t = title(""),
    ) => render(`brand/showcase/${id}.webp`, style, sample, 1100, size, t);
    const ex = (
      id: string,
      style: string,
      sample: string,
      size: Scene["canvas"]["size"] = aspect(4, 3),
      t = title(""),
    ) => render(`brand/showcase/${id}.webp`, style, sample, 720, size, t);
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

/**
 * Art for the SEO pages (/screenshot-mockup/, /batch-screenshot-editor/,
 * /redact-screenshot/, /app-store-screenshots/ and the alternatives pages):
 * multi-screen layouts, one style across several screenshots, blur and
 * pixelate redaction, and App Store sets, all drawn by the real engine.
 */
describe.skipIf(!RUN)("seo page art", () => {
  it("renders", async () => {
    GlobalFonts.registerFromPath("public/fonts/figtree-latin-wght-normal.woff2", "Figtree");
    GlobalFonts.registerFromPath(
      "public/fonts/bricolage-grotesque-latin-opsz-normal.woff2",
      "Bricolage Grotesque",
    );
    registerFont({ id: "ui", label: "UI", stack: "Figtree" });
    registerFont({ id: "sans", label: "Sans", stack: "Figtree" });
    registerFont({ id: "display", label: "Display", stack: '"Bricolage Grotesque"' });
    setMeasureEnvironment(nodeEnv);

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
    const srcs = await Promise.all(names.map((n) => loadAsset(n, `brand/samples/sample-${n}.png`)));
    const walls = await Promise.all(
      ["strawberry-satin", "peach-dunes", "grape-aurora", "gummy-blobs"].map(async (w) => {
        const img = await loadImage(`brand/backgrounds/${w}.webp`);
        return {
          id: `builtin:${w}`,
          width: img.width,
          height: img.height,
          images: [
            { image: img as unknown as CanvasImageSource, width: img.width, height: img.height },
          ],
        };
      }),
    );
    const assets = new MapAssetResolver([...srcs, ...walls]);
    const cache = new RenderCache();
    const aspect = (w: number, h: number) => ({ kind: "aspect" as const, ratioW: w, ratioH: h });
    mkdirSync("brand/showcase", { recursive: true });

    const save = (out: string, s: Scene, width: number, quality = 84) => {
      const layout = layoutScene(s, assets);
      const scale = width / layout.canvas.width;
      const r = renderToCanvas(s, assets, { env: nodeEnv, cache, scale });
      writeFileSync(out, (r.canvas as unknown as Canvas).toBuffer("image/webp", quality));
      console.log(out, r.width, r.height);
    };
    const styled = (style: string, sample: string, size: Scene["canvas"]["size"]) => {
      let s = createScene({ content: { kind: "image", assetId: sample } });
      s = applyStylePatch(s, getStylePreset(style)!.patch, style);
      return { ...s, canvas: { ...s.canvas, size } };
    };
    const group = (
      style: string,
      layout: Exclude<LayoutId, "single">,
      ids: string[],
      size: Scene["canvas"]["size"],
      params?: Record<string, number>,
    ): Scene => ({
      ...styled(style, ids[0]!, size),
      layout: { id: layout, count: ids.length, ...(params ? { params } : {}) },
      slots: ids.slice(1).map((assetId) => ({ assetId })),
    });

    // /screenshot-mockup/: the six layouts, and a hero.
    const L = (id: string, s: Scene) => save(`brand/showcase/layout-${id}.webp`, s, 720);
    const four3 = aspect(4, 3);
    L("side-by-side", group("sherbet", "side-by-side", ["dashboard-light", "kanban-light"], four3));
    L("overlap", group("midnight", "overlap", ["editor-dark", "settings-dark"], four3));
    L(
      "hero",
      group("tangerine", "hero", ["landing-hero", "dashboard-light", "kanban-light"], four3),
    );
    L(
      "cascade",
      group(
        "cotton-candy",
        "cascade",
        ["dashboard-light", "kanban-light", "landing-hero", "settings-dark"],
        four3,
      ),
    );
    L("fan", group("aurora-pop", "fan", ["terminal-code", "editor-dark", "settings-dark"], four3));
    L(
      "grid",
      group(
        "soft-grey",
        "grid",
        ["dashboard-light", "kanban-light", "landing-hero", "tablet-reader"],
        four3,
      ),
    );
    save(
      "brand/showcase/mockup-hero.webp",
      group("satin", "hero", ["dashboard-light", "kanban-light", "landing-hero"], aspect(16, 11)),
      1100,
    );

    // /batch-screenshot-editor/: one style on several screenshots.
    for (const [i, sample] of (
      ["dashboard-light", "settings-dark", "kanban-light"] as const
    ).entries())
      save(`brand/showcase/batch-${i + 1}.webp`, styled("sea-glass", sample, four3), 720);

    // /redact-screenshot/: the same corner of a dashboard, before and after.
    const crop = { x: 0, y: 0.6, width: 0.53, height: 0.4 };
    const boxes = [
      { x: 0.012, y: 0.855, w: 0.24, h: 0.125 },
      { x: 0.898, y: 0.375, w: 0.09, h: 0.525 },
    ];
    const redacted = (mode: RedactAnnotation["mode"] | null, strength: number) => {
      const s = styled("soft-grey", "dashboard-light", aspect(2, 1));
      const annotations: RedactAnnotation[] = mode
        ? boxes.map((b, i) => ({ ...createAnnotation("redact", `r${i}`), ...b, mode, strength }))
        : [];
      return {
        ...s,
        canvas: { ...s.canvas, padding: 36 },
        content: { kind: "image" as const, assetId: "dashboard-light", crop },
        annotations,
      };
    };
    save("brand/showcase/redact-before.webp", redacted(null, 0), 720);
    save("brand/showcase/redact-blur.webp", redacted("blur", 14), 720);
    save("brand/showcase/redact-pixelate.webp", redacted("pixelate", 14), 720);
    const hero = styled("sherbet", "dashboard-light", aspect(16, 11));
    save(
      "brand/showcase/redact-hero.webp",
      {
        ...hero,
        card: { ...hero.card, frame: { ...hero.card.frame, title: "Quokka — Overview" } },
        annotations: [
          {
            ...createAnnotation("redact", "email"),
            x: 0.006,
            y: 0.942,
            w: 0.13,
            h: 0.05,
            mode: "pixelate",
            strength: 10,
          },
          {
            ...createAnnotation("redact", "domain"),
            x: 0.176,
            y: 0.012,
            w: 0.09,
            h: 0.035,
            mode: "blur",
            strength: 10,
          },
        ],
      },
      1100,
    );

    // /app-store-screenshots/: sets rendered slide by slide, laid side by side.
    const strip = (
      out: string,
      set: AppStoreSet,
      styleId: string,
      width: number,
      /** Pad to this output height (keeps example tiles the same shape). */
      height?: number,
      gap = 0.04,
    ) => {
      const st = SET_STYLES.find((x) => x.id === styleId)!;
      const tpl = applyStylePatch(createSetTemplate(), st.patch, styleId);
      const withText = { ...set, text: { ...set.text, ...st.text }, styleId };
      const slides = withText.slides.map((_, i) =>
        renderToCanvas(slideScene(withText, tpl, i, assets), assets, {
          env: nodeEnv,
          cache,
          scale: 0.25,
        }),
      );
      const w0 = slides[0]!.width;
      const h0 = slides[0]!.height;
      const g = Math.round(w0 * gap);
      const pad = Math.round(w0 * 0.12);
      const full = createCanvas(
        slides.length * w0 + (slides.length - 1) * g + pad * 2,
        h0 + pad * 2,
      );
      const ctx = full.getContext("2d");
      ctx.fillStyle = "#f4ebdd";
      ctx.fillRect(0, 0, full.width, full.height);
      slides.forEach((r, i) => {
        ctx.save();
        const x = pad + i * (w0 + g);
        const rad = w0 * 0.05;
        ctx.beginPath();
        ctx.roundRect(x, pad, w0, h0, rad);
        ctx.clip();
        ctx.drawImage(r.canvas as unknown as Canvas, x, pad);
        ctx.restore();
      });
      const h = Math.round((full.height * width) / full.width);
      const out2 = createCanvas(width, height ?? h);
      const g2 = out2.getContext("2d");
      g2.fillStyle = "#f4ebdd";
      g2.fillRect(0, 0, out2.width, out2.height);
      g2.drawImage(full, 0, Math.round((out2.height - h) / 2), width, h);
      writeFileSync(out, out2.toBuffer("image/webp", 84));
      console.log(out, out2.width, out2.height);
    };
    const phoneSet = (headlines: [string, string][]): AppStoreSet => {
      const s = createSet(headlines.length);
      return {
        ...s,
        slides: s.slides.map((sl, i) => ({
          ...sl,
          headline: headlines[i]![0],
          subhead: headlines[i]![1],
          assetId: "mobile-habits",
        })),
      };
    };
    const lines: [string, string][] = [
      ["Habits that actually stick", "Gentle streaks and reminders"],
      ["Your day, beautifully planned", "Everything you need, one tap away"],
      ["See your progress", "Clear charts, no clutter"],
    ];
    strip("brand/showcase/appstore-hero.webp", phoneSet(lines), "set-sherbet", 1100);
    strip("brand/showcase/appstore-1.webp", phoneSet(lines), "set-grape", 720);
    strip("brand/showcase/appstore-2.webp", phoneSet(lines), "set-mint", 720);
    const ipad: AppStoreSet = {
      ...createSet(3),
      sizePresetId: "appstore-ipad-13",
      landscape: true,
    };
    strip(
      "brand/showcase/appstore-3.webp",
      {
        ...ipad,
        slides: ipad.slides.slice(0, 2).map((sl, i) => ({
          ...sl,
          headline: ["Read without the noise", "Pick up where you left off"][i]!,
          subhead: ["A calm page for long articles", "Your place, on every device"][i]!,
          assetId: "tablet-reader",
        })),
      },
      "set-paper",
      720,
      524,
    );

    // Browser-frame examples (the Screely alternative page).
    const url = (s: Scene, u: string) => ({
      ...s,
      card: { ...s.card, frame: { ...s.card.frame, url: u } },
    });
    save(
      "brand/showcase/browser-1.webp",
      url(styled("bubblegum", "kanban-light", four3), "marmalade.app/board"),
      720,
    );
    save(
      "brand/showcase/browser-2.webp",
      url(styled("licorice", "editor-dark", four3), "fernleaf.app/notes"),
      720,
    );

    // Alternatives pages: a browser window and a tilted card.
    save(
      "brand/showcase/alt-screely-hero.webp",
      styled("lemonade", "landing-hero", aspect(16, 11)),
      1100,
    );
    save(
      "brand/showcase/alt-shots-hero.webp",
      group("grape-soda", "side-by-side", ["dashboard-light", "mobile-habits"], aspect(16, 11)),
      1100,
    );
    setMeasureEnvironment(null);
  }, 180_000);
});
