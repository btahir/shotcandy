/**
 * Regression tests from the multi-image quality pass: edge cases of batches
 * and multi-screen designs that once went wrong.
 */
import { type Page, expect, test } from "@playwright/test";
import { loadSample, open } from "./helpers";
import { SHOTS, dropFiles } from "./batch-helpers";
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
