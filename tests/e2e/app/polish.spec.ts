/**
 * Regression tests from the multi-image quality pass: edge cases of batches
 * and multi-screen designs that once went wrong.
 */
import { type Page, expect, test } from "@playwright/test";
import { holdFrames, loadSample, open, releaseFrames } from "./helpers";
import { SHOTS, b64, dropFiles, info, thumbsReady, waitForCount } from "./batch-helpers";
import { design, pickLayout, screenPoint } from "./screens-helpers";

type App = {
  scene: { content: { kind: string; assetId?: string | null }; annotations: { id: string }[] };
  store: {
    getState(): { doc: { kind?: string; items?: { content: { assetId: string } }[] } };
    undo(): void;
    select(id: string | null): void;
  };
  addAnnotation(kind: string, props?: object): string;
  batch: { ui: { get(): { pending: unknown[] } } };
  ui: { get(): { mode: string } };
  setMode(mode: string): void;
  loadBlob(blob: Blob, opts?: { source?: string }): Promise<boolean>;
  autosave(): Promise<void>;
  db: {
    assets: {
      get(id: string): Promise<unknown>;
      delete(id: string): Promise<void>;
      put(rec: unknown): Promise<void>;
    };
  } | null;
  on(evt: string, fn: (arg?: unknown) => void): () => void;
};
const screens = (page: Page) => page.getByTestId("screen");
const run = <T>(page: Page, fn: (a: App) => T) =>
  page.evaluate(
    (src) =>
      new Function("a", `return (${src})(a)`)(
        (window as unknown as { __shotcandy: { app: App } }).__shotcandy.app,
      ),
    fn.toString(),
  ) as Promise<T>;

/** Three images as a batch, in name order. */
async function three(page: Page, testId = "batch-tile") {
  await dropFiles(page, [
    { name: "a.png", from: SHOTS[0] },
    { name: "b.png", from: SHOTS[1] },
    { name: "c.png", from: SHOTS[2] },
  ]);
  await waitForCount(page, 3, testId);
}

