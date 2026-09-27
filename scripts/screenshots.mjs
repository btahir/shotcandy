#!/usr/bin/env node
/**
 * Screenshots every screen and state of the product in light and dark, at
 * desktop and mobile sizes, for design review and for docs/screenshots.
 *
 *   pnpm build && node scripts/screenshots.mjs [outDir=docs/screenshots] [baseURL] [--dpr=2] [--only=name,...] [--webp]
 *
 * --webp converts each PNG to WebP (quality 90) with cwebp, which keeps the
 * committed curated set small.
 *
 * Starts its own static server on a free port unless baseURL is given.
 */
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { chromium } from "@playwright/test";

const args = process.argv.slice(2);
const flags = Object.fromEntries(
  args.filter((a) => a.startsWith("--")).map((a) => a.slice(2).split("=")),
);
const [outDir = "docs/screenshots", given] = args.filter((a) => !a.startsWith("--"));
const dpr = Number(flags.dpr ?? 2);
const only = flags.only ? new Set(flags.only.split(",")) : null;

const freePort = () =>
  new Promise((res) => {
    const s = createServer();
    s.listen(0, () => {
      const { port } = s.address();
      s.close(() => res(port));
    });
  });

let server;
let base = given;
if (!base) {
  const port = await freePort();
  server = spawn("node", ["scripts/serve-static.mjs", "out", String(port)], { stdio: "ignore" });
  base = `http://127.0.0.1:${port}`;
  await new Promise((r) => setTimeout(r, 600));
}

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();

const sample = (name) => async (page) => {
  await page.evaluate(async (n) => {
    const r = await fetch(`/samples/${n}.webp`);
    await window.__shotcandy.app.loadBlob(await r.blob());
  }, name);
  await page.waitForTimeout(1500);
};

const annotate = async (page) => {
  await page.evaluate(() => {
    const app = window.__shotcandy.app;
    app.addAnnotation("rect", { x: 0.185, y: 0.15, w: 0.19, h: 0.135 });
    app.addAnnotation("redact", { x: 0.004, y: 0.905, w: 0.15, h: 0.07 });
    app.addAnnotation("text", {
      anchor: "canvas",
      x: 0.3,
      y: 0.06,
      text: "+12.4% this month",
      size: 30,
    });
    const id = app.addAnnotation("arrow", {
      anchor: "canvas",
      x1: 0.45,
      y1: 0.085,
      x2: 0.33,
      y2: 0.24,
      curve: 0.35,
    });
    app.store.select(id);
  });
  await page.waitForTimeout(600);
  await page.hover('button[aria-label="Arrow (A)"]');
  await page.waitForTimeout(700);
};

