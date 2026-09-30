#!/usr/bin/env node
/**
 * Media for the SEO pages and the README, made from the real product:
 *
 *   - Open Graph cards (1200 × 630) for the pages added in v0.2.0 -> brand/og/
 *     (same layout as the older cards: logo, headline, pills, engine art)
 *   - the GitHub social preview (1280 × 640)                        -> docs/media/social-preview.png
 *   - editor screenshots of a batch and a multi-screen design       -> brand/showcase/batch-hero.webp,
 *                                                                      docs/media/feature-{batch,screens}-{light,dark}.webp
 *
 *   pnpm build && SHOWCASE=seo pnpm vitest run tests/render/showcase.test.ts && node scripts/seo-media.mjs [--only=og,social,editor]
 *
 * Needs cwebp. Starts its own static server for out/ on a free port.
 */
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const flags = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith("--"))
    .map((a) => a.slice(2).split("=")),
);
const only = flags.only ? new Set(flags.only.split(",")) : null;
const want = (k) => !only || only.has(k);

const b64 = (path, type) => `data:${type};base64,${readFileSync(path).toString("base64")}`;
const FONT_DISPLAY = b64("public/fonts/bricolage-grotesque-latin-opsz-normal.woff2", "font/woff2");
const FONT_UI = b64("public/fonts/figtree-latin-wght-normal.woff2", "font/woff2");
const LOGO = readFileSync("brand/logo.svg", "utf8");
const art = (name) => b64(`brand/showcase/${name}.webp`, "image/webp");

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

