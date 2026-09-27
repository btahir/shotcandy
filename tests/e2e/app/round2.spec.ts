/**
 * Round-2 review fixes (docs/design/REVIEW.md, N1-N25) in the real editor:
 * export promises match the saved file, App Store guards and RGB output,
 * GIF estimates and defaults, the Code and Motion trays, and P2 polish.
 */
import { readFileSync } from "node:fs";
import { unzipSync } from "fflate";
import { expect, test, type Page } from "@playwright/test";
import type { EditorApp } from "../../../src/components/editor/app";
import { loadSample, open, pngSize } from "./helpers";

type W = { __shotcandy: { app: EditorApp } };

/** Load a generated PNG through the app: "noise" is incompressible, "tall"/"wide" are flat. */
async function loadGenerated(page: Page, w: number, h: number, kind: "noise" | "flat" = "flat") {
  await page.evaluate(
    async ([w, h, kind]) => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const g = c.getContext("2d")!;
      if (kind === "noise") {
        const img = g.createImageData(w, h);
        let x = 2463534242;
        for (let i = 0; i < img.data.length; i += 4) {
          // xorshift32: real noise, which no PNG encoder can shrink much.
          x ^= x << 13;
          x ^= x >>> 17;
          x ^= x << 5;
          x >>>= 0;
          img.data[i] = x >>> 24;
          img.data[i + 1] = (x >>> 16) & 255;
          img.data[i + 2] = (x >>> 8) & 255;
          img.data[i + 3] = 255;
        }
        g.putImageData(img, 0, 0);
      } else {
        g.fillStyle = "#fbf5ec";
        g.fillRect(0, 0, w, h);
        g.fillStyle = "#2a1f1a";
        for (let y = 20; y < h; y += 60) g.fillRect(20, y, w * 0.6, 14);
      }
      const b = await new Promise<Blob>((r) => c.toBlob((x) => r(x!), "image/png"));
      const app = (window as unknown as W).__shotcandy.app;
      if (app.ui.get().mode === "appstore") await app.sets.setSlideImage(app.sets.selected, b);
      else await app.loadBlob(b);
    },
    [w, h, kind] as const,
  );
}

const sizeText = (page: Page) =>
  expect(page.getByTestId("export-size")).not.toHaveText("sizing…", { timeout: 30_000 });

test("N1: X exports native pixels, and the popover shows the exact file that is saved", async ({
  page,
}) => {
  await open(page);
  await loadSample(page);
  await page.getByTestId("export-options").click();
  await page.getByRole("radio", { name: "X", exact: true }).click();
  await sizeText(page);
  await expect(page.getByTestId("export-dims")).toHaveText("3398 × 2376");
  const shownName = (await page.getByTestId("filename-preview").textContent())!.slice(2);
  const shownSize = await page.getByTestId("export-size").textContent();
  const [dl] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("download").click(),
  ]);
  expect(dl.suggestedFilename()).toBe(shownName);
  const buf = readFileSync((await dl.path())!);
  expect(pngSize(buf)).toEqual({ width: 3398, height: 2376 });
  expect(shownSize).toBe(`${(buf.length / 1024 / 1024).toFixed(1)} MB`);
});

test("N1: a PNG too big for X is announced as JPEG before and after saving", async ({ page }) => {
  await open(page);
  await loadGenerated(page, 2600, 1700, "noise");
  await page.getByTestId("export-options").click();
  await page.getByRole("radio", { name: "X", exact: true }).click();
  await sizeText(page);
  await expect(page.getByTestId("export-format")).toHaveText("JPEG");
  await expect(page.getByTestId("fit-badge")).toContainText("JPEG to fit X’s 5 MB");
  await expect(page.getByTestId("filename-preview")).toContainText(".jpg");
  const [dl] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("download").click(),
  ]);
  expect(dl.suggestedFilename()).toMatch(/\.jpg$/);
  const buf = readFileSync((await dl.path())!);
  expect(buf[0]).toBe(0xff); // JPEG SOI
  expect(buf.length).toBeLessThanOrEqual(5 * 1024 * 1024);
  await expect(page.getByTestId("toast")).toContainText("saved as JPEG to fit X’s 5 MB");
});

test("N7: GIF defaults to 640 px at 15 fps and shows a size estimate close to the real file", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "encoding timings are checked once");
  await open(page);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await open(page);
  await loadSample(page);
  await page.getByRole("button", { name: /^Float motion/ }).click();
  await page.getByTestId("export-options").click();
  await page.getByRole("tab", { name: "Video" }).click();
  await page.getByRole("radio", { name: "GIF", exact: true }).click();
  await expect(page.getByRole("radio", { name: "M", exact: true })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(page.getByRole("radio", { name: "15", exact: true })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(page.getByTestId("motion-size")).toContainText("≈", { timeout: 30_000 });
  await expect(page.getByTestId("gif-fit")).toBeVisible();
  const est = await page.evaluate(() => (window as unknown as W).__shotcandy.app.estimateMotion());
  const actual = await page.evaluate(async () => {
    const app = (window as unknown as W).__shotcandy.app;
    const s = app.ui.get().exportSettings.motion;
    const plan = app.motionPlan(s)!;
    const r = await app.animator.export(app.scene, app.exportAssets(app.scene), {
      format: "gif",
      scale: plan.scale,
      quality: s.quality,
      fps: s.gifFps,
      gifColors: s.gifColors,
      dither: s.dither,
    });
    return r.blob.size;
  });
  expect(Math.abs(est / actual - 1)).toBeLessThan(0.2);
  expect(actual).toBeLessThan(5 * 1024 * 1024);
});