const desktop = [
  ["editor-empty", async () => {}],
  [
    "editor-dragover",
    async (page) => {
      await page.evaluate(() => {
        const dt = new DataTransfer();
        dt.items.add(new File([new Uint8Array(8)], "a.png", { type: "image/png" }));
        window.dispatchEvent(new DragEvent("dragenter", { dataTransfer: dt, bubbles: true }));
      });
      await page.waitForTimeout(400);
    },
  ],
  ["editor-loaded", sample("sample-dashboard-light")],
  [
    "editor-sizes",
    async (page) => {
      await sample("sample-dashboard-light")(page);
      await page.click("[data-testid=size-chip]");
      await page.waitForTimeout(400);
    },
  ],
  [
    "editor-exporting",
    async (page) => {
      await sample("sample-dashboard-light")(page);
      await page.click("[data-testid=export-options]");
      await page.waitForTimeout(1200);
    },
  ],
  [
    "editor-copied",
    async (page) => {
      await sample("sample-dashboard-light")(page);
      await page.click("[data-testid=copy]");
      await page.waitForSelector("[data-testid=toast]");
      await page.waitForTimeout(700);
    },
  ],
  [
    "editor-destinations",
    async (page) => {
      await sample("sample-dashboard-light")(page);
      await page.click("[data-testid=export-options]");
      await page.getByRole("radio", { name: "X", exact: true }).click();
      await page.waitForTimeout(1500);
    },
  ],
  [
    "editor-gradient",
    async (page) => {
      await sample("sample-dashboard-light")(page);
      await page.getByRole("tab", { name: "Gradient" }).click();
      await page.getByRole("button", { name: "Grape Soda", exact: true }).click();
      await page.getByRole("button", { name: /Edit gradient/ }).click();
      await page.evaluate(() => {
        const g = document.querySelector("[data-testid=gradient-editor]");
        const box = document.querySelector(".inspector");
        box.scrollTop = g.offsetTop - 220;
      });
      await page.waitForTimeout(700);
    },
  ],
  [
    "editor-position",
    async (page) => {
      await sample("sample-dashboard-light")(page);
      await page.evaluate(() => {
        const app = window.__shotcandy.app;
        app.setSize({ kind: "fixed", width: 1080, height: 1350, presetId: "instagram-portrait" });
        app.set(["canvas", "anchor"], "top-left");
        app.set(["canvas", "bleed"], 0.3);
        app.set(["card", "frame", "theme"], "auto");
        const box = document.querySelector(".inspector");
        box.scrollTop = document.querySelector("[data-testid=position]").offsetTop - 260;
      });
      await page.waitForTimeout(900);
    },
  ],
  [
    "editor-shuffle",
    async (page) => {
      await sample("sample-kanban-light")(page);
      await page.evaluate(() => {
        const app = window.__shotcandy.app;
        // A fixed seed so the curated screenshot is stable.
        app.shuffleSeed = 41;
        Math.random = () => 0.4;
      });
      await page.keyboard.press("s");
      await page.waitForTimeout(900);
    },
  ],
  [
    "editor-long-page",
    async (page) => {
      await sample("sample-mobile-habits")(page);
      await page.evaluate(async () => {
        const c = document.createElement("canvas");
        c.width = 900;
        c.height = 4600;
        const g = c.getContext("2d");
        const bands = ["#fffaf3", "#fff1e6", "#fde8ef", "#eef6ff"];
        for (let y = 0, i = 0; y < 4600; y += 460, i++) {
          g.fillStyle = bands[i % 4];
          g.fillRect(0, y, 900, 460);
          g.fillStyle = "#2a1f1a";
          g.font = "700 44px sans-serif";
          g.fillText(`Chapter ${i + 1}`, 60, y + 110);
          g.fillStyle = "#b5a495";
          for (let l = 0; l < 5; l++) g.fillRect(60, y + 160 + l * 44, 700 - l * 60, 16);
        }
        const b = await new Promise((r) => c.toBlob(r, "image/png"));
        await window.__shotcandy.app.loadBlob(b);
      });
      await page.waitForTimeout(1300);
    },
  ],
  [
    "editor-annotate",
    async (page) => {
      await sample("sample-dashboard-light")(page);
      await annotate(page);
    },
  ],
  [
    "editor-tilt",
    async (page) => {
      await sample("sample-kanban-light")(page);
      await page.evaluate(() => window.__shotcandy.app.applyStyle("tilted-taffy"));
      await page.click("button.disclosure");
      await page.waitForTimeout(900);
    },
  ],
  [
    "gallery",
    async (page) => {
      await sample("sample-dashboard-light")(page);
      await page.keyboard.press("g");
      await page.waitForTimeout(2200);
      await page.hover(".jar-card:nth-child(2)");
      await page.waitForTimeout(400);
    },
  ],
  [
    "shortcuts",
    async (page) => {
      await sample("sample-dashboard-light")(page);
      await page.keyboard.press("Shift+?");
      await page.waitForTimeout(600);
    },
  ],
  [
    "recents",
    async (page) => {
      await sample("sample-dashboard-light")(page);
      await page.evaluate(() => window.__shotcandy.app.applyStyle("grape-soda"));
      await page.evaluate(() => window.__shotcandy.app.autosave());
      await sample("sample-kanban-light")(page);
      await page.evaluate(() => window.__shotcandy.app.autosave());
      await page.evaluate(() => window.__shotcandy.app.ui.set({ modal: "recents" }));
      await page.waitForTimeout(800);
    },
  ],
  [
    "editor-error",
    async (page) => {
      await page.evaluate(() =>
        window.__shotcandy.app.loadBlob(
          new Blob([new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 104, 101, 105, 99])], {
            type: "image/heic",
          }),
        ),
      );
      await page.waitForTimeout(700);
    },
  ],
  [
    "editor-phone",
    async (page) => {
      await sample("sample-mobile-habits")(page);
    },
  ],
  [
    "editor-motion",
    async (page) => {
      await sample("sample-dashboard-light")(page);
      await page.getByRole("button", { name: /^Float motion/ }).click();
      await page.evaluate(() => window.__shotcandy.app.seek(1.1));
      await page.waitForTimeout(700);
    },
  ],
  [
    "editor-motion-export",
    async (page) => {
      await sample("sample-dashboard-light")(page);
      await page.getByRole("button", { name: /^Zoom in motion/ }).click();
      await page.evaluate(() => window.__shotcandy.app.seek(1.2));
      await page.click("[data-testid=export-options]");
      await page.getByRole("tab", { name: "Video" }).click();
      await page.waitForTimeout(700);
    },
  ],
  [
    "editor-motion-rendering",
    async (page) => {
      await sample("sample-dashboard-light")(page);
      await page.getByRole("button", { name: /^3D sweep motion/ }).click();
      await page.evaluate(() => {
        const app = window.__shotcandy.app;
        app.setExportSettings({
          motion: { ...app.ui.get().exportSettings.motion, videoRes: 2160 },
        });
        void app.exportMotion();
      });
      await page.waitForSelector("[data-testid=render-pill]");
      await page.waitForTimeout(1500);
    },
  ],
  [
    "editor-code",
    async (page) => {
      await page.getByRole("tab", { name: "Code" }).click();
      await page.evaluate(() => window.__shotcandy.app.setCode({ highlight: [7, 8] }));
      await page.waitForTimeout(2200);
    },
  ],
  [
    "editor-code-language",
    async (page) => {
      await page.getByRole("tab", { name: "Code" }).click();
      await page.waitForTimeout(1500);
      await page.getByTestId("language").click();
      await page.waitForTimeout(500);
    },
  ],
  [
    "editor-post",
    async (page) => {
      await page.getByRole("tab", { name: "Post" }).click();
      await page.waitForTimeout(1800);
    },
  ],
  [
    "editor-testimonial",
    async (page) => {
      await page.getByRole("tab", { name: "Post" }).click();
      await page.getByRole("radio", { name: "Testimonial" }).click();
      await page.getByRole("button", { name: "Midnight card style" }).click();
      await page.waitForTimeout(1800);
    },
  ],
  [
    "editor-appstore",
    async (page) => {
      await page.getByRole("tab", { name: "App Store" }).click();
      await page.evaluate(async () => {
        const app = window.__shotcandy.app;
        const r = await fetch("/samples/sample-mobile-habits.webp");
        const b = await r.blob();
        await app.sets.setSlideImage(0, b);
        await app.sets.setSlideImage(2, b);
        app.sets.select(0);
      });
      await page.waitForTimeout(2000);
    },
  ],
  [
    "editor-appstore-export",
    async (page) => {
      await page.getByRole("tab", { name: "App Store" }).click();
      await page.evaluate(async () => {
        const app = window.__shotcandy.app;
        const r = await fetch("/samples/sample-mobile-habits.webp");
        await app.sets.setSlideImage(1, await r.blob());
        app.sets.applyStyle("set-grape");
      });
      await page.click("[data-testid=export-options]");
      await page.waitForTimeout(1500);
    },
  ],
];