/** One card: headline with an accented phrase, three pills, and one or two pieces of art. */
function card({ width = 1200, height = 630, lines, accent, pills, arts }) {
  const headline = lines
    .map((l) => esc(l).replace(esc(accent), `<em>${esc(accent)}</em>`))
    .join("<br>");
  const pieces = arts
    .map((a, i) => `<img class="art a${i}" src="${art(a.src)}" style="${a.style}" alt="">`)
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:D;src:url(${FONT_DISPLAY}) format("woff2");font-weight:200 800}
@font-face{font-family:U;src:url(${FONT_UI}) format("woff2");font-weight:300 900}
*{margin:0;box-sizing:border-box}
html,body{width:${width}px;height:${height}px;overflow:hidden}
body{position:relative;background:#fbf5ec;font-family:U,sans-serif;color:#2a1f1a}
body::before{content:"";position:absolute;inset:0;background-image:radial-gradient(rgba(120,90,60,.16) 1.6px,transparent 1.7px);background-size:26px 26px}
body::after{content:"";position:absolute;right:-160px;top:-200px;width:900px;height:760px;background:radial-gradient(closest-side,rgba(255,106,143,.28),rgba(255,154,60,.10) 60%,transparent);pointer-events:none}
.logo{position:absolute;left:74px;top:78px;width:252px;z-index:3}
.logo svg{width:100%;height:auto;display:block}
h1{position:absolute;left:72px;top:${height > 630 ? 200 : 186}px;width:${Math.round(width * 0.5)}px;font:800 72px/1.02 D,sans-serif;letter-spacing:-.035em;z-index:3}
h1 em{font-style:normal;color:#c0214f}
.pills{position:absolute;left:72px;bottom:${height > 630 ? 88 : 72}px;display:flex;gap:10px;z-index:3}
.pills span{background:#fffcf7;border-radius:999px;padding:11px 18px 12px;font:600 19px/1 U,sans-serif;color:#2a1f1a;box-shadow:0 1px 2px rgba(74,45,20,.12),0 6px 16px -8px rgba(74,45,20,.35)}
.art{position:absolute;z-index:2;border-radius:18px;box-shadow:0 2px 4px rgba(74,45,20,.14),0 40px 70px -30px rgba(90,40,20,.55)}
</style></head><body>
<div class="logo">${LOGO}</div>
<h1>${headline}</h1>
<div class="pills">${pills.map((p) => `<span>${esc(p)}</span>`).join("")}</div>
${pieces}
</body></html>`;
}

const PILLS = ["Free", "Open source", "In your browser"];
const CARDS = [
  {
    file: "brand/og/batch-screenshot-editor.png",
    lines: ["Style 100", "screenshots", "at once"],
    accent: "100",
    arts: [
      { src: "batch-3", style: "left:720px;top:70px;width:420px;transform:rotate(6deg)" },
      { src: "batch-2", style: "left:680px;top:170px;width:420px;transform:rotate(-2deg)" },
      { src: "batch-1", style: "left:630px;top:270px;width:440px;transform:rotate(-8deg)" },
    ],
  },
  {
    file: "brand/og/screenshot-mockup.png",
    lines: ["Several", "screenshots,", "one mockup"],
    accent: "one mockup",
    arts: [
      { src: "mockup-hero", style: "left:640px;top:110px;width:540px;transform:rotate(-3deg)" },
    ],
  },
  {
    file: "brand/og/redact-screenshot.png",
    lines: ["Blur private", "details in a", "screenshot"],
    accent: "Blur",
    arts: [
      { src: "redact-before", style: "left:650px;top:110px;width:450px;transform:rotate(4deg)" },
      { src: "redact-pixelate", style: "left:620px;top:300px;width:470px;transform:rotate(-4deg)" },
    ],
  },
  {
    file: "brand/og/app-store-screenshots.png",
    lines: ["App Store", "screenshots at", "exact sizes"],
    accent: "App Store",
    arts: [
      { src: "appstore-hero", style: "left:640px;top:100px;width:540px;transform:rotate(-3deg)" },
    ],
  },
  {
    file: "brand/og/alternatives.png",
    lines: ["Free", "alternatives,", "compared fairly"],
    accent: "compared fairly",
    arts: [
      { src: "layout-cascade", style: "left:680px;top:120px;width:470px;transform:rotate(-3deg)" },
    ],
  },
  {
    file: "brand/og/alternatives-shots-so.png",
    lines: ["A free", "Shots.so", "alternative"],
    accent: "Shots.so",
    arts: [
      { src: "alt-shots-hero", style: "left:640px;top:110px;width:540px;transform:rotate(-3deg)" },
    ],
  },
  {
    file: "brand/og/alternatives-screely.png",
    lines: ["A free", "Screely", "alternative"],
    accent: "Screely",
    arts: [{ src: "browser-1", style: "left:660px;top:120px;width:480px;transform:rotate(-3deg)" }],
  },
  {
    file: "brand/og/tools.png",
    lines: ["Screenshot", "tools that stay", "in your browser"],
    accent: "Screenshot",
    arts: [
      { src: "layout-fan", style: "left:700px;top:70px;width:440px;transform:rotate(6deg)" },
      { src: "code-2", style: "left:640px;top:250px;width:440px;transform:rotate(-6deg)" },
    ],
  },
];

const SOCIAL = {
  file: "docs/media/social-preview.png",
  width: 1280,
  height: 640,
  lines: ["Make any", "screenshot look", "lovely."],
  accent: "lovely.",
  pills: ["Free", "Open source", "Batch", "Multi-screen"],
  arts: [
    { src: "batch-hero", style: "left:700px;top:60px;width:520px;transform:rotate(4deg)" },
    { src: "mockup-hero", style: "left:660px;top:270px;width:500px;transform:rotate(-5deg)" },
  ],
};

const freePort = () =>
  new Promise((res) => {
    const s = createServer();
    s.listen(0, () => {
      const { port } = s.address();
      s.close(() => res(port));
    });
  });

const browser = await chromium.launch();
const webp = (png, out, width, q = 82) => {
  execFileSync("cwebp", [
    "-quiet",
    "-q",
    String(q),
    "-m",
    "6",
    "-resize",
    String(width),
    "0",
    png,
    "-o",
    out,
  ]);
  rmSync(png);
  console.log(out);
};

// ---------------------------------------------------------------- editor shots
if (want("editor")) {
  const port = await freePort();
  const server = spawn("node", ["scripts/serve-static.mjs", "out", String(port)], {
    stdio: "ignore",
  });
  await new Promise((r) => setTimeout(r, 700));
  const base = `http://127.0.0.1:${port}`;
  const samples = [
    "dashboard-light",
    "kanban-light",
    "settings-dark",
    "landing-hero",
    "editor-dark",
    "tablet-reader",
    "terminal-code",
    "mobile-habits",
  ];
  const files = samples.map((n) => ({
    name: `${n}.png`,
    data: readFileSync(`brand/samples/sample-${n}.png`).toString("base64"),
  }));
  const shoot = async (scheme, kind) => {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      colorScheme: scheme,
    });
    const page = await ctx.newPage();
    await page.goto(base + "/", { waitUntil: "networkidle" });
    await page.waitForFunction(
      () => window.__shotcandy?.ready === true && document.fonts.status === "loaded",
    );
    if (kind === "batch") {
      await page.evaluate(async (items) => {
        const list = items.map(
          (it) =>
            new File([Uint8Array.from(atob(it.data), (c) => c.charCodeAt(0))], it.name, {
              type: "image/png",
            }),
        );
        await window.__shotcandy.app.importFiles(list, { source: "drop" });
        window.__shotcandy.app.applyStyle("sea-glass");
      }, files);
      await page.waitForTimeout(2500);
    } else {
      await page.evaluate(async (items) => {
        const app = window.__shotcandy.app;
        const f = (it) =>
          new File([Uint8Array.from(atob(it.data), (c) => c.charCodeAt(0))], it.name, {
            type: "image/png",
          });
        await app.loadBlob(f(items[0]));
        app.applyStyle("satin");
        app.screens.setLayout("hero");
        await app.screens.addFiles([f(items[1]), f(items[3])], null, "drop");
      }, files);
      await page.waitForTimeout(2200);
    }
    // No "Added 8 images" toast in the picture.
    await page.evaluate(() => window.__shotcandy.app.ui.set({ toasts: [] }));
    await page.waitForTimeout(400);
    const png = join(tmpdir(), `shotcandy-${kind}-${scheme}.png`);
    await page.screenshot({ path: png });
    await ctx.close();
    return png;
  };
  for (const scheme of ["light", "dark"]) {
    webp(await shoot(scheme, "batch"), `docs/media/feature-batch-${scheme}.webp`, 2000, 80);
    webp(await shoot(scheme, "screens"), `docs/media/feature-screens-${scheme}.webp`, 2000, 80);
  }
  webp(await shoot("light", "batch"), "brand/showcase/batch-hero.webp", 1100, 82);
  server.kill();
}

// ------------------------------------------------------------------ OG cards
const render = async (spec, out) => {
  const w = spec.width ?? 1200;
  const h = spec.height ?? 630;
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.setContent(card({ ...spec, pills: spec.pills ?? PILLS }), { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: out });
  await page.close();
  console.log(out);
};
if (want("og")) {
  mkdirSync("brand/og", { recursive: true });
  for (const c of CARDS) await render(c, c.file);
}
if (want("social")) await render(SOCIAL, SOCIAL.file);

await browser.close();