test.describe("screen 1 always has an image", () => {
  test("no swap, key or drag moves an empty screen into screen 1", async ({ page }) => {
    await open(page);
    await loadSample(page);
    await pickLayout(page, "Side by side");
    const before = await design(page);
    expect(before.screens[0]).toBeTruthy();
    expect(before.screens[1]).toBeNull();

    // Alt+Left on the empty screen 2.
    await screens(page).nth(1).focus();
    await page.keyboard.press("Alt+ArrowLeft");
    expect((await design(page)).screens).toEqual(before.screens);
    await expect(page.getByTestId("status")).toHaveText(/Screen 1 can't be empty/);

    // The menu of screen 1 can't swap it with the empty screen 2.
    const p0 = await screenPoint(page, 0);
    await page.mouse.click(p0.x, p0.y, { button: "right" });
    const menu = page.getByTestId("screen-menu");
    await expect(menu.getByRole("menuitem", { name: /Swap with next/ })).toBeDisabled();
    await page.keyboard.press("Escape");
    // Nor can the empty screen 2's menu swap it back.
    const p1 = await screenPoint(page, 1);
    await page.mouse.click(p1.x, p1.y, { button: "right" });
    await expect(menu.getByRole("menuitem", { name: /Swap with previous/ })).toBeDisabled();
    await page.keyboard.press("Escape");

    // Dragging screen 1 onto the empty screen 2 doesn't swap.
    await page.mouse.move(p0.x, p0.y);
    await page.mouse.down();
    await page.mouse.move(p1.x, p1.y, { steps: 8 });
    await expect(page.locator(".screen-shape.target")).toHaveCount(0);
    await page.mouse.up();
    expect((await design(page)).screens).toEqual(before.screens);
    await expect(page.getByTestId("screens-tray")).toBeVisible();
  });
});

test.describe("modes during an import", () => {
  test("switching to Code mid-import leaves the code design alone", async ({ page }) => {
    await open(page);
    await dropFiles(page, [...SHOTS]);
    // Switch while the first images are still decoding.
    await page.waitForFunction(() => {
      const a = (window as unknown as { __shotcandy: { app: App } }).__shotcandy.app;
      if (a.batch.ui.get().pending.length > 0) {
        a.setMode("code");
        return true;
      }
      return false;
    });
    await expect(page.getByTestId("batch-pending")).toHaveCount(0, { timeout: 20_000 });
    await page.waitForTimeout(500);
    const code = await page.evaluate(() => {
      const a = (window as unknown as { __shotcandy: { app: App } }).__shotcandy.app;
      return { mode: a.ui.get().mode, kind: a.scene.content.kind };
    });
    expect(code).toEqual({ mode: "code", kind: "code" });
    // Back in Screenshot mode the images that made it are there.
    await page.evaluate(() =>
      (window as unknown as { __shotcandy: { app: App } }).__shotcandy.app.setMode("screenshot"),
    );
    const kind = await page.evaluate(
      () => (window as unknown as { __shotcandy: { app: App } }).__shotcandy.app.scene.content.kind,
    );
    expect(kind).toBe("image");
  });
});

test.describe("storage clean-up", () => {
  test.setTimeout(90_000);
  test("images a batch needs survive recents trimming while the batch is one undo away", async ({
    page,
  }) => {
    await open(page);
    await loadSample(page);
    // Fill Recent designs to the brim: every loaded screenshot is a new recent.
    await page.evaluate(async (data) => {
      const a = (window as unknown as { __shotcandy: { app: App } }).__shotcandy.app;
      const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
      for (let i = 0; i < 13; i++) {
        await a.loadBlob(new File([bytes], `r${i}.png`, { type: "image/png" }));
        await a.autosave();
      }
    }, b64(SHOTS[4]));
    await dropFiles(page, [
      { name: "b.png", from: SHOTS[1] },
      { name: "c.png", from: SHOTS[2] },
    ]);
    await waitForCount(page, 3);
    const ids = await page.evaluate(() => {
      const a = (window as unknown as { __shotcandy: { app: App } }).__shotcandy.app;
      return a.store.getState().doc.items!.map((x) => x.content.assetId);
    });
    // Remove two: back to one design, which autosaves as a new recent and trims the oldest.
    await page.getByTestId("batch-tile").nth(2).click();
    await page
      .getByTestId("batch-tile")
      .nth(1)
      .click({ modifiers: ["Shift"] });
    await page.keyboard.press("Delete");
    await expect(page.getByTestId("batch-rail")).toHaveCount(0);
    await page.evaluate(async () => {
      const a = (window as unknown as { __shotcandy: { app: App } }).__shotcandy.app;
      await new Promise<void>((resolve) => {
        const off = a.on("autosaved", () => {
          off();
          resolve();
        });
      });
    });
    await page.evaluate(() =>
      (window as unknown as { __shotcandy: { app: App } }).__shotcandy.app.store.undo(),
    );
    expect((await info(page)).kind).toBe("batch");
    const stored = await page.evaluate(async (list) => {
      const a = (window as unknown as { __shotcandy: { app: App } }).__shotcandy.app;
      return Promise.all(list.map(async (id) => !!(await a.db!.assets.get(id))));
    }, ids);
    expect(stored).toEqual([true, true, true]);
  });
});

test.describe("focus and keys", () => {
  test("collapsing and expanding the rail keeps the keyboard on it", async ({ page }) => {
    await open(page);
    await three(page);
    await page.getByTestId("rail-collapse").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("rail-expand")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("batch-list")).toBeFocused();
  });

  test("a late frame after collapsing or expanding the rail never takes focus back", async ({
    page,
  }) => {
    await open(page);
    await three(page);
    const stage = page.getByTestId("stage");
    // Frames late: the keyboard still lands on the new button, then back on the images.
    await page.getByTestId("rail-collapse").focus();
    await holdFrames(page);
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("rail-expand")).toBeVisible();
    await releaseFrames(page);
    await expect(page.getByTestId("rail-expand")).toBeFocused();
    await holdFrames(page);
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("batch-list")).toBeVisible();
    await releaseFrames(page);
    await expect(page.getByTestId("batch-list")).toBeFocused();
    // Gone elsewhere before the frame: focus stays there.
    await page.getByTestId("rail-collapse").focus();
    await holdFrames(page);
    await page.keyboard.press("Enter");
    await stage.focus();
    await releaseFrames(page);
    await expect(stage).toBeFocused();
    await page.getByTestId("rail-expand").focus();
    await holdFrames(page);
    await page.keyboard.press("Enter");
    await stage.focus();
    await releaseFrames(page);
    await expect(stage).toBeFocused();
  });

  test("undo that dissolves the batch puts the keyboard on the canvas", async ({ page }) => {
    await open(page);
    await loadSample(page);
    await dropFiles(page, [
      { name: "b.png", from: SHOTS[1] },
      { name: "c.png", from: SHOTS[2] },
    ]);
    await waitForCount(page, 3);
    await page.getByTestId("batch-tile").nth(1).click();
    await expect(page.getByTestId("batch-list")).toBeFocused();
    await page.keyboard.press("ControlOrMeta+z");
    await expect(page.getByTestId("batch-rail")).toHaveCount(0);
    await expect(page.getByTestId("stage")).toBeFocused();
  });

  test("with an annotation picked, Delete removes it, not the image", async ({ page }) => {
    await open(page);
    await three(page);
    await page.getByTestId("batch-tile").nth(0).click();
    await expect(page.getByTestId("batch-list")).toBeFocused();
    // Picking an annotation on the stage need not move focus off the rail.
    await run(page, (a) => a.store.select(a.addAnnotation("rect")));
    await page.keyboard.press("Delete");
    expect((await info(page)).names).toHaveLength(3);
    expect(await run(page, (a) => a.scene.annotations.length)).toBe(0);
    // Focusing the rail again lets go of an annotation.
    await run(page, (a) => a.store.select(a.addAnnotation("rect")));
    await page.getByTestId("stage").focus();
    await page.getByTestId("batch-list").focus();
    await page.keyboard.press("Delete");
    expect((await info(page)).names).toEqual(["b.png", "c.png"]);
  });

  test("a click elsewhere after the screen menu keeps its focus", async ({ page }) => {
    await open(page);
    await loadSample(page);
    await pickLayout(page, "Side by side");
    const p = await screenPoint(page, 0);
    await page.mouse.click(p.x, p.y, { button: "right" });
    await expect(page.getByTestId("screen-menu")).toBeVisible();
    const single = page.getByTestId("screens-tray").getByRole("radio", { name: "Overlap" });
    await single.click();
    await page.waitForTimeout(150);
    await expect(single).toBeFocused();
  });
});