const mobile = [
  ["mobile-empty", async () => {}],
  ["mobile-editor", sample("sample-mobile-habits")],
  [
    "mobile-background",
    async (page) => {
      await sample("sample-mobile-habits")(page);
      await page.click('[role=tab]:has-text("Background")');
      await page.waitForTimeout(500);
    },
  ],
  [
    "mobile-draw",
    async (page) => {
      await sample("sample-mobile-habits")(page);
      await page.evaluate(() => {
        const app = window.__shotcandy.app;
        app.addAnnotation("rect", { x: 0.05, y: 0.2, w: 0.9, h: 0.16 });
      });
      await page.waitForTimeout(600);
    },
  ],
  [
    "mobile-gallery",
    async (page) => {
      await sample("sample-mobile-habits")(page);
      await page.evaluate(() => window.__shotcandy.app.ui.set({ modal: "gallery" }));
      await page.waitForTimeout(1800);
    },
  ],
  [
    "mobile-export",
    async (page) => {
      await sample("sample-mobile-habits")(page);
      await page.click("[data-testid=export]");
      await page.waitForTimeout(1200);
    },
  ],
  [
    "mobile-motion",
    async (page) => {
      await sample("sample-mobile-habits")(page);
      await page.click('[role=tab]:has-text("Motion")');
      await page.getByRole("button", { name: /^Float motion/ }).click();
      await page.evaluate(() => window.__shotcandy.app.seek(1));
      await page.waitForTimeout(700);
    },
  ],
  [
    "mobile-code",
    async (page) => {
      await page.evaluate(() => window.__shotcandy.app.setMode("code"));
      await page.waitForTimeout(1800);
    },
  ],
  [
    "mobile-post",
    async (page) => {
      await page.evaluate(() => window.__shotcandy.app.setMode("post"));
      await page.waitForTimeout(1500);
    },
  ],
  [
    "mobile-appstore",
    async (page) => {
      await page.evaluate(async () => {
        const app = window.__shotcandy.app;
        app.setMode("appstore");
        const r = await fetch("/samples/sample-mobile-habits.webp");
        await app.sets.setSlideImage(0, await r.blob());
      });
      await page.waitForTimeout(1800);
    },
  ],
];

