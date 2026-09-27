/**
 * The newer controls: smart export scale and destinations, the Candy Jar's
 * keyboard model, hover-to-preview, Candy Shuffle, Edit gradient, frame theme,
 * position and bleed, long and small screenshots, code line highlighting and
 * undo across modes.
 */
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import type { EditorApp } from "../../../src/components/editor/app";
import { chooseSize, loadSample, open, pngSize } from "./helpers";

type W = { __shotcandy: { app: EditorApp } };
const scene = (page: Page) =>
  page.evaluate(() => (window as unknown as W).__shotcandy.app.store.getState().scene);

/** Load a generated PNG (w x h) through the app. */
async function loadGenerated(page: Page, w: number, h: number) {
  await page.evaluate(
    async ([w, h]) => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const g = c.getContext("2d")!;
      g.fillStyle = "#fbf5ec";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#2a1f1a";
      for (let y = 20; y < h; y += 60) g.fillRect(20, y, w * 0.6, 14);
      const b = await new Promise<Blob>((r) => c.toBlob((x) => r(x!), "image/png"));
      await (window as unknown as W).__shotcandy.app.loadBlob(b);
    },
    [w, h] as const,
  );
  await expect(page.getByTestId("preview")).toBeVisible();
}

test("export defaults to Auto 1× (native pixels) and says how big the file is", async ({
  page,
}) => {
  await open(page);
  await loadSample(page);
  const plan = await page.evaluate(() => (window as unknown as W).__shotcandy.app.exportPlan());
  await expect(page.getByTestId("export")).toContainText("Auto 1×");
  await page.getByTestId("export-options").click();
  await expect(page.getByTestId("export-dims")).toHaveText(`${plan.width} × ${plan.height}`);
  await expect(page.getByTestId("export-size")).toContainText(/≈ \d/);
  const [dl] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("download").click(),
  ]);
  expect(pngSize(readFileSync((await dl.path())!))).toEqual({
    width: plan.width,
    height: plan.height,
  });
  expect(plan.scale).toBe(1);
});

test("destinations pick size and format, with limit badges", async ({ page }) => {
  await open(page);
  await loadSample(page);
  await page.getByTestId("export-options").click();
  await page.getByRole("radio", { name: "X", exact: true }).click();
  await expect(page.getByTestId("export")).toContainText("X · PNG");
  await expect(page.getByTestId("fit-badge")).toContainText("X’s 5 MB", { timeout: 15_000 });
  await page.getByRole("radio", { name: "Instagram" }).click();
  await expect(page.getByTestId("export-dims")).toHaveText(/^1080 × \d+$/);
  const [dl] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("download").click(),
  ]);
  expect(dl.suggestedFilename()).toMatch(/^shotcandy-1080x\d+\.jpg$/);
  // Choosing Original again restores the normal controls.
  await page.getByTestId("export-options").click();
  await page.getByRole("radio", { name: "Original" }).click();
  await expect(
    page.getByRole("radiogroup", { name: "Scale" }).getByRole("radio", { name: /^Auto/ }),
  ).toBeVisible();
});

test("Copy is capped at 4096 px, with the full size one click away", async ({
  page,
  context,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "clipboard permissions are Chromium-only");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page);
  await loadSample(page);
  await page.getByTestId("export-options").click();
  await page.getByRole("radio", { name: "2×", exact: true }).click();
  await expect(page.getByRole("switch", { name: "Copy at full size" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByTestId("copy").click();
  await expect(page.getByTestId("toast")).toContainText("sized for pasting");
  const long = await page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    const bmp = await createImageBitmap(await item!.getType("image/png"));
    return Math.max(bmp.width, bmp.height);
  });
  expect(long).toBe(4096);
  await expect(
    page.getByTestId("toast").getByRole("button", { name: "Copy full size" }),
  ).toBeVisible();
});