test.describe("cancelled drags", () => {
  test("Escape during a screen drag, then letting go on an empty screen, opens nothing", async ({
    page,
  }) => {
    await open(page);
    await loadSample(page);
    await pickLayout(page, "Side by side");
    const a = await screenPoint(page, 0);
    const b = await screenPoint(page, 1);
    let chooser = false;
    page.on("filechooser", () => (chooser = true));
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 8 });
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await page.waitForTimeout(400);
    expect(chooser).toBe(false);
  });

  test("Escape during a rail drag keeps the selection", async ({ page }) => {
    await open(page);
    await three(page);
    await page.getByTestId("batch-tile").nth(0).click();
    await page
      .getByTestId("batch-tile")
      .nth(1)
      .click({ modifiers: ["Shift"] });
    expect((await info(page)).selected).toEqual([0, 1]);
    const box = (await page.getByTestId("batch-tile").nth(0).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 30, { steps: 5 });
    await page.keyboard.press("Escape");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 3 });
    await page.mouse.up();
    await page.waitForTimeout(100);
    expect((await info(page)).selected).toEqual([0, 1]);
  });

  test("a rail drag let go over the canvas doesn't reorder", async ({ page }) => {
    await open(page);
    await three(page);
    const box = (await page.getByTestId("batch-tile").nth(0).boundingBox())!;
    const stage = (await page.getByTestId("stage").boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height - 60, { steps: 10 });
    await expect(page.getByTestId("batch-drop")).toHaveCount(0);
    await page.mouse.up();
    expect((await info(page)).names).toEqual(["a.png", "b.png", "c.png"]);
    await expect(page.getByTestId("status")).toHaveText(/Move cancelled/);
  });
});