const pages = [
  ["about", "/about/"],
  ["landing-screenshot-beautifier", "/screenshot-beautifier/"],
  ["landing-macos-window-frame", "/macos-window-frame/"],
  ["landing-og-image-maker", "/og-image-maker/"],
  ["landing-code-screenshot", "/code-screenshot/"],
];

async function shoot(name, scheme, viewport, fn, path = "/", full = false) {
  if (only && !only.has(name)) return;
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: dpr,
    colorScheme: scheme,
    reducedMotion: "no-preference",
    ...(viewport.width < 768 ? { isMobile: true, hasTouch: true } : {}),
  });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: base });
  const page = await ctx.newPage();
  await page.goto(base + path, { waitUntil: "networkidle" });
  if (path === "/")
    await page.waitForFunction(
      () => window.__shotcandy?.ready === true && document.fonts.status === "loaded",
    );
  await page.waitForTimeout(500);
  await fn(page);
  const file = `${outDir}/${name}-${scheme}.png`;
  await page.screenshot({ path: file, fullPage: full });
  if ("webp" in flags) {
    const webp = file.replace(/\.png$/, ".webp");
    execFileSync("cwebp", ["-quiet", "-q", "90", "-m", "6", file, "-o", webp]);
    rmSync(file);
    console.log(webp);
  } else console.log(file);
  await ctx.close();
}

for (const scheme of ["light", "dark"]) {
  for (const [name, fn] of desktop) await shoot(name, scheme, { width: 1440, height: 900 }, fn);
  for (const [name, fn] of mobile) await shoot(name, scheme, { width: 390, height: 844 }, fn);
  for (const [name, path] of pages)
    await shoot(name, scheme, { width: 1440, height: 900 }, async () => {}, path, true);
}

await browser.close();
server?.kill();