test("N3/N4/N20: App Store guards, skipped empty slides and clean file names", async ({ page }) => {
  await open(page);
  await page.getByRole("tab", { name: "App Store" }).click();
  await expect(page.getByTestId("board")).toBeVisible();
  // Slide 1 gets a landscape screenshot: warned, then cropped to the phone.
  await loadGenerated(page, 2400, 1500);
  const guard = page.getByTestId("slide-guard");
  await expect(guard).toContainText("landscape");
  await expect(page.getByTestId("slide-warn-0")).toBeVisible();
  await guard.getByRole("button", { name: "Crop to phone" }).click();
  await expect(guard).toHaveCount(0);
  const crop = await page.evaluate(
    () => (window as unknown as W).__shotcandy.app.sets.set.slides[0]!.crop,
  );
  expect(crop?.height).toBe(1);
  // Slide 2 gets a portrait one; the other slides stay empty.
  await page.getByTestId("slide-1").click();
  await loadGenerated(page, 1290, 2796);
  await page.getByTestId("export-options").click();
  await expect(page.getByTestId("set-empty")).toContainText("3 slides have no screenshot");
  await expect(page.getByTestId("export-zip")).toContainText("(2)");
  const [dl] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("export-zip").click(),
  ]);
  const files = Object.keys(unzipSync(new Uint8Array(readFileSync((await dl.path())!))));
  expect(files).toHaveLength(2);
  for (const f of files) expect(f.split("/").pop()).toMatch(/^\d\d(-[a-z0-9]+)*\.png$/);
  await expect(page.getByTestId("toast")).toContainText("skipped 3 without a screenshot");
});

test("N6: phone App Store export offers only set sizes and saves an RGB PNG", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "phone layout checked once");
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await page.evaluate(() => (window as unknown as W).__shotcandy.app.setMode("appstore"));
  await loadGenerated(page, 1290, 2796);
  await page.getByTestId("export").first().click();
  const sheet = page.getByRole("dialog", { name: "Export set" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("radiogroup", { name: "Export for" })).toHaveCount(0);
  await expect(sheet.getByRole("radiogroup", { name: "Scale" })).toHaveCount(0);
  const [dl] = await Promise.all([
    page.waitForEvent("download"),
    sheet.getByTestId("save-slide").click(),
  ]);
  const buf = readFileSync((await dl.path())!);
  expect(pngSize(buf)).toEqual({ width: 1320, height: 2868 });
  expect(buf[25]).toBe(2); // PNG colour type 2: RGB, no alpha
});

test("N18: Esc closes the phone export sheet; a mode switch opens that mode's first tab", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "phone layout checked once");
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await loadSample(page);
  await page.getByTestId("export").first().click();
  await expect(page.getByRole("dialog", { name: "Save your image" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Save your image" })).toHaveCount(0);
  await page.getByRole("tab", { name: "Draw" }).click();
  await page.evaluate(() => (window as unknown as W).__shotcandy.app.setMode("code"));
  await expect(page.getByRole("tab", { name: "Code" }).last()).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("N8/N9/N12: full language label, Motion below Frame, honest line count", async ({ page }) => {
  await open(page);
  await loadSample(page);
  const order = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".inspector .tray h2")).map((h) => h.textContent),
  );
  expect(order.indexOf("Motion")).toBeGreaterThan(order.indexOf("Frame"));
  expect(order.indexOf("Background")).toBe(1);
  await page.getByRole("tab", { name: "Code" }).click();
  await page.evaluate(() =>
    (window as unknown as W).__shotcandy.app.setCode({
      code: "const a: number = 1;\nexport type A = { a: number };\n",
      language: "typescript",
    }),
  );
  const chip = page.getByTestId("language");
  await expect(chip).toContainText("TypeScript");
  expect(
    await chip.locator(".lang-txt").evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  await expect(page.getByTestId("code-tray").locator(".tray-head .meta")).toHaveText("2 lines");
});

test("N17: an empty post can't be exported", async ({ page }) => {
  await open(page);
  await page.getByRole("tab", { name: "Post" }).click();
  await page.evaluate(() => (window as unknown as W).__shotcandy.app.setPost({ text: "" }));
  await page.getByTestId("export").click();
  await expect(page.getByTestId("toast")).toContainText("Write the post first");
  // The stage shows placeholder copy, never an empty hole.
  await expect(page.getByTestId("preview")).toBeVisible();
});

test("N10/N11/N23: notes and toasts keep clear of the canvas; the h1 is inside main", async ({
  page,
}) => {
  await open(page);
  await loadGenerated(page, 320, 200);
  const note = await page.getByTestId("note-small").boundingBox();
  const tag = await page.getByTestId("size-tag").boundingBox();
  expect(note && tag).toBeTruthy();
  const overlap = (a: typeof note, b: typeof tag) =>
    !!a &&
    !!b &&
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height;
  expect(overlap(note, tag)).toBe(false);
  await page.keyboard.press("s");
  const toast = await page.getByTestId("toast").boundingBox();
  const canvas = await page.getByTestId("preview").boundingBox();
  expect(overlap(toast, canvas)).toBe(false);
  expect(overlap(toast, await page.getByTestId("size-tag").boundingBox())).toBe(false);
  expect(await page.locator("main h1").count()).toBe(1);
});

test("N21: Candy Shuffle keeps the export size across rolls", async ({ page }) => {
  await open(page);
  await loadSample(page);
  const sizes = new Set<string>();
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("s");
    sizes.add((await page.getByTestId("size-tag").textContent()) ?? "");
  }
  expect(sizes.size).toBe(1);
});
