/**
 * Multi-screen designs: the Screens tray, the screens on the stage (fill,
 * replace, swap, empty; by click, drop, paste, drag and keyboard), exports
 * without placeholders, and how layouts live inside a batch.
 */
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { unzipSync } from "fflate";
import { type Page, expect, test } from "@playwright/test";
import { loadSample, open, pngSize } from "./helpers";
import {
  SHOTS,
  dropFiles,
  info,
  pasteFiles,
  thumbsReady,
  tiles,
  waitForCount,
} from "./batch-helpers";
import {
  design,
  dropAt,
  dragOver,
  fillByClick,
  pickLayout,
  screenPoint,
  undoLabel,
  waitScreen,
} from "./screens-helpers";

const tray = (page: Page) => page.getByTestId("screens-tray");
const screens = (page: Page) => page.getByTestId("screen");

/** Three images as a batch, in name order: login, home... sorted to home, login, settings. */
async function threeImages(page: Page) {
  await dropFiles(page, [
    { name: "login.png", from: SHOTS[0] },
    { name: "home.png", from: SHOTS[1] },
    { name: "settings.png", from: SHOTS[2] },
  ]);
  await waitForCount(page, 3);
}

test.describe("single image", () => {
  test("nothing changes but the Screens tray, set to Single", async ({ page }) => {
    await open(page);
    await expect(tray(page)).toHaveCount(0);
    await loadSample(page);
    await expect(tray(page)).toBeVisible();
    await expect(tray(page).getByRole("radio", { name: "Single" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(tray(page).getByRole("radio")).toHaveCount(7);
    await expect(page.getByTestId("screens-knobs")).toHaveCount(0);
    await expect(page.getByTestId("screens-layer")).toHaveCount(0);
    // After Styles and Background, before the card's own Layout.
    const order = await page
      .locator("[data-testid=inspector] section.tray")
      .evaluateAll((els) => els.slice(0, 4).map((e) => e.getAttribute("data-testid")));
    expect(order).toEqual(["styles-tray", "background-tray", "screens-tray", "layout-tray"]);
    // A dropped or pasted file still replaces the image.
    await dropFiles(page, [SHOTS[1]]);
    await expect(page.getByTestId("status")).toHaveText(/Screenshot added \(/);
    expect((await design(page)).layout).toBe("single");
    expect((await info(page)).kind).toBe("single");
  });

  test("each layout shows its screens and knobs; Single hides them", async ({ page }) => {
    await open(page);
    await loadSample(page);
    const expected: [string, number, number, number][] = [
      // name, screens shown, count options, sliders
      ["Side by side", 2, 2, 2],
      ["Overlap", 2, 0, 2],
      ["Hero", 3, 0, 3],
      ["Cascade", 3, 3, 2],
      ["Fan", 3, 3, 1],
      ["Grid", 4, 3, 1],
    ];
    for (const [name, shown, counts, sliders] of expected) {
      await pickLayout(page, name);
      await expect(screens(page)).toHaveCount(shown);
      await expect(page.getByTestId("screens-knobs").getByRole("slider")).toHaveCount(sliders);
      await expect(
        page.getByTestId("screens-knobs").getByRole("radiogroup", { name: "Number of screens" }),
      ).toHaveCount(counts ? 1 : 0);
      if (counts)
        await expect(
          page.getByTestId("screens-knobs").getByRole("radiogroup").getByRole("radio"),
        ).toHaveCount(counts);
      expect(await undoLabel(page)).toBe(`${name} layout`);
      expect((await design(page)).screens[0]).toBeTruthy();
    }
    await expect(screens(page).first()).toHaveAccessibleName(/^Screen 1 of 4, /);
    await expect(screens(page).nth(1)).toHaveAccessibleName("Screen 2 of 4, empty");
    await pickLayout(page, "Single");
    await expect(page.getByTestId("screens-layer")).toHaveCount(0);
    await expect(page.getByTestId("screens-knobs")).toHaveCount(0);
    expect(await undoLabel(page)).toBe("Single screen");
  });

  test("arrow keys move through the layouts as one undo step", async ({ page }) => {
    await open(page);
    await loadSample(page);
    await tray(page).getByRole("radio", { name: "Single" }).focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(tray(page).getByRole("radio", { name: "Overlap" })).toBeFocused();
    expect((await design(page)).layout).toBe("overlap");
    await page.keyboard.press("ControlOrMeta+z");
    expect((await design(page)).layout).toBe("single");
  });
});

test.describe("filling screens", () => {
  test("a click on an empty screen chooses its image", async ({ page }) => {
    await open(page);
    await loadSample(page);
    await pickLayout(page, "Side by side");
    await fillByClick(page, 1, SHOTS[1], "second.png");
    await waitScreen(page, 1);
    expect(await undoLabel(page)).toBe("Add image to screen 2");
    await expect(screens(page).nth(1)).toHaveAccessibleName("Screen 2 of 2, second.png");
    await expect(page.getByTestId("status")).toHaveText(/second\.png placed in screen 2 of 2/);
  });

  test("several files dropped fill the empty screens in name order, then grow", async ({
    page,
  }) => {
    await open(page);
    await loadSample(page);
    await pickLayout(page, "Cascade");
    await expect(page.getByTestId("screens-layer")).toBeVisible();
    // The veil says what a drop will do.
    await dragOver(page, { x: 5, y: 450 });
    await expect(page.getByTestId("drop-veil")).toContainText("Drop to fill 2 empty screens");
    await dropFiles(page, [
      { name: "b.png", from: SHOTS[2] },
      { name: "a.png", from: SHOTS[1] },
      { name: "c.png", from: SHOTS[3] },
    ]);
    await waitScreen(page, 3);
    const d = await design(page);
    expect(d.count).toBe(4);
    await expect(screens(page).nth(1)).toHaveAccessibleName(/, a\.png$/);
    await expect(screens(page).nth(2)).toHaveAccessibleName(/, b\.png$/);
    await expect(screens(page).nth(3)).toHaveAccessibleName(/, c\.png$/);
    expect(await undoLabel(page)).toBe("Fill 3 screens");
    await expect(page.getByTestId("toast")).toContainText("Filled 3 screens");
    // All full: a drop off the screens replaces the image, as always.
    expect((await info(page)).kind).toBe("single");
  });

  test("files beyond the layout's most join a batch with the usual toast", async ({ page }) => {
    await open(page);
    await loadSample(page);
    await pickLayout(page, "Side by side");
    await dropFiles(page, [
      { name: "a.png", from: SHOTS[1] },
      { name: "b.png", from: SHOTS[2] },
      { name: "c.png", from: SHOTS[3] },
      { name: "d.png", from: SHOTS[4] },
    ]);
    await waitForCount(page, 3);
    const b = await info(page);
    expect(b.names.slice(1)).toEqual(["c.png", "d.png"]);
    await expect(page.getByTestId("toast")).toContainText("Added 2 images");
    await expect(page.getByTestId("toast")).toContainText("Filled 2 screens");
    // The first design kept its screens.
    await tiles(page).nth(0).click();
    const d = await design(page);
    expect(d.layout).toBe("side-by-side");
    expect(d.count).toBe(3);
    expect(d.screens.every(Boolean)).toBe(true);
  });

  test("paste fills the next empty screen, then replaces as always", async ({ page }) => {
    await open(page);
    await loadSample(page);
    await pickLayout(page, "Hero");
    await pasteFiles(page, [{ name: "one.png", from: SHOTS[1] }]);
    await waitScreen(page, 1);
    await pasteFiles(page, [{ name: "two.png", from: SHOTS[2] }]);
    await waitScreen(page, 2);
    const full = await design(page);
    await pasteFiles(page, [{ name: "three.png", from: SHOTS[3] }]);
    await expect(page.getByTestId("status")).toHaveText(/Screenshot added \(/);
    const after = await design(page);
    expect(after.screens[0]).not.toBe(full.screens[0]);
    expect(after.screens.slice(1)).toEqual(full.screens.slice(1));
  });

  test("a file dropped on a filled screen replaces it", async ({ page }) => {
    await open(page);
    await loadSample(page);
    await pickLayout(page, "Side by side");
    const before = await design(page);
    const p = await screenPoint(page, 0);
    await dragOver(page, p);
    await expect(page.getByTestId("drop-veil")).toContainText("Drop to replace screen 1");
    await dropAt(page, [{ name: "new.png", from: SHOTS[2] }], p);
    await expect.poll(async () => (await design(page)).screens[0]).not.toBe(before.screens[0]);
    expect((await design(page)).screens[1]).toBeNull();
    await expect(page.getByTestId("toast")).toContainText("Replaced screen 1");
    expect(await undoLabel(page)).toBe("Replace screen 1");
    await page.keyboard.press("ControlOrMeta+z");
    expect((await design(page)).screens[0]).toBe(before.screens[0]);
  });
});

test.describe("arranging screens", () => {
  async function pair(page: Page) {
    await open(page);
    await loadSample(page);
    await pickLayout(page, "Side by side");
    await fillByClick(page, 1, SHOTS[1], "second.png");
    await waitScreen(page, 1);
    return design(page);
  }

  test("drag a screen onto another to swap them", async ({ page }) => {
    const d = await pair(page);
    const a = await screenPoint(page, 1);
    const b = await screenPoint(page, 0);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 8 });
    await expect(page.locator(".screen-shape.target")).toHaveCount(1);
    await expect(page.locator(".screen-hint.strong")).toHaveText("Swap");
    await page.mouse.up();
    expect((await design(page)).screens).toEqual([d.screens[1], d.screens[0]]);
    expect(await undoLabel(page)).toBe("Swap screens 1 and 2");
    await expect(page.getByTestId("toast")).toContainText("Swapped screens 1 and 2");
  });

  test("keyboard: Tab to a screen, Alt+arrows swap, Delete empties, Enter chooses", async ({
    page,
  }) => {
    const d = await pair(page);
    await page.getByTestId("stage").focus();
    await page.keyboard.press("Tab");
    await expect(screens(page).nth(0)).toBeFocused();
    await expect(screens(page).nth(0)).toHaveAccessibleName(/^Screen 1 of 2, /);
    await page.keyboard.press("Alt+ArrowRight");
    expect((await design(page)).screens).toEqual([d.screens[1], d.screens[0]]);
    // Focus follows the screen that moved.
    await expect(screens(page).nth(1)).toBeFocused();
    await expect(page.getByTestId("status")).toHaveText(/Swapped screens 1 and 2/);
    await page.keyboard.press("Delete");
    await waitScreen(page, 1, false);
    await expect(screens(page).nth(1)).toHaveAccessibleName("Screen 2 of 2, empty");
    expect(await undoLabel(page)).toBe("Remove screen 2");
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.keyboard.press("Enter"),
    ]);
    await chooser.setFiles({
      name: "back.png",
      mimeType: "image/png",
      buffer: readFileSync(`brand/samples/${SHOTS[3]}`),
    });
    await waitScreen(page, 1);
    // Screen 1 can be replaced but not emptied.
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Delete");
    expect((await design(page)).screens[0]).toBeTruthy();
  });

  test("hover × empties a screen; the menu swaps and removes", async ({ page }) => {
    const d = await pair(page);
    const p = await screenPoint(page, 1);
    await page.mouse.move(p.x, p.y);
    await page.getByTestId("screen-remove").click();
    await waitScreen(page, 1, false);
    await expect(page.getByTestId("toast")).toContainText("Removed second.png from screen 2");
    await page.getByTestId("toast").getByRole("button", { name: "Undo" }).click();
    await waitScreen(page, 1);
    // Right-click: Swap with previous, then Remove from design.
    await page.mouse.click(p.x, p.y, { button: "right" });
    const menu = page.getByTestId("screen-menu");
    await expect(menu.getByRole("menuitem", { name: /Swap with next/ })).toBeDisabled();
    await menu.getByRole("menuitem", { name: /Swap with previous/ }).click();
    expect((await design(page)).screens).toEqual([d.screens[1], d.screens[0]]);
    const q = await screenPoint(page, 1);
    await page.mouse.click(q.x, q.y, { button: "right" });
    await page
      .getByTestId("screen-menu")
      .getByRole("menuitem", { name: /Remove from design/ })
      .click();
    await waitScreen(page, 1, false);
    // Screen 1 has no Remove.
    const r = await screenPoint(page, 0);
    await page.mouse.click(r.x, r.y, { button: "right" });
    await expect(page.getByTestId("screen-menu").getByRole("menuitem")).toHaveCount(3);
    await page.keyboard.press("Escape");
  });

  test("count, sliders and Reset; Single keeps the screens for later", async ({ page }) => {
    const d = await pair(page);
    await page
      .getByTestId("screens-knobs")
      .getByRole("radiogroup", { name: "Number of screens" })
      .getByRole("radio", { name: "3" })
      .click();
    expect((await design(page)).count).toBe(3);
    await expect(screens(page)).toHaveCount(3);
    expect(await undoLabel(page)).toBe("Show 3 screens");
    const spacing = page.getByTestId("screens-knobs").getByRole("slider", { name: "Spacing" });
    await spacing.focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    expect((await design(page)).params.spacing).toBeCloseTo(0.37, 5);
    expect(await undoLabel(page)).toBe("Change spacing");
    await page.getByTestId("screens-reset").click();
    expect((await design(page)).params).toEqual({});
    await expect(tray(page).locator(".tray-head .meta")).toHaveText("Side by side");
    await pickLayout(page, "Single");
    await expect(page.getByTestId("status")).toHaveText(/1 other screen kept for later/);
    expect((await design(page)).screens).toEqual([d.screens[0], d.screens[1]]);
    await expect(page.getByTestId("screens-layer")).toHaveCount(0);
    await pickLayout(page, "Side by side");
    expect((await design(page)).screens).toEqual([d.screens[0], d.screens[1]]);
    await expect(screens(page).nth(1)).toHaveAccessibleName(/, second\.png$/);
  });

  test("annotations still belong to screen 1", async ({ page }) => {
    await pair(page);
    await page.keyboard.press("r");
    const p = await screenPoint(page, 0);
    await page.mouse.move(p.x - 40, p.y - 30);
    await page.mouse.down();
    await page.mouse.move(p.x + 40, p.y + 30, { steps: 4 });
    await page.mouse.up();
    const notes = await page.evaluate(
      () =>
        (
          window as unknown as {
            __shotcandy: { app: { scene: { annotations: { anchor: string }[] } } };
          }
        ).__shotcandy.app.scene.annotations,
    );
    expect(notes).toHaveLength(1);
    expect(notes[0]!.anchor).toBe("content");
  });
});

test.describe("export", () => {
  test("a multi-screen PNG has the design's size and no placeholders", async ({ page }) => {
    await open(page);
    await loadSample(page);
    await pickLayout(page, "Side by side");
    const expected = await page.evaluate(() => {
      const app = (
        window as unknown as {
          __shotcandy: { app: { exportPlan(): { width: number; height: number } } };
        }
      ).__shotcandy.app;
      return app.exportPlan();
    });
    const box = await page.getByTestId("preview").boundingBox();
    const empty = await screenPoint(page, 1);
    const rel = { x: (empty.x - box!.x) / box!.width, y: (empty.y - box!.y) / box!.height };
    const [dl] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("export").click(),
    ]);
    const buf = readFileSync((await dl.path())!);
    expect(pngSize(buf)).toEqual({ width: expected.width, height: expected.height });
    // The empty screen isn't drawn: its middle matches the background around it.
    const [a, b] = await page.evaluate(
      async ({ data, rel }) => {
        const img = await createImageBitmap(await (await fetch(data)).blob());
        const c = new OffscreenCanvas(img.width, img.height);
        const g = c.getContext("2d")!;
        g.drawImage(img, 0, 0);
        const at = (u: number, v: number) =>
          Array.from(
            g.getImageData(Math.round(u * img.width), Math.round(v * img.height), 1, 1).data,
          );
        // The screen's middle (where a placeholder draws its plus) and a point just beside it.
        return [at(rel.x, rel.y), at(rel.x + 0.004, rel.y + 0.006)];
      },
      { data: `data:image/png;base64,${buf.toString("base64")}`, rel },
    );
    for (let k = 0; k < 3; k++) expect(Math.abs(a![k]! - b![k]!)).toBeLessThan(6);
  });
});