test.describe("phones", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("the strip's More menu opens above its button; a second tap closes it", async ({ page }) => {
    await open(page);
    await three(page, "batch-strip-tile");
    const btn = page.getByTestId("batch-strip-menu");
    await btn.click();
    const menu = page.getByTestId("batch-menu");
    await expect(menu).toBeVisible();
    await page.waitForTimeout(200);
    const m = (await menu.boundingBox())!;
    const b = (await btn.boundingBox())!;
    expect(m.y + m.height).toBeLessThanOrEqual(b.y);
    await btn.click();
    await expect(menu).toHaveCount(0);
  });

  test("the strip's buttons are 44 px tap targets", async ({ page }) => {
    await open(page);
    await three(page, "batch-strip-tile");
    for (const id of ["batch-select", "batch-strip-menu"]) {
      const hit = await page.getByTestId(id).evaluate((el) => {
        const r = el.getBoundingClientRect();
        const a = getComputedStyle(el, "::after");
        const t = parseFloat(a.top) || 0;
        const l = parseFloat(a.left) || 0;
        return { w: r.width - 2 * l, h: r.height - 2 * t };
      });
      expect(hit.w, id).toBeGreaterThanOrEqual(44);
      expect(hit.h, id).toBeGreaterThanOrEqual(44);
    }
  });

  test("when the share sheet needs a fresh tap, a Share button offers one", async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      const w = window as unknown as { __shares: number; __files: number };
      w.__shares = 0;
      w.__files = 0;
      Object.assign(navigator, {
        canShare: () => true,
        share: async (d: { files: File[] }) => {
          w.__shares++;
          // The first call comes long after the tap: blocked, like Safari does.
          if (w.__shares === 1) throw new DOMException("no activation", "NotAllowedError");
          w.__files = d.files.length;
        },
      });
    });
    let downloads = 0;
    page.on("download", () => downloads++);
    await three(page, "batch-strip-tile");
    await page.getByTestId("export").click();
    await page.getByTestId("m-export-all").click();
    const toast = page.getByTestId("toast").filter({ hasText: "3 images ready" });
    await expect(toast).toBeVisible({ timeout: 20_000 });
    await toast.getByRole("button", { name: "Share" }).click();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __files: number }).__files))
      .toBe(3);
    expect(downloads).toBe(0);
  });
});

test.describe("screen names", () => {
  test("a screen's file name survives a reload, and moves with its image", async ({ page }) => {
    await open(page);
    await three(page);
    await pickLayout(page, "Overlap");
    await dropFiles(page, [{ name: "extra.png", from: SHOTS[4] }]);
    await expect(screens(page).nth(1)).toHaveAccessibleName("Screen 2 of 2, extra.png");
    // Swap: screen 1's image (a.png) goes to screen 2 and keeps its name there.
    await screens(page).nth(1).focus();
    await page.keyboard.press("Alt+ArrowLeft");
    await expect(screens(page).nth(0)).toHaveAccessibleName("Screen 1 of 2, extra.png");
    await expect(screens(page).nth(1)).toHaveAccessibleName("Screen 2 of 2, a.png");
    await page.waitForTimeout(900);
    await page.reload();
    await open(page);
    await waitForCount(page, 3);
    await expect(screens(page).nth(1)).toHaveAccessibleName("Screen 2 of 2, a.png");
  });
});

test.describe("restoring a batch", () => {
  test("an image gone from storage leaves the batch with a note", async ({ page }) => {
    await open(page);
    await three(page);
    await page.waitForTimeout(900);
    await run(page, (a) => a.db!.assets.delete(a.store.getState().doc.items![2]!.content.assetId));
    await page.reload();
    await open(page);
    await waitForCount(page, 2);
    expect((await info(page)).names).toEqual(["a.png", "b.png"]);
    await expect(page.getByTestId("toast")).toContainText("1 image couldn't be brought back");
  });

  test("full storage is said in the import's summary, not silently", async ({ page }) => {
    await open(page);
    await run(page, (a) => {
      a.db!.assets.put = () => Promise.reject(new DOMException("full", "QuotaExceededError"));
    });
    await three(page);
    await expect(page.getByTestId("toast")).toContainText("Added 3 images");
    await expect(page.getByTestId("toast")).toContainText(
      "Your browser's storage is full, so they won't come back after a reload.",
    );
  });
});

const file = (name: string, from: string) => ({
  name,
  mimeType: "image/png",
  buffer: Buffer.from(b64(from), "base64"),
});

