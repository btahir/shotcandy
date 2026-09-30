/**
 * Batches: several screenshots, one style with exceptions, Export all.
 * Single-image use must stay exactly as it was (no rail, same flows).
 */
import { readFileSync } from "node:fs";
import { type Page, expect, test } from "@playwright/test";
import { loadSample, open, openMore } from "./helpers";
import {
  SHOTS,
  dropFiles,
  info,
  pasteFiles,
  thumbsReady,
  tiles,
  waitForCount,
} from "./batch-helpers";

const SHOT_DIR = process.env.BATCH_SHOTS;

/** Three differently named copies of the samples, dropped in a scrambled order. */
async function dropThree(page: Page, testId = "batch-tile") {
  await dropFiles(page, [
    { name: "shot-10.png", from: SHOTS[2] },
    { name: "shot-2.png", from: SHOTS[1] },
    { name: "shot-1.png", from: SHOTS[0] },
  ]);
  await waitForCount(page, 3, testId);
}

test.describe("single image stays as it was", () => {
  test("no rail, one-file drop and paste replace the image", async ({ page }) => {
    await open(page);
    await loadSample(page);
    await expect(page.getByTestId("batch-rail")).toHaveCount(0);
    await expect(page.getByTestId("batch-scope")).toHaveCount(0);
    await expect(page.locator(".app[data-layout=wide]")).not.toHaveAttribute("data-batch", "");
    await expect(page.getByTestId("export")).toHaveText(/^\s*Export\s/);
    await dropFiles(page, [SHOTS[1]]);
    await expect(page.getByTestId("status")).toHaveText(/Screenshot added \(/);
    await pasteFiles(page, [SHOTS[2]]);
    await expect(page.getByTestId("status")).toHaveText(/Screenshot added \(/);
    expect((await info(page)).kind).toBe("single");
    await expect(page.getByTestId("batch-rail")).toHaveCount(0);
  });
});

test.describe("import", () => {
  test("several files on an empty editor make a batch, in name order", async ({ page }) => {
    await open(page);
    await dropThree(page);
    const b = await info(page);
    expect(b.names).toEqual(["shot-1.png", "shot-2.png", "shot-10.png"]);
    expect(b.active).toBe(0);
    await expect(page.getByTestId("batch-rail")).toBeVisible();
    await expect(page.getByTestId("toast")).toContainText("Added 3 images");
    await thumbsReady(page);
    // No recent design per image.
    await page.waitForTimeout(1300);
    const recents = await page.evaluate(
      () =>
        (
          window as unknown as {
            __shotcandy: { app: { ui: { get(): { recents: unknown[] } } } };
          }
        ).__shotcandy.app.ui.get().recents.length,
    );
    expect(recents).toBe(0);
  });

  test("a single design keeps its image and grows into a batch; skips junk and duplicates", async ({
    page,
  }) => {
    await open(page);
    await loadSample(page);
    await dropFiles(page, [
      { name: "b.png", from: SHOTS[1] },
      { name: "notes.txt", text: "hello" },
      { name: "again.png", from: SHOTS[0] },
      { name: "c.png", from: SHOTS[2] },
    ]);
    await waitForCount(page, 3);
    const b = await info(page);
    expect(b.names.slice(1)).toEqual(["b.png", "c.png"]);
    expect(b.active).toBe(0);
    const toast = page.getByTestId("toast");
    await expect(toast).toContainText("Added 2 images");
    await expect(toast).toContainText("1 not an image");
    await expect(toast).toContainText("1 already added");
    // Undo takes it back to the single design, sidebar gone.
    await toast.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByTestId("batch-rail")).toHaveCount(0);
    expect((await info(page)).kind).toBe("single");
    await expect(page.getByTestId("preview")).toBeVisible();
  });

  test("paste of several images and Add images from the More menu add to the batch", async ({
    page,
  }) => {
    await open(page);
    await loadSample(page);
    await pasteFiles(page, [
      { name: "p1.png", from: SHOTS[3] },
      { name: "p2.png", from: SHOTS[4] },
    ]);
    await waitForCount(page, 3);
    // In a batch a single pasted image joins too (and comes on stage).
    await pasteFiles(page, [{ name: "p3.png", from: SHOTS[5] }]);
    await waitForCount(page, 4);
    expect((await info(page)).active).toBe(3);
    await openMore(page);
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByTestId("add-images").click(),
    ]);
    expect(chooser.isMultiple()).toBe(true);
    await chooser.setFiles([
      { name: "q.png", mimeType: "image/png", buffer: readFileSync(`brand/samples/${SHOTS[6]}`) },
    ]);
    await waitForCount(page, 5);
  });

  test("keeps the full decode only near the image on stage", async ({ page }) => {
    await open(page);
    await dropFiles(
      page,
      SHOTS.map((s, i) => ({ name: `m${i}.png`, from: s })),
    );
    await waitForCount(page, 8);
    await page.waitForTimeout(400);
    const stats = await page.evaluate(() =>
      (
        window as unknown as {
          __shotcandy: { app: { batch: { memoryStats(): { full: number; thumbs: number } } } };
        }
      ).__shotcandy.app.batch.memoryStats(),
    );
    expect(stats.full).toBeLessThanOrEqual(3);
    expect(stats.full + stats.thumbs).toBeGreaterThanOrEqual(7);
  });
});

