/**
 * Screenshots of the batch UI for design review (not assertions). Runs only
 * with BATCH_SHOTS=<folder>; writes PNGs there.
 */
import { test, type Page } from "@playwright/test";
import { open } from "./helpers";
import { SHOTS, dropFiles, thumbsReady, tiles, waitForCount } from "./batch-helpers";

const DIR = process.env.BATCH_SHOTS;
test.skip(!DIR, "set BATCH_SHOTS to a folder to take the review screenshots");
test.skip(({ browserName }) => browserName !== "chromium", "screenshots once, in Chromium");

const NAMES = [
  "Dashboard – light.png",
  "Editor dark.png",
  "Kanban board.png",
  "Landing hero.png",
  "Habits (iPhone).png",
  "Settings – dark mode, with a very long file name.png",
];

async function six(page: Page, testId = "batch-tile") {
  await dropFiles(
    page,
    NAMES.map((name, i) => ({ name, from: SHOTS[i] })),
  );
  await waitForCount(page, 6, testId);
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`desktop ${scheme}`, () => {
    test.use({ colorScheme: scheme, viewport: { width: 1440, height: 900 } });

    test("rail", async ({ page }) => {
      await open(page);
      await six(page);
      // One image with its own frame, two selected.
      await tiles(page).nth(1).click();
      await page.getByTestId("batch-scope").getByRole("radio", { name: "This image" }).click();
      await page.getByRole("radio", { name: "Browser" }).click();
      await tiles(page).nth(3).click();
      await tiles(page)
        .nth(4)
        .click({ modifiers: ["ControlOrMeta"] });
      await thumbsReady(page);
      await page.mouse.move(700, 880);
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${DIR}/desktop-${scheme}.png` });
      await tiles(page).nth(1).click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${DIR}/desktop-${scheme}-custom.png` });
      if (scheme === "light") {
        await tiles(page).nth(1).click({ button: "right" });
        await page.waitForTimeout(300);
        await page.screenshot({ path: `${DIR}/desktop-menu.png` });
        await page.keyboard.press("Escape");
        await page.getByTestId("export-options").click();
        await page.waitForTimeout(600);
        await page.screenshot({ path: `${DIR}/desktop-export.png` });
        await page.keyboard.press("Escape");
        await page.getByRole("button", { name: "Collapse images" }).click();
        await page.waitForTimeout(400);
        await page.screenshot({ path: `${DIR}/desktop-collapsed.png` });
      }
    });
  });
}

test.describe("desktop compact", () => {
  test.use({ viewport: { width: 1024, height: 720 } });
  test("rail at 1024", async ({ page }) => {
    await open(page);
    await dropFiles(
      page,
      NAMES.map((name, i) => ({ name, from: SHOTS[i] })),
    );
    // Smaller windows start with the rail collapsed.
    await page.getByRole("button", { name: "Show images (6)" }).waitFor();
    await page.mouse.move(600, 700);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${DIR}/desktop-1024.png` });
    await page.getByRole("button", { name: /Show images/ }).click();
    await thumbsReady(page);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${DIR}/desktop-1024-open.png` });
  });
});

for (const scheme of ["light", "dark"] as const) {
  test.describe(`phone ${scheme}`, () => {
    test.use({ colorScheme: scheme, viewport: { width: 390, height: 844 }, hasTouch: true });
    test("strip", async ({ page }) => {
      await open(page);
      await six(page, "batch-strip-tile");
      await page.getByTestId("batch-strip-tile").nth(1).click();
      await thumbsReady(page, "batch-strip-tile");
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${DIR}/phone-${scheme}.png` });
      if (scheme === "light") {
        await page.getByTestId("batch-select").click();
        await page.getByTestId("batch-strip-tile").nth(2).click();
        await page.waitForTimeout(300);
        await page.screenshot({ path: `${DIR}/phone-select.png` });
        await page.getByTestId("batch-strip-menu").click();
        await page.waitForTimeout(300);
        await page.screenshot({ path: `${DIR}/phone-menu.png` });
      }
    });
  });
}