test("Candy Jar: focus trap, Esc closes cleanly, focus returns, Enter applies the highlight", async ({
  page,
}) => {
  await open(page);
  await loadSample(page);
  const jar = page.getByRole("dialog", { name: "Candy Jar" });
  // Opened from the button: focus lands on the current style, and returns to the button.
  const allStyles = page.getByRole("button", { name: /All styles/ });
  await allStyles.click();
  await expect(jar).toBeVisible();
  await expect(page.getByRole("button", { name: /^Sherbet, Fruity, current style/ })).toBeFocused();
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest("[role=dialog]"))).toBe(
      true,
    );
  }
  await page.keyboard.press("Escape");
  await expect(allStyles).toBeFocused();
  // The closing sheet is inert at once and gone shortly after.
  expect(
    await page.evaluate(() => {
      const d = document.querySelector(".modal-root");
      return !d || d.hasAttribute("inert");
    }),
  ).toBe(true);
  await expect(jar).toHaveCount(0);

  // Opened with G from the stage: arrows move the highlight from the search box, Enter applies it.
  await page.getByTestId("stage").focus();
  await page.keyboard.press("g");
  await expect(jar).toBeVisible();
  await jar.getByPlaceholder("Search styles").fill("mint");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(jar).toHaveCount(0);
  const s = await scene(page);
  expect(s.meta.stylePresetId).toMatch(/mint/);
  await expect(page.getByTestId("stage")).toBeFocused();
});

test("hovering a style previews it on the stage and reverts on leave", async ({ page }) => {
  await open(page);
  await loadSample(page);
  await page.getByRole("button", { name: /^Grape Isometric style/ }).hover();
  await expect(page.locator(".preview-pill")).toHaveText("Preview · Grape Isometric");
  expect((await scene(page)).meta.stylePresetId).toBe("sherbet");
  await page.mouse.move(400, 500);
  await expect(page.locator(".preview-pill")).toHaveCount(0);
});

test("Candy Shuffle re-rolls the composition in one undo step", async ({ page }) => {
  await open(page);
  await loadSample(page);
  const before = await scene(page);
  await page.keyboard.press("s");
  await expect(page.getByTestId("toast")).toContainText("Shuffled");
  const after = await scene(page);
  expect(after.meta.stylePresetId).not.toBe(before.meta.stylePresetId);
  await page.getByTestId("toast").getByRole("button", { name: "Undo" }).click();
  expect((await scene(page)).meta.stylePresetId).toBe(before.meta.stylePresetId);
  await page.getByTestId("shuffle").click();
  expect((await scene(page)).meta.stylePresetId).not.toBe(before.meta.stylePresetId);
});

test("Edit gradient: type, angle dial, stops, mesh shuffle and hue", async ({ page }) => {
  await open(page);
  await loadSample(page);
  await page.getByRole("button", { name: /Edit gradient/ }).click();
  const ed = page.getByTestId("gradient-editor");
  await ed.getByRole("radio", { name: "Linear" }).click();
  expect((await scene(page)).background.fill.kind).toBe("linear");
  const dial = ed.getByRole("slider", { name: "Angle" });
  const a0 = Number(await dial.getAttribute("aria-valuenow"));
  await dial.focus();
  await page.keyboard.press("Shift+ArrowRight");
  await expect(dial).toHaveAttribute("aria-valuenow", String((a0 + 45) % 360));
  const count = async () => {
    const f = (await scene(page)).background.fill;
    return f.kind === "linear" ? f.stops.length : -1;
  };
  const c0 = await count();
  await ed.getByRole("button", { name: "Remove this colour" }).click();
  expect(await count()).toBe(c0 - 1);
  await ed.getByRole("button", { name: "Add a colour" }).click();
  expect(await count()).toBe(c0);
  const stop = ed.getByRole("slider", { name: "Colour 1 position" });
  await stop.focus();
  await page.keyboard.press("Shift+ArrowRight");
  const n2 = (await scene(page)).background.fill;
  expect(n2.kind === "linear" && n2.stops[0]!.offset).toBeGreaterThan(0.05);
  await ed.getByRole("radio", { name: "Mesh" }).click();
  const m0 = (await scene(page)).background.fill;
  await ed.getByRole("button", { name: /Shuffle/ }).click();
  const m1 = (await scene(page)).background.fill;
  expect(m1.kind).toBe("mesh");
  expect(JSON.stringify(m1)).not.toBe(JSON.stringify(m0));
  const hue = ed.getByRole("slider", { name: "Hue" });
  await hue.focus();
  await page.keyboard.press("Shift+ArrowRight");
  expect(JSON.stringify((await scene(page)).background.fill)).not.toBe(JSON.stringify(m1));
});

