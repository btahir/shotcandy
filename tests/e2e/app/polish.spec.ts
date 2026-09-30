/**
 * Regression tests from the multi-image quality pass: edge cases of batches
 * and multi-screen designs that once went wrong.
 */
import { type Page, expect, test } from "@playwright/test";
import { loadSample, open } from "./helpers";
import { SHOTS, b64, dropFiles, info, waitForCount } from "./batch-helpers";
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