test.describe("batch", () => {
  test("a layout belongs to one image; All style edits change its look, not its screens", async ({
    page,
  }) => {
    await open(page);
    await threeImages(page);
    await pickLayout(page, "Side by side");
    await expect(page.getByTestId("batch-scope")).toBeVisible();
    // Under All, the tray says whose screens these are, and never shows an override mark.
    await expect(
      page.getByTestId("batch-scope").getByRole("radio", { name: "All 3" }),
    ).toBeChecked();
    await expect(page.getByTestId("screens-meta")).toHaveText("This image");
    await expect(tray(page).getByRole("heading")).toHaveAccessibleName(
      /^Screens\s*, this image only$/,
    );
    await expect(tray(page).locator(".tray-dot")).toHaveCount(0);
    await tiles(page).nth(1).click();
    expect((await design(page)).layout).toBe("single");
    await expect(tray(page).getByRole("radio", { name: "Single" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    // A style for all, from image 2.
    await page
      .getByTestId("styles-tray")
      .getByRole("button", { name: /^Midnight/ })
      .click();
    await tiles(page).nth(0).click();
    const d = await design(page);
    expect(d.layout).toBe("side-by-side");
    expect(d.style).toMatch(/midnight/);
    expect((await info(page)).custom).toEqual([]);
    // Without dragging: the screen's menu, from the keyboard, lists the other images.
    await screens(page).nth(1).focus();
    await page.keyboard.press("Shift+F10");
    await page
      .getByTestId("screen-menu")
      .getByRole("menuitem", { name: "From your images…" })
      .click();
    const pick = page.getByTestId("screen-pick");
    await expect(pick.getByRole("menuitem")).toHaveCount(2);
    await expect(pick.getByRole("menuitem").first()).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await waitScreen(page, 1);
    await expect(screens(page).nth(1)).toHaveAccessibleName(/, settings\.png$/);
    expect((await info(page)).names).toHaveLength(3);
  });

  test("drag an image from the rail onto a screen; combine into one design", async ({ page }) => {
    await open(page);
    await threeImages(page);
    await pickLayout(page, "Side by side");
    await thumbsReady(page);
    const t = (await tiles(page).nth(2).boundingBox())!;
    await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2);
    await page.mouse.down();
    const p = await screenPoint(page, 1);
    await page.mouse.move(p.x, p.y, { steps: 10 });
    await expect(page.locator(".screen-hint.strong")).toHaveText("Add here");
    await expect(page.getByTestId("batch-drop")).toHaveCount(0);
    await page.mouse.up();
    await waitScreen(page, 1);
    expect((await info(page)).names).toEqual(["home.png", "login.png", "settings.png"]);
    expect((await info(page)).active).toBe(0);
    await expect(screens(page).nth(1)).toHaveAccessibleName(/, settings\.png$/);
    expect(await undoLabel(page)).toBe("Fill screen 2");
    // Combine images 2 and 3 into one design.
    await tiles(page).nth(1).click();
    await tiles(page)
      .nth(2)
      .click({ modifiers: ["ControlOrMeta"] });
    await tiles(page).nth(2).click({ button: "right" });
    await page.getByTestId("combine").click();
    await waitForCount(page, 4);
    const b = await info(page);
    expect(b.names).toEqual(["home.png", "login.png", "settings.png", "login.png"]);
    expect(b.active).toBe(3);
    const d = await design(page);
    expect(d.layout).toBe("side-by-side");
    expect(d.screens).toHaveLength(2);
    expect(d.screens.every(Boolean)).toBe(true);
    await expect(page.getByTestId("toast")).toContainText("Combined 2 images into one design");
    expect(await undoLabel(page)).toBe("Combine 2 images");
    // Not offered for one image.
    await tiles(page).nth(0).click({ button: "right" });
    await expect(page.getByTestId("combine")).toHaveCount(0);
    await page.keyboard.press("Escape");
    // Export all: one file per design, the multi-screen ones included.
    const [dl] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("export").click(),
    ]);
    const zip = unzipSync(new Uint8Array(readFileSync((await dl.path())!)));
    expect(Object.keys(zip)).toHaveLength(4);
    const sizes = Object.values(zip).map((f) => pngSize(Buffer.from(f)));
    // The side-by-side designs are wider than they are tall.
    expect(sizes[0]!.width).toBeGreaterThan(sizes[0]!.height * 2);
    expect(sizes[3]!.width).toBeGreaterThan(sizes[3]!.height * 2);
  });

  test("keeps every screen of the design on stage fully decoded, and only near it", async ({
    page,
  }) => {
    await open(page);
    await dropFiles(
      page,
      ["a", "b", "c", "d", "e"].map((n, i) => ({ name: `${n}.png`, from: SHOTS[i] })),
    );
    await waitForCount(page, 5);
    await pickLayout(page, "Side by side");
    await dropFiles(page, [{ name: "x.png", from: SHOTS[5] }]);
    await waitScreen(page, 1);
    const stats = () =>
      page.evaluate(() =>
        (
          window as unknown as {
            __shotcandy: { app: { batch: { memoryStats(): { full: number; thumbs: number } } } };
          }
        ).__shotcandy.app.batch.memoryStats(),
      );
    // a and its second screen x, and the neighbour b.
    await expect.poll(stats, { timeout: 20_000 }).toEqual({ full: 3, thumbs: 3 });
    await tiles(page).nth(4).click();
    // d and e only: x is a thumbnail again.
    await expect.poll(stats, { timeout: 20_000 }).toEqual({ full: 2, thumbs: 4 });
    await tiles(page).nth(0).click();
    await expect.poll(stats, { timeout: 20_000 }).toEqual({ full: 3, thumbs: 3 });
  });

  test("the batch comes back after a reload with its screens", async ({ page }) => {
    await open(page);
    await threeImages(page);
    await pickLayout(page, "Overlap");
    await dropFiles(page, [{ name: "extra.png", from: SHOTS[4] }]);
    await waitScreen(page, 1);
    const before = await design(page);
    await page.waitForTimeout(900);
    await page.reload();
    await open(page);
    await waitForCount(page, 3);
    const after = await design(page);
    expect(after.layout).toBe("overlap");
    expect(after.screens).toEqual(before.screens);
    await expect(screens(page)).toHaveCount(2);
    await thumbsReady(page);
    // Both screens are loaded (the preview draws them).
    await expect
      .poll(() =>
        page.evaluate(
          (ids) =>
            ids.every((id) =>
              (
                window as unknown as { __shotcandy: { library: { has(id: string): boolean } } }
              ).__shotcandy.library.has(id!),
            ),
          after.screens,
        ),
      )
      .toBe(true);
  });
});