test.describe("keyboard only", () => {
  test.setTimeout(120_000);
  test("import, rail, scope, screens, combine and export all without a pointer", async ({
    page,
  }) => {
    await open(page);
    const status = page.getByTestId("status");
    // Import through the More menu.
    await page.getByRole("button", { name: "More", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("add-images")).toBeVisible();
    await page.getByTestId("add-images").focus();
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.keyboard.press("Enter"),
    ]);
    await chooser.setFiles([
      file("a.png", SHOTS[0]),
      file("b.png", SHOTS[1]),
      file("c.png", SHOTS[2]),
    ]);
    await waitForCount(page, 3);

    // The rail is reachable with Tab.
    const list = page.getByTestId("batch-list");
    await page.getByTestId("stage").focus();
    for (let i = 0; i < 40 && !(await list.evaluate((el) => el === document.activeElement)); i++)
      await page.keyboard.press("Shift+Tab");
    await expect(list).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(status).toHaveText(/Image 2 of 3, b\.png/);
    await page.keyboard.press("Alt+ArrowDown");
    expect((await info(page)).names).toEqual(["a.png", "c.png", "b.png"]);
    await page.keyboard.press("ControlOrMeta+z");
    expect((await info(page)).names).toEqual(["a.png", "b.png", "c.png"]);
    await page.keyboard.press("Delete");
    expect((await info(page)).names).toEqual(["a.png", "c.png"]);
    await expect(list).toBeFocused();
    await page.keyboard.press("ControlOrMeta+z");
    expect((await info(page)).names).toEqual(["a.png", "b.png", "c.png"]);

    // All / This image.
    const scope = page.getByTestId("batch-scope");
    await scope.getByRole("radio", { name: /All 3/ }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(scope.getByRole("radio", { name: "This image" })).toBeChecked();
    await expect(status).toHaveText(/Changes apply to this image only/);

    // Screens: pick a layout with arrows, fill the empty screen with Enter.
    const tray = page.getByTestId("screens-tray");
    await tray.getByRole("radio", { name: "Single" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(tray.getByRole("radio", { name: "Side by side" })).toBeChecked();
    const scr = page.getByTestId("screen");
    await page.getByTestId("stage").focus();
    const path: string[] = [];
    for (
      let i = 0;
      i < 4 && !(await scr.nth(1).evaluate((el) => el === document.activeElement));
      i++
    ) {
      await page.keyboard.press("Tab");
      path.push(
        await page.evaluate(() => {
          const a = document.activeElement as HTMLElement | null;
          return `${a?.tagName}.${a?.className}[${a?.getAttribute("aria-label") ?? a?.textContent?.slice(0, 20)}]`;
        }),
      );
    }
    expect(await scr.nth(1).evaluate((el) => el === document.activeElement), path.join(" > ")).toBe(
      true,
    );
    await expect(scr.nth(1)).toHaveAccessibleName(/empty/);
    const [pick] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.keyboard.press("Enter"),
    ]);
    await pick.setFiles([file("d.png", SHOTS[3])]);
    await expect(scr.nth(1)).toHaveAccessibleName("Screen 2 of 2, d.png");
    await page.keyboard.press("Alt+ArrowLeft");
    await expect(scr.nth(0)).toBeFocused();
    await expect(scr.nth(0)).toHaveAccessibleName("Screen 1 of 2, d.png");
    await scr.nth(1).focus();
    await page.keyboard.press("Delete");
    await expect(scr.nth(1)).toHaveAccessibleName(/empty/);
    await expect(scr.nth(1)).toBeFocused();

    // Combine two images from the rail menu.
    await list.focus();
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+ArrowDown");
    await page.keyboard.press("Shift+F10");
    const combine = page.getByTestId("combine");
    await expect(combine).toBeVisible();
    await combine.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("batch-tile")).toHaveCount(4);
    await expect(status).toHaveText(/Combined 2 images into one design/);
    await expect(list).toBeFocused();

    // Export all, then cancel it from the keyboard.
    await page.evaluate(() => {
      const a = (
        window as unknown as {
          __shotcandy: { app: { runPlan: (...x: unknown[]) => Promise<unknown> } };
        }
      ).__shotcandy.app;
      const orig = a.runPlan.bind(a);
      a.runPlan = async (...x: unknown[]) => {
        await new Promise((r) => setTimeout(r, 800));
        return orig(...x);
      };
    });
    await page.keyboard.press("ControlOrMeta+s");
    const cancel = page.getByTestId("cancel-batch-export");
    await expect(cancel).toBeVisible();
    await expect(status).toHaveText(/Exporting 4 images/);
    await cancel.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("toast")).toContainText("Export cancelled");
    await expect(page.locator("[data-layout=wide] [data-testid=export]")).toBeFocused();
  });

  test("a late frame never pulls focus back from where the keyboard went", async ({ page }) => {
    const hold = () => holdFrames(page);
    const release = () => releaseFrames(page);
    await open(page);
    await three(page);
    const list = page.getByTestId("batch-list");
    const combine = page.getByTestId("combine");

    // The images menu: an item reached before the menu's first frame keeps focus.
    await list.focus();
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+ArrowDown");
    await hold();
    await page.keyboard.press("Shift+F10");
    await expect(combine).toBeVisible();
    await combine.focus();
    await release();
    await expect(combine).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(list).toBeFocused();

    // Picked before that first frame: focus stays on the images once the menu has gone.
    await hold();
    await page.keyboard.press("Shift+F10");
    await expect(combine).toBeVisible();
    await combine.focus();
    await page.keyboard.press("Enter");
    await release();
    await expect(page.getByTestId("batch-tile")).toHaveCount(4);
    await expect(page.getByTestId("batch-menu")).toHaveCount(0);
    await expect(list).toBeFocused();
    // Back to a plain image, one screen.
    await page.keyboard.press("Home");
    expect(await info(page)).toMatchObject({ active: 0, selected: [0] });

    // All / This image: arrow, then leave before the next frame.
    const scope = page.getByTestId("batch-scope");
    await scope.getByRole("radio", { name: /All 4/ }).focus();
    await hold();
    await page.keyboard.press("ArrowRight");
    await expect(scope.getByRole("radio", { name: "This image" })).toBeChecked();
    const single = page.getByTestId("screens-tray").getByRole("radio", { name: "Single" });
    await single.focus();
    await release();
    await expect(single).toBeFocused();

    // Screens layouts: the same.
    await hold();
    await page.keyboard.press("ArrowRight");
    await expect(
      page.getByTestId("screens-tray").getByRole("radio", { name: "Side by side" }),
    ).toBeChecked();
    await list.focus();
    await release();
    await expect(list).toBeFocused();
  });
});

