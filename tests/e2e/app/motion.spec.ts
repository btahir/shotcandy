/**
 * Motion in the real app: pick a preset, preview with the timeline, scrub,
 * export MP4 and GIF through the Export popover (files verified from their
 * container structure), cancel a render, and axe in light and dark.
 */
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { parseGif, parseMp4 } from "../../helpers/media";
import { loadSample, open } from "./helpers";

async function pickMotion(page: Page, name: string) {
  await page.getByRole("button", { name: new RegExp(`^${name} motion`) }).click();
  await expect(page.getByTestId("timeline")).toBeVisible();
}

async function openVideoTab(page: Page) {
  await page.getByTestId("export-options").click();
  await page.getByRole("tab", { name: "Video" }).click();
  await expect(page.getByTestId("motion-export")).toBeVisible();
}

test("picking a motion shows the timeline and plays a live preview", async ({ page }) => {
  await open(page);
  await loadSample(page);
  await expect(page.getByTestId("timeline")).toHaveCount(0);
  await pickMotion(page, "Float");
  await expect(page.getByRole("button", { name: /^Float motion/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // The playhead moves while playing (unless the browser prefers reduced motion).
  await page.getByTestId("scrubber").focus();
  const v1 = Number(await page.getByTestId("scrubber").getAttribute("aria-valuenow"));
  await page.waitForTimeout(500);
  const v2 = Number(await page.getByTestId("scrubber").getAttribute("aria-valuenow"));
  expect(v2).not.toBe(v1);
  // Pause, then step frame by frame with the keyboard.
  await page.getByTestId("play").click();
  await page.getByTestId("scrubber").press("Home");
  await expect(page.getByTestId("scrubber")).toHaveAttribute("aria-valuenow", "0");
  await page.getByTestId("scrubber").press("ArrowRight");
  await expect(page.getByTestId("scrubber")).toHaveAttribute("aria-valuenow", "0.03");
  // The Export button now exports the clip.
  await expect(page.getByTestId("export")).toContainText("MP4");
  // Turning motion off returns to still export.
  await page.getByRole("button", { name: /^No motion/ }).click();
  await expect(page.getByTestId("timeline")).toHaveCount(0);
  await expect(page.getByTestId("export")).toContainText("PNG");
});

test("scrubbing shows real frames and Still returns to the editable design", async ({ page }) => {
  await open(page);
  await loadSample(page);
  await pickMotion(page, "Zoom in");
  const track = page.getByTestId("scrubber");
  const box = (await track.boundingBox())!;
  await page.mouse.click(box.x + 2, box.y + box.height / 2);
  const start = await page.evaluate(() =>
    (document.querySelector("[data-testid=preview]") as HTMLCanvasElement).toDataURL(),
  );
  await page.getByRole("button", { name: "Show the still design" }).click();
  await page.waitForTimeout(100);
  const still = await page.evaluate(() =>
    (document.querySelector("[data-testid=preview]") as HTMLCanvasElement).toDataURL(),
  );
  expect(start).not.toBe(still);
  await expect(page.getByTestId("size-tag")).toBeVisible();
});

test("exports an MP4 with the chosen size, frame rate and length", async ({ page }) => {
  await open(page);
  await loadSample(page);
  await pickMotion(page, "Zoom in");
  await page.getByRole("slider", { name: "Length" }).focus();
  await page.getByRole("slider", { name: "Length" }).press("Home");
  await openVideoTab(page);
  await page.getByRole("radio", { name: "720p" }).click();
  await expect(page.getByTestId("motion-dims")).toHaveText("1030 × 720 px");
  await expect(page.getByTestId("motion-summary")).toContainText("1.0 s · 30 frames");
  const [dl] = await Promise.all([
    page.waitForEvent("download", { timeout: 90_000 }),
    page.getByTestId("export-motion").click(),
  ]);
  expect(dl.suggestedFilename()).toMatch(/\.mp4$/);
  const info = parseMp4(readFileSync(await dl.path()));
  expect([info.width, info.height]).toEqual([1030, 720]);
  expect(info.frames).toBe(30);
  expect(info.mediaDuration).toBeCloseTo(1, 2);
  expect(info.fps).toBeCloseTo(30, 1);
  await expect(page.getByTestId("toast")).toContainText(/Saved .*\.mp4/);
});

test("exports a looping GIF", async ({ page }) => {
  await open(page);
  await loadSample(page);
  await pickMotion(page, "Drift");
  await page.getByRole("slider", { name: "Length" }).focus();
  await page.getByRole("slider", { name: "Length" }).press("Home");
  await openVideoTab(page);
  await page.getByRole("radio", { name: "GIF", exact: true }).click();
  await page.getByRole("radio", { name: "S", exact: true }).click();
  await page.getByRole("radio", { name: "10", exact: true }).click();
  const [dl] = await Promise.all([
    page.waitForEvent("download", { timeout: 90_000 }),
    page.getByTestId("export-motion").click(),
  ]);
  expect(dl.suggestedFilename()).toMatch(/\.gif$/);
  const gif = parseGif(readFileSync(await dl.path()));
  expect(gif.trailer).toBe(true);
  expect(gif.width).toBe(480);
  expect(gif.frames).toBe(10);
  expect(gif.loop).toBe(0);
  expect(gif.delays.reduce((a, b) => a + b, 0)).toBe(100);
});

test("a render can be cancelled", async ({ page }) => {
  await open(page);
  await loadSample(page);
  await pickMotion(page, "3D sweep");
  await openVideoTab(page);
  await page.getByRole("radio", { name: "1440p" }).click();
  await page.getByTestId("export-motion").click();
  await expect(page.getByTestId("render-pill")).toBeVisible();
  await page.getByTestId("cancel-render").click();
  await expect(page.getByTestId("render-pill")).toHaveCount(0);
  await expect(page.getByTestId("toast")).toContainText("Export cancelled");
});

for (const scheme of ["light", "dark"] as const) {
  test(`motion UI passes axe (${scheme})`, async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "axe runs once, in Chromium");
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await open(page);
    await loadSample(page);
    await pickMotion(page, "Focus");
    await openVideoTab(page);
    const r = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(" ")}`)).toEqual([]);
  });
}