test.describe("phones", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("the Layout tab holds Screens; a tap on an empty screen chooses its image", async ({
    page,
  }) => {
    await open(page);
    await loadSample(page);
    await page.getByRole("tab", { name: "Layout" }).tap();
    await expect(tray(page)).toBeVisible();
    await tray(page).getByRole("radio", { name: "Side by side" }).tap();
    expect((await design(page)).layout).toBe("side-by-side");
    const p = await screenPoint(page, 1);
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.touchscreen.tap(p.x, p.y),
    ]);
    await chooser.setFiles({
      name: "phone.png",
      mimeType: "image/png",
      buffer: readFileSync(`brand/samples/${SHOTS[1]}`),
    });
    await waitScreen(page, 1);
    // A tap on a filled screen opens its menu.
    await page.touchscreen.tap(p.x, p.y);
    await expect(page.getByTestId("screen-menu")).toBeVisible();
    await expect(
      page.getByTestId("screen-menu").getByRole("menuitem", { name: /Remove from design/ }),
    ).toBeVisible();
  });
});

test.describe("accessibility", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "axe runs once, in Chromium");

  for (const scheme of ["light", "dark"] as const)
    test(`axe: Screens tray, screens on stage, menu (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await open(page);
      await loadSample(page);
      await pickLayout(page, "Cascade");
      await page.waitForTimeout(400);
      const check = async (label: string) => {
        const r = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze();
        const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
        expect(bad, `${label}: ${bad.map((v) => v.id).join(", ")}`).toEqual([]);
      };
      await check("cascade");
      await screens(page).nth(1).focus();
      await page.keyboard.press("Shift+F10");
      await expect(page.getByTestId("screen-menu")).toBeVisible();
      // Let the menu finish fading in.
      await page.waitForTimeout(400);
      await check("menu");
      await page.keyboard.press("Escape");
      await expect(screens(page).nth(1)).toBeFocused();
    });
});