test.describe("sidebar", () => {
  test("select, multi-select, reorder by keys and menu, remove and undo", async ({ page }) => {
    await open(page);
    await dropFiles(
      page,
      ["a", "b", "c", "d", "e"].map((n, i) => ({ name: `${n}.png`, from: SHOTS[i] })),
    );
    await waitForCount(page, 5);
    await tiles(page).nth(1).click();
    expect((await info(page)).active).toBe(1);
    await expect(page.getByTestId("status")).toHaveText(/Image 2 of 5, b\.png/);
    await tiles(page)
      .nth(3)
      .click({ modifiers: ["ControlOrMeta"] });
    expect((await info(page)).selected).toEqual([1, 3]);
    await tiles(page)
      .nth(4)
      .click({ modifiers: ["Shift"] });
    expect((await info(page)).selected).toEqual([3, 4]);
    // Keys act on the rail only while it has focus.
    const list = page.getByTestId("batch-list");
    await list.focus();
    await page.keyboard.press("ControlOrMeta+a");
    expect((await info(page)).selected).toEqual([0, 1, 2, 3, 4]);
    await page.keyboard.press("Escape");
    await page.keyboard.press("ArrowUp");
    expect((await info(page)).active).toBe(3);
    await page.keyboard.press("Alt+ArrowUp");
    expect((await info(page)).names).toEqual(["a.png", "b.png", "d.png", "c.png", "e.png"]);
    await expect(page.getByTestId("status")).toHaveText(/position 3 of 5/);
    // Menu: move down (back), duplicate, remove.
    await tiles(page).nth(2).click({ button: "right" });
    await page.getByRole("menuitem", { name: /Move down/ }).click();
    expect((await info(page)).names).toEqual(["a.png", "b.png", "c.png", "d.png", "e.png"]);
    await list.focus();
    await page.keyboard.press("Delete");
    expect((await info(page)).names).toEqual(["a.png", "b.png", "c.png", "e.png"]);
    await expect(page.getByTestId("toast")).toContainText("Removed d.png");
    await page.keyboard.press("ControlOrMeta+z");
    expect((await info(page)).names).toHaveLength(5);
    // Delete on the canvas never removes images (it deletes annotations there).
    await page.getByTestId("stage").focus();
    await page.keyboard.press("Delete");
    expect((await info(page)).names).toHaveLength(5);
  });

  test("drag to reorder shows a drop line and moves the image", async ({ page }) => {
    await open(page);
    await dropFiles(
      page,
      ["a", "b", "c", "d"].map((n, i) => ({ name: `${n}.png`, from: SHOTS[i] })),
    );
    await waitForCount(page, 4);
    await thumbsReady(page);
    const from = (await tiles(page).nth(0).boundingBox())!;
    const to = (await tiles(page).nth(2).boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + 20, { steps: 4 });
    await page.mouse.move(to.x + to.width / 2, to.y + to.height * 0.8, { steps: 8 });
    await expect(page.getByTestId("batch-drop")).toBeVisible();
    if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/rail-drag.png` });
    await page.mouse.up();
    expect((await info(page)).names).toEqual(["b.png", "c.png", "a.png", "d.png"]);
    await page.keyboard.press("ControlOrMeta+z");
    expect((await info(page)).names).toEqual(["a.png", "b.png", "c.png", "d.png"]);
  });

  test("removing down to one image hides the sidebar", async ({ page }) => {
    await open(page);
    await dropFiles(page, [
      { name: "a.png", from: SHOTS[0] },
      { name: "b.png", from: SHOTS[1] },
    ]);
    await waitForCount(page, 2);
    await tiles(page).nth(1).click({ button: "right" });
    await page.getByRole("menuitem", { name: /^Remove/ }).click();
    await expect(page.getByTestId("batch-rail")).toHaveCount(0);
    expect((await info(page)).kind).toBe("single");
    await expect(page.getByTestId("preview")).toBeVisible();
    await expect(page.getByTestId("export")).not.toContainText("Export all");
  });
});

test.describe("one style, with exceptions", () => {
  test("All vs This image, the override dot, and Reset", async ({ page }) => {
    await open(page);
    await dropThree(page);
    const scope = page.getByTestId("batch-scope");
    await expect(scope.getByRole("radio", { name: "All 3" })).toBeChecked();
    // This image: only the image on stage changes, and it gets a dot.
    await scope.getByRole("radio", { name: "This image" }).click();
    await page.getByRole("radio", { name: "Browser" }).click();
    expect((await info(page)).custom).toEqual([0]);
    await expect(tiles(page).nth(0).getByTestId("batch-dot")).toBeVisible();
    await expect(page.locator("#t-frame .tray-dot")).toBeVisible();
    // Picking another image snaps back to All.
    await tiles(page).nth(1).click();
    await expect(scope.getByRole("radio", { name: "All 3" })).toBeChecked();
    await expect(page.getByTestId("batch-custom-note")).toContainText(
      "1 image has its own changes",
    );
    // All: every other image follows; the custom one keeps its frame.
    await page.getByRole("radio", { name: "Phone" }).click();
    const frames = await page.evaluate(() => {
      const d = (
        window as unknown as {
          __shotcandy: {
            app: {
              store: { getState(): { doc: { shared: { card: { frame: { id: string } } } } } };
              batch: { scenes(): { scene: { card: { frame: { id: string } } } }[] };
            };
          };
        }
      ).__shotcandy.app;
      return d.batch.scenes().map((x) => x.scene.card.frame.id);
    });
    expect(frames).toEqual(["browser", "phone", "phone"]);
    // Reset the group on the custom image.
    await tiles(page).nth(0).click();
    await page.getByTestId("reset-frame").click();
    expect((await info(page)).custom).toEqual([]);
    await expect(tiles(page).nth(0).getByTestId("batch-dot")).toHaveCount(0);
    await expect(page.getByTestId("toast")).toContainText("Frame matches all images again");
  });

  test("Use this style for all names the count and undoes in one step", async ({ page }) => {
    await open(page);
    await dropThree(page);
    const scope = page.getByTestId("batch-scope");
    await tiles(page).nth(2).click();
    await scope.getByRole("radio", { name: "This image" }).click();
    await page.getByRole("button", { name: /^Midnight Spotlight style/ }).click();
    await tiles(page).nth(1).click();
    await scope.getByRole("radio", { name: "This image" }).click();
    await page.getByRole("radio", { name: "Browser" }).click();
    expect((await info(page)).custom).toEqual([1, 2]);
    await tiles(page).nth(2).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Use this style for all" }).click();
    await expect(page.getByTestId("toast")).toContainText("Used this style for all 3 images");
    await expect(page.getByTestId("toast")).toContainText("1 image keeps its own changes");
    expect((await info(page)).custom).toEqual([1]);
    const style = () =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              __shotcandy: {
                app: {
                  store: { getState(): { doc: { shared: { meta: { stylePresetId: string } } } } };
                };
              };
            }
          ).__shotcandy.app.store.getState().doc.shared.meta.stylePresetId,
      );
    expect(await style()).toBe("midnight");
    await page.getByTestId("toast").getByRole("button", { name: "Undo" }).click();
    expect(await style()).not.toBe("midnight");
    expect((await info(page)).custom).toEqual([1, 2]);
  });
});

test.describe("persistence", () => {
  test("the batch survives a reload, recents stay single designs", async ({ page }) => {
    await open(page);
    await dropThree(page);
    await page.getByTestId("batch-scope").getByRole("radio", { name: "This image" }).click();
    await page.getByRole("radio", { name: "Browser" }).click();
    await tiles(page).nth(1).click();
    await page.waitForTimeout(900);
    await page.reload();
    await open(page);
    await waitForCount(page, 3);
    const b = await info(page);
    expect(b.names).toEqual(["shot-1.png", "shot-2.png", "shot-10.png"]);
    expect(b.active).toBe(1);
    expect(b.custom).toEqual([0]);
    await thumbsReady(page);
    await expect(page.getByTestId("preview")).toBeVisible();
  });

  test("a project file saves and reopens the whole batch", async ({ page }) => {
    await open(page);
    await dropThree(page);
    await openMore(page);
    const [dl] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("menuitem", { name: "Save project file" }).click(),
    ]);
    expect(dl.suggestedFilename()).toBe("shotcandy-3-images.shotcandy");
    const text = readFileSync((await dl.path())!, "utf8");
    const json = JSON.parse(text) as { formatVersion: number; batch: { items: unknown[] } };
    expect(json.formatVersion).toBe(2);
    expect(json.batch.items).toHaveLength(3);
    // Reopen in a fresh editor.
    await page.evaluate(() => indexedDB.deleteDatabase("shotcandy"));
    await page.reload();
    await open(page);
    await openMore(page);
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByRole("menuitem", { name: "Open project file…" }).click(),
    ]);
    await chooser.setFiles({
      name: "p.shotcandy",
      mimeType: "application/json",
      buffer: Buffer.from(text),
    });
    await waitForCount(page, 3);
    expect((await info(page)).names).toEqual(["shot-1.png", "shot-2.png", "shot-10.png"]);
  });
});

test.describe("phones", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("a strip above the sheet: tap, Select, Move right", async ({ page }) => {
    await open(page);
    await dropThree(page, "batch-strip-tile");
    const strip = page.getByTestId("batch-strip");
    await expect(strip).toBeVisible();
    await expect(page.getByTestId("batch-strip-tile")).toHaveCount(3);
    await page.getByTestId("batch-strip-tile").nth(1).click();
    expect((await info(page)).active).toBe(1);
    await page.getByTestId("batch-strip-menu").click();
    await page.getByRole("menuitem", { name: /Move right/ }).click();
    expect((await info(page)).names).toEqual(["shot-1.png", "shot-10.png", "shot-2.png"]);
    await page.getByTestId("batch-select").click();
    await page.getByTestId("batch-strip-tile").nth(0).click();
    expect((await info(page)).selected).toEqual([0, 2]);
    await page.getByTestId("batch-select").click();
    expect((await info(page)).selected).toHaveLength(1);
  });
});

type AppHandle = {
  __shotcandy: {
    app: {
      runPlan: (...a: unknown[]) => Promise<unknown>;
      on(evt: string, fn: (arg?: unknown) => void): () => void;
    };
  };
};

test.describe("performance", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "measured once, in Chromium");

  test("importing keeps the page responsive (decoding runs in a worker)", async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      const w = window as unknown as { __long: number[] };
      w.__long = [];
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) w.__long.push(e.duration);
      }).observe({ type: "longtask", buffered: false });
    });
    const done = page.evaluate(
      () =>
        new Promise<{ added: number; ms: number }>((res) =>
          (window as unknown as AppHandle).__shotcandy.app.on("batch-imported", (x) =>
            res(x as { added: number; ms: number }),
          ),
        ),
    );
    await dropFiles(
      page,
      [...SHOTS, ...SHOTS].map((s, i) => ({ name: `p${String(i).padStart(2, "0")}.png`, from: s })),
    );
    const r = await done;
    const long = await page.evaluate(() => (window as unknown as { __long: number[] }).__long);
    const worker = await page.evaluate(() => {
      const d = (
        window as unknown as {
          __shotcandy: {
            app: { batch: { decoder: { usesWorker: boolean; mainThreadMs: number } } };
          };
        }
      ).__shotcandy.app.batch.decoder;
      return { usesWorker: d.usesWorker, mainThreadMs: d.mainThreadMs };
    });
    console.log(
      `import: ${r.added} images in ${r.ms} ms; worker ${worker.usesWorker}; main-thread decode ${Math.round(worker.mainThreadMs)} ms; long tasks ${long.length}, longest ${Math.round(Math.max(0, ...long))} ms`,
    );
    expect(r.added).toBe(8); // the second copies are duplicates
    expect(worker.usesWorker).toBe(true);
    expect(Math.max(0, ...long)).toBeLessThan(400);
  });
});
