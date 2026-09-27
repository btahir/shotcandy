/**
 * Round-3 polish (docs/design/REVIEW.md): the caption card for tall canvases,
 * toast placement, App Store export count, the Draw on hint, instant motion
 * estimates, and the Export chevron with real clicks.
 */
import { expect, test, type Page } from "@playwright/test";
import type { EditorApp } from "../../../src/components/editor/app";
import { SAMPLE_B64, chooseSize, loadSample, open } from "./helpers";

type W = { __shotcandy: { app: EditorApp } };
const scene = (page: Page) =>
  page.evaluate(() => (window as unknown as W).__shotcandy.app.store.getState().scene);

const overlap = (
  a: { x: number; y: number; width: number; height: number } | null,
  b: { x: number; y: number; width: number; height: number } | null,
) =>
  !!a &&
  !!b &&
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;

async function realChevronClick(page: Page) {
  const chevron = page.getByTestId("export-options");
  const box = (await chevron.boundingBox())!;
  // A human-like click: glide over, press, hold, release (no scrolling help).
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 12 });
  await page.mouse.down();
  await page.waitForTimeout(110);
  await page.mouse.up();
  await expect(page.getByRole("dialog", { name: "Export options" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Export options" })).toHaveCount(0);
}

test("the Export chevron opens its popover with a real click: after paste, Shuffle and motion", async ({
  page,
  browserName,
}) => {
  await open(page);
  if (browserName === "chromium") {
    // A real paste event carrying the file.
    await page.evaluate(async (b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], "shot.png", { type: "image/png" }));
      document.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true }));
    }, SAMPLE_B64);
    await expect(page.getByTestId("preview")).toBeVisible();
  } else {
    await loadSample(page);
  }
  await realChevronClick(page);
  await page.keyboard.press("s");
  await expect(page.getByTestId("toast")).toContainText("Shuffled");
  await realChevronClick(page);
  // Picking a motion at the bottom of the inspector scrolls things into view;
  // the page itself must never scroll (it pushed the header off screen).
  await page.getByTestId("motion-tray").scrollIntoViewIfNeeded();
  await page.evaluate(() => document.querySelector("[data-testid=motion-tray]")!.scrollIntoView());
  await page.getByRole("button", { name: /^3D sweep motion/ }).click();
  expect(await page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(0);
  expect(
    await page.evaluate(() => document.scrollingElement!.scrollHeight <= window.innerHeight),
  ).toBe(true);
  await realChevronClick(page);
});

test("N14: a landscape shot at 9:16 gets a caption card, editable on the stage, with a toggle", async ({
  page,
}) => {
  await open(page);
  await loadSample(page);
  await chooseSize(page, "Instagram story");
  const s = await scene(page);
  expect(s.caption?.enabled).toBe(true);
  // Edit the headline in place.
  await page.getByTestId("caption-headline-hit").click();
  const editor = page.getByRole("textbox", { name: "Caption headline" }).first();
  await expect(editor).toBeFocused();
  await editor.fill("Ship faster");
  await page.keyboard.press("Enter");
  expect((await scene(page)).caption?.headline).toBe("Ship faster");
  // The canvas keeps its size and the caption sits in its top band.
  const geo = await page.evaluate(() => (window as unknown as W).__shotcandy.app.planInput());
  expect([geo.width, geo.height]).toEqual([1080, 1920]);
  const hit = (await page.getByTestId("caption-headline-hit").boundingBox())!;
  const canvas = (await page.getByTestId("preview").boundingBox())!;
  expect(hit.y).toBeGreaterThan(canvas.y - 8);
  expect(hit.y + hit.height).toBeLessThan(canvas.y + canvas.height * 0.3);
  // Toggle off in the Layout tray: the caption goes away and stays off.
  await page.getByRole("switch", { name: "Caption" }).click();
  expect((await scene(page)).caption?.enabled).toBe(false);
  await chooseSize(page, "Instagram portrait");
  expect((await scene(page)).caption?.enabled).toBe(false);
  // Wide canvases don't add one on their own.
  await page.reload();
  await open(page);
  await loadSample(page);
  await chooseSize(page, "Open Graph");
  expect((await scene(page)).caption).toBeUndefined();
});

test("the export toast keeps clear of the canvas, the size tag and the inspector", async ({
  page,
}) => {
  await open(page);
  await loadSample(page);
  await page.keyboard.press("s");
  await expect(page.getByTestId("toast")).toBeVisible();
  await page.waitForTimeout(450); // let the toast's rise-in and the style cross-fade finish
  const toast = await page.getByTestId("toast").boundingBox();
  expect(overlap(toast, await page.getByTestId("preview").boundingBox())).toBe(false);
  expect(overlap(toast, await page.getByTestId("size-tag").boundingBox())).toBe(false);
  expect(overlap(toast, await page.getByTestId("inspector").boundingBox())).toBe(false);
});

test("App Store export header counts the slides that will export", async ({ page }) => {
  await open(page);
  await page.getByRole("tab", { name: "App Store" }).click();
  await page.evaluate(async () => {
    const app = (window as unknown as W).__shotcandy.app;
    const b = await (await fetch("/samples/sample-mobile-habits.webp")).blob();
    await app.sets.setSlideImage(0, b);
    await app.sets.setSlideImage(1, b);
  });
  await page.getByTestId("export-options").click();
  await expect(page.getByTestId("set-export-count")).toHaveText("2 × 1320 × 2868");
  await page.getByRole("radio", { name: "Export anyway" }).click();
  await expect(page.getByTestId("set-export-count")).toHaveText("5 × 1320 × 2868");
});

test("Draw on without annotations says so in the tray; motion sizes show a range at once", async ({
  page,
}) => {
  await open(page);
  await loadSample(page);
  await page.getByRole("button", { name: /^Draw on motion/ }).click();
  const hint = page.getByTestId("draw-hint");
  await expect(hint).toBeVisible();
  await hint.getByRole("button", { name: "Add an arrow" }).click();
  expect(await page.evaluate(() => (window as unknown as W).__shotcandy.app.ui.get().tool)).toBe(
    "arrow",
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^Float motion/ }).click();
  await page.getByTestId("export-options").click();
  await page.getByRole("tab", { name: "Video" }).click();
  const size = page.getByTestId("motion-size");
  // Instantly a range, then the refined figure.
  await expect(size).toHaveText(/^≈ [\d.]+–[\d.]+ (KB|MB)$/, { timeout: 1500 });
  await expect(size).toHaveAttribute("data-refined", "true", { timeout: 30_000 });
  await expect(size).toHaveText(/^≈ [\d.]+ (KB|MB)$/);
});