test.describe("accessibility gaps", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "axe runs once, in Chromium");
  for (const scheme of ["light", "dark"] as const)
    test(`axe: collapsed rail, export progress, image picker, combined grid (${scheme})`, async ({
      page,
    }) => {
      const { default: AxeBuilder } = await import("@axe-core/playwright");
      const check = async (label: string) => {
        const r = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze();
        const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
        expect(
          bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(" | ")}`),
          label,
        ).toEqual([]);
      };
      await page.emulateMedia({ colorScheme: scheme });
      await open(page);
      await dropFiles(page, [
        { name: "a.png", from: SHOTS[0] },
        { name: "b.png", from: SHOTS[1] },
        { name: "c.png", from: SHOTS[2] },
        { name: "d.png", from: SHOTS[3] },
      ]);
      await waitForCount(page, 4);
      await thumbsReady(page);
      // Combine all four into a grid.
      await page.getByTestId("batch-list").focus();
      await page.keyboard.press("ControlOrMeta+a");
      await page.getByTestId("batch-tile").nth(0).click({ button: "right" });
      await page.getByTestId("combine").click();
      await expect(page.getByTestId("batch-tile")).toHaveCount(5);
      await page.waitForTimeout(400);
      await check("combined grid");
      // A screen's "From your images…" list.
      await page.getByTestId("screen").nth(1).focus();
      await page.keyboard.press("Shift+F10");
      await page.getByRole("menuitem", { name: /From your images/ }).click();
      await expect(page.getByTestId("screen-pick")).toBeVisible();
      await page.waitForTimeout(400);
      await check("image picker");
      await page.keyboard.press("Escape");
      // Collapsed rail.
      await page.getByTestId("rail-collapse").click();
      await page.waitForTimeout(400);
      await check("collapsed rail");
      // Export progress.
      await page.evaluate(() => {
        const a = (
          window as unknown as {
            __shotcandy: { app: { runPlan: (...x: unknown[]) => Promise<unknown> } };
          }
        ).__shotcandy.app;
        const orig = a.runPlan.bind(a);
        a.runPlan = async (...x: unknown[]) => {
          await new Promise((r) => setTimeout(r, 1500));
          return orig(...x);
        };
      });
      await page.getByTestId("export").click();
      await expect(page.getByTestId("batch-progress")).toBeVisible();
      await page.waitForTimeout(300);
      await check("export progress");
      await page.getByTestId("cancel-batch-export").click();
    });

  test("axe: phone export sheet and Layout tab in a batch", async ({ page }) => {
    const { default: AxeBuilder } = await import("@axe-core/playwright");
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page);
    await three(page, "batch-strip-tile");
    await page.getByRole("tab", { name: /Layout/ }).click();
    await page.getByTestId("screens-tray").getByRole("radio", { name: "Fan" }).click();
    await page.waitForTimeout(400);
    let r = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    let bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(" | ")}`)).toEqual([]);
    await page.getByTestId("export").click();
    await expect(page.getByTestId("m-export-all")).toBeVisible();
    await page.waitForTimeout(400);
    r = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(" | ")}`)).toEqual([]);
  });
});

type PerfApp = {
  on(e: string, f: (x?: unknown) => void): () => void;
  batch: { memoryStats(): { full: number; thumbs: number }; step(dir: -1 | 1): void };
  screens: { setLayout(id: string): void; setCount(n: number): void };
  scene: unknown;
  runExport(format: string, scale: number, q?: number, scene?: unknown): Promise<{ width: number }>;
};

test.describe("performance at 4K", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "measured once, in Chromium");
  test.setTimeout(240_000);

  test("50 screenshots of 3840 × 2160 import and switch smoothly, memory stays flat", async ({
    page,
  }) => {
    await open(page);
    await page.evaluate(() => {
      const w = window as unknown as { __long: number[] };
      w.__long = [];
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) w.__long.push(e.duration);
      }).observe({ type: "longtask", buffered: false });
    });
    const result = await page.evaluate(async () => {
      const files: File[] = [];
      for (let i = 0; i < 50; i++) {
        const c = new OffscreenCanvas(3840, 2160);
        const g = c.getContext("2d")!;
        g.fillStyle = `hsl(${(i * 37) % 360} 60% 94%)`;
        g.fillRect(0, 0, 3840, 2160);
        g.fillStyle = `hsl(${(i * 37) % 360} 45% 35%)`;
        for (let r = 0; r < 40; r++)
          g.fillRect(160, 120 + r * 50, 2400 - ((r * 131 + i * 17) % 1400), 22);
        g.font = "bold 120px sans-serif";
        g.fillText(`Screen ${i + 1}`, 2600, 400);
        const blob = await c.convertToBlob({ type: "image/png" });
        files.push(new File([blob], `4k-${i + 1}.png`, { type: "image/png" }));
      }
      const app = (
        window as unknown as {
          __shotcandy: { app: { on(e: string, f: (x?: unknown) => void): void } };
        }
      ).__shotcandy.app;
      const done = new Promise<{ added: number; ms: number }>((res) =>
        app.on("batch-imported", (x) => res(x as { added: number; ms: number })),
      );
      const dt = new DataTransfer();
      for (const f of files) dt.items.add(f);
      (window as unknown as { __long: number[] }).__long.length = 0;
      document.body.dispatchEvent(
        new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }),
      );
      return done;
    });
    await waitForCount(page, 50);
    const long = await page.evaluate(() => (window as unknown as { __long: number[] }).__long);
    const longSum = long.reduce((a, b) => a + b, 0);
    await page.waitForTimeout(500);
    // Switching images: key press to the stage redrawn, ten times.
    const switches = await page.evaluate(async () => {
      const app = (window as unknown as { __shotcandy: { app: PerfApp } }).__shotcandy.app;
      const out: number[] = [];
      for (let i = 0; i < 10; i++) {
        const t0 = performance.now();
        const drawn = new Promise<number>((res) => {
          const off = app.on("rendered", () => {
            off();
            res(performance.now() - t0);
          });
        });
        app.batch.step(1);
        out.push(await drawn);
        await new Promise((r) => setTimeout(r, 120));
      }
      return out;
    });
    await page.waitForTimeout(800);
    const stats = await page.evaluate(() =>
      (window as unknown as { __shotcandy: { app: PerfApp } }).__shotcandy.app.batch.memoryStats(),
    );
    const sorted = switches.slice().sort((a, b) => a - b);
    console.log(
      `4K: ${result.added} images in ${result.ms} ms (${Math.round(result.ms / result.added)} ms each); long tasks ${long.length}, longest ${Math.round(Math.max(0, ...long))} ms, total ${Math.round(longSum)} ms (${Math.round((100 * longSum) / result.ms)} % of the import); switch median ${Math.round(sorted[5]!)} ms, worst ${Math.round(sorted[9]!)} ms; full decodes ${stats.full}, thumbnails ${stats.thumbs}`,
    );
    expect(result.added).toBe(50);
    expect(Math.max(0, ...long)).toBeLessThan(400);
    expect(longSum / result.ms).toBeLessThan(0.25);
    expect(stats.full).toBeLessThanOrEqual(3);
    expect(sorted[5]!).toBeLessThan(150);
  });

  test("a five-screen cascade of 4K shots: preview and 2x export time", async ({ page }) => {
    await open(page);
    await loadSample(page);
    await pickLayout(page, "Cascade");
    await page.evaluate(() =>
      (window as unknown as { __shotcandy: { app: PerfApp } }).__shotcandy.app.screens.setCount(5),
    );
    // Four 4K screenshots fill the empty screens.
    await page.evaluate(async () => {
      const dt = new DataTransfer();
      for (let i = 0; i < 4; i++) {
        const c = new OffscreenCanvas(3840, 2160);
        const g = c.getContext("2d")!;
        g.fillStyle = `hsl(${i * 70} 50% 90%)`;
        g.fillRect(0, 0, 3840, 2160);
        g.fillStyle = "#333";
        for (let r = 0; r < 30; r++) g.fillRect(200, 150 + r * 60, 3000 - r * 50, 24);
        const blob = await c.convertToBlob({ type: "image/png" });
        dt.items.add(new File([blob], `k${i}.png`, { type: "image/png" }));
      }
      document.body.dispatchEvent(
        new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }),
      );
    });
    await expect
      .poll(async () => (await design(page)).screens.filter(Boolean).length, {
        timeout: 30_000,
      })
      .toBe(5);
    await page.waitForTimeout(1000);
    const timing = await page.evaluate(async () => {
      const app = (window as unknown as { __shotcandy: { app: PerfApp } }).__shotcandy.app;
      const renders: number[] = [];
      for (let i = 0; i < 6; i++) {
        const drawn = new Promise<number>((res) => {
          const off = app.on("rendered", (ms) => {
            off();
            res(ms as number);
          });
        });
        app.screens.setLayout(i % 2 ? "cascade" : "fan");
        renders.push(await drawn);
      }
      app.screens.setLayout("cascade");
      await new Promise((r) => setTimeout(r, 300));
      const t0 = performance.now();
      const r = await app.runExport("png", 2, undefined, app.scene);
      return { renders, exportMs: performance.now() - t0, width: r.width };
    });
    const r = timing.renders.slice().sort((a, b) => a - b);
    console.log(
      `cascade x5 (4K): preview render median ${Math.round(r[3]!)} ms, worst ${Math.round(r[5]!)} ms; 2x PNG ${timing.width} px wide in ${Math.round(timing.exportMs)} ms`,
    );
    expect(r[3]!).toBeLessThan(120);
    expect(timing.exportMs).toBeLessThan(15_000);
  });
});

test.describe("modes with a batch open", () => {
  test("Code, Post and App Store leave the batch alone, and it comes back whole", async ({
    page,
  }) => {
    await open(page);
    await three(page);
    await pickLayout(page, "Overlap");
    await page.getByTestId("batch-tile").nth(1).click();
    const before = await info(page);
    const tabs = page.getByTestId("mode-switch");
    for (const mode of ["Code", "Post", "App Store"]) {
      await tabs.getByRole("tab", { name: mode }).click();
      await expect(tabs.getByRole("tab", { name: mode })).toHaveAttribute("aria-selected", "true");
      // No batch UI in other modes, and their designs aren't touched by it.
      await expect(page.getByTestId("batch-rail")).toHaveCount(0);
      await expect(page.getByTestId("batch-scope")).toHaveCount(0);
      await expect(page.getByTestId("screens-tray")).toHaveCount(0);
      await expect(page.getByTestId("export")).not.toContainText("Export all");
    }
    await tabs.getByRole("tab", { name: "Screenshot" }).click();
    await waitForCount(page, 3);
    expect(await info(page)).toEqual(before);
    await expect(page.getByTestId("export")).toContainText("Export all (3)");
    // The first image still has its layout, and undo still reaches it.
    await page.getByTestId("batch-tile").nth(0).click();
    expect((await design(page)).layout).toBe("overlap");
    await page.keyboard.press("ControlOrMeta+z");
    expect((await design(page)).layout).toBe("single");
  });
});
