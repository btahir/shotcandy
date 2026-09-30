/**
 * Screenshots of the Screens tray and the screens on the stage, for design
 * review (not assertions). Runs only with SCREENS_SHOTS=<folder>.
 */
import { test } from "@playwright/test";
import { loadSample, open } from "./helpers";
import { SHOTS, dropFiles, thumbsReady, tiles, waitForCount } from "./batch-helpers";
import { dragOver, fillByClick, pickLayout, screenPoint, waitScreen } from "./screens-helpers";

const DIR = process.env.SCREENS_SHOTS;
test.skip(!DIR, "set SCREENS_SHOTS to a folder to take the review screenshots");
test.skip(({ browserName }) => browserName !== "chromium", "screenshots once, in Chromium");

for (const scheme of ["light", "dark"] as const) {
  test.describe(`desktop ${scheme}`, () => {
    test.use({ colorScheme: scheme, viewport: { width: 1440, height: 900 } });

    test("tray and stage", async ({ page }) => {
      await open(page);
      await loadSample(page);
      await page.waitForTimeout(500);
      await page
        .getByTestId("inspector")
        .screenshot({ path: `${DIR}/${scheme}-1-single-tray.png` });
      await pickLayout(page, "Side by side");
      await page.mouse.move(10, 400);
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${DIR}/${scheme}-2-side-by-side.png` });
      const p = await screenPoint(page, 1);
      await page.mouse.move(p.x, p.y);
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${DIR}/${scheme}-3-hover-empty.png` });
      await fillByClick(page, 1, SHOTS[1]);
      await waitScreen(page, 1);
      await pickLayout(page, "Cascade");
      await page.waitForTimeout(300);
      const q = await screenPoint(page, 1);
      await page.mouse.move(q.x, q.y);
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${DIR}/${scheme}-4-cascade-hover-filled.png` });
      await page
        .getByTestId("inspector")
        .screenshot({ path: `${DIR}/${scheme}-5-cascade-tray.png` });
      // Drag screen 2 toward screen 1 (swap indicator).
      await page.mouse.down();
      const r = await screenPoint(page, 0);
      await page.mouse.move(r.x, r.y, { steps: 6 });
      await page.waitForTimeout(200);
      await page.screenshot({ path: `${DIR}/${scheme}-6-swap-drag.png` });
      await page.keyboard.press("Escape");
      await page.mouse.up();
      // Files dragged over the empty screen.
      const e = await screenPoint(page, 2);
      await dragOver(page, e);
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${DIR}/${scheme}-7-file-over-empty.png` });
      await page.evaluate(() =>
        document.body.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true })),
      );
      // Keyboard focus and the menu.
      await page.mouse.move(10, 400);
      await page.locator("[data-testid=screen][data-screen='1']").focus();
      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Tab");
      await page.waitForTimeout(200);
      await page.screenshot({ path: `${DIR}/${scheme}-8-focus.png` });
      await page.keyboard.press("Shift+F10");
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${DIR}/${scheme}-9-menu.png` });
      await page.keyboard.press("Escape");
      for (const name of ["Overlap", "Hero", "Fan", "Grid"]) {
        await pickLayout(page, name);
        await page.mouse.move(10, 400);
        await page.waitForTimeout(400);
        await page.screenshot({ path: `${DIR}/${scheme}-L-${name.toLowerCase()}.png` });
      }
    });

    test("batch", async ({ page }) => {
      await open(page);
      await dropFiles(
        page,
        ["login.png", "home.png", "settings.png"].map((name, i) => ({ name, from: SHOTS[i] })),
      );
      await waitForCount(page, 3);
      await pickLayout(page, "Side by side");
      await thumbsReady(page);
      // Drag image 3 from the rail onto the empty screen.
      const t = await tiles(page).nth(2).boundingBox();
      await page.mouse.move(t!.x + t!.width / 2, t!.y + t!.height / 2);
      await page.mouse.down();
      const p = await screenPoint(page, 1);
      await page.mouse.move(p.x, p.y, { steps: 8 });
      await page.waitForTimeout(250);
      await page.screenshot({ path: `${DIR}/${scheme}-B1-rail-drag.png` });
      await page.mouse.up();
      await page.waitForTimeout(600);
      await thumbsReady(page);
      await page.screenshot({ path: `${DIR}/${scheme}-B2-batch.png` });
      const q = await screenPoint(page, 0);
      await page.mouse.click(q.x, q.y, { button: "right" });
      await page.getByRole("menuitem", { name: "From your images…" }).click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${DIR}/${scheme}-B4-from-images.png` });
      await page.keyboard.press("Escape");
      await tiles(page).nth(1).click();
      await tiles(page)
        .nth(2)
        .click({ modifiers: ["ControlOrMeta"] });
      await tiles(page).nth(2).click({ button: "right" });
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${DIR}/${scheme}-B3-combine-menu.png` });
    });
  });
}

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("layout tab", async ({ page }) => {
    await open(page);
    await loadSample(page);
    await page.getByRole("tab", { name: "Layout" }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${DIR}/phone-1-layout-tab.png` });
    await page.getByTestId("screens-tray").getByRole("radio", { name: "Side by side" }).tap();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${DIR}/phone-2-side-by-side.png` });
  });
});

test.describe("icons close up", () => {
  test.use({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 3 });

  test("screens row", async ({ page }) => {
    await open(page);
    await loadSample(page);
    await pickLayout(page, "Fan");
    await page.mouse.move(10, 400);
    await page.waitForTimeout(300);
    await page.getByTestId("screens-tray").screenshot({ path: `${DIR}/icons-3x.png` });
  });
});