test("frame theme defaults to Auto; position grid and bleed move the card", async ({ page }) => {
  await open(page);
  await loadSample(page);
  expect((await scene(page)).card.frame.theme).toBe("auto");
  await page
    .getByRole("radiogroup", { name: "Frame theme" })
    .getByRole("radio", { name: "Dark" })
    .click();
  expect((await scene(page)).card.frame.theme).toBe("dark");
  await chooseSize(page, "Instagram square");
  await page.getByRole("radio", { name: "bottom right" }).click();
  expect((await scene(page)).canvas.anchor).toBe("bottom-right");
  await page.getByRole("radio", { name: "Fill", exact: true }).click();
  expect((await scene(page)).canvas.fit).toBe("fill");
  const bleed = page.getByRole("slider", { name: "Bleed" });
  await bleed.focus();
  await page.keyboard.press("Shift+ArrowRight");
  expect((await scene(page)).canvas.bleed).toBeCloseTo(0.1, 5);
});

test("long captures offer Show all; small images say they were upscaled", async ({ page }) => {
  await open(page);
  await loadGenerated(page, 700, 4200);
  const tall = page.getByTestId("note-tall");
  await expect(tall).toContainText("showing the top");
  await tall.getByRole("button", { name: "Clean cut" }).click();
  expect((await scene(page)).content).toMatchObject({ fade: 0 });
  await tall.getByRole("button", { name: "Show all" }).click();
  expect((await scene(page)).content).toMatchObject({ tall: "full" });
  await expect(tall.getByRole("button", { name: "Top only" })).toBeVisible();

  await loadGenerated(page, 320, 200);
  const small = page.getByTestId("note-small");
  await expect(small).toContainText("upscaled 4×");
  await small.getByRole("button", { name: "Keep original size" }).click();
  expect((await scene(page)).canvas.upscale).toBe("off");
  await expect(small).toContainText("at its own size");
});

test("code: click a line on the stage to highlight it; window width", async ({ page }) => {
  await open(page);
  await page.getByRole("tab", { name: "Code" }).click();
  const layer = page.getByTestId("code-lines");
  await expect(layer).toBeVisible();
  const box = (await layer.boundingBox())!;
  const before = await scene(page);
  expect(before.content.kind === "code" && before.content.highlight).toEqual([]);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.45);
  const s = await scene(page);
  expect(s.content.kind === "code" && s.content.highlight.length).toBe(1);
  const width = page.getByRole("slider", { name: "Width" });
  await width.focus();
  await page.keyboard.press("Shift+ArrowRight");
  const w = await scene(page);
  expect(w.content.kind === "code" && (w.content.width ?? 0)).toBeGreaterThan(0);
});

test("undo history survives a trip to another mode", async ({ page }) => {
  await open(page);
  await loadSample(page);
  const pad = page.getByRole("slider", { name: "Padding" });
  const p0 = Number(await pad.getAttribute("aria-valuenow"));
  await pad.focus();
  await page.keyboard.press("Shift+ArrowRight");
  await page.getByRole("tab", { name: "Code" }).click();
  await page.getByRole("tab", { name: "Screenshot" }).click();
  await expect(page.getByRole("button", { name: /^Undo/ })).toBeEnabled();
  await page.getByRole("button", { name: /^Undo/ }).click();
  expect((await scene(page)).canvas.padding).toBe(p0);
});

test("copy or export with nothing loaded says what to do", async ({ page }) => {
  await open(page);
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("ControlOrMeta+c");
  await expect(page.getByTestId("toast")).toContainText("Paste a screenshot first");
});

test("the Candy Jar lists device styles last for a landscape screenshot", async ({ page }) => {
  await open(page);
  await loadSample(page);
  await page.keyboard.press("g");
  const labels = page.getByRole("dialog", { name: "Candy Jar" }).locator(".jar-card .lbl span");
  await expect(labels.first()).toBeVisible();
  const names = await labels.allTextContents();
  const firstDevice = names.indexOf("Device");
  expect(firstDevice).toBeGreaterThan(0);
  expect(names.slice(firstDevice).every((n) => n === "Device" || n !== "Fruity")).toBe(true);
  expect(names.at(-1)).toBe("Device");
});
