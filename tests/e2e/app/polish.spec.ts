/**
 * Regression tests from the multi-image quality pass: edge cases of batches
 * and multi-screen designs that once went wrong.
 */
import { type Page, expect, test } from "@playwright/test";
import { loadSample, open } from "./helpers";
import { SHOTS, b64, dropFiles, info, waitForCount } from "./batch-helpers";
import { design, pickLayout, screenPoint } from "./screens-helpers";

type App = {
  scene: { content: { kind: string; assetId?: string | null } };
  store: {
    getState(): { doc: { kind?: string; items?: { content: { assetId: string } }[] } };
    undo(): void;
  };
  batch: { ui: { get(): { pending: unknown[] } } };
  ui: { get(): { mode: string } };
  setMode(mode: string): void;
  loadBlob(blob: Blob, opts?: { source?: string }): Promise<boolean>;
  autosave(): Promise<void>;
  db: { assets: { get(id: string): Promise<unknown> } } | null;
  on(evt: string, fn: (arg?: unknown) => void): () => void;
};
const screens = (page: Page) => page.getByTestId("screen");

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
