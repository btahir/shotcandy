/**
 * App Store sets in the real app: the board, slide editing and ordering,
 * dropping screenshots, styles, and a ZIP of exact-size opaque PNGs.
 */
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { unzipSync } from "fflate";
import { PNG } from "pngjs";
import { SAMPLE, SAMPLE_B64, open } from "./helpers";

type Sets = {
  state: {
    get(): {
      set: {
        slides: { headline: string; assetId: string | null }[];
        sizePresetId: string;
        styleId?: string;
      };
      selected: number;
    };
  };
};
const state = (page: Page) =>
  page.evaluate(() =>
    (
      window as unknown as { __shotcandy: { app: { sets: Sets } } }
    ).__shotcandy.app.sets.state.get(),
  );

async function appStoreMode(page: Page) {
  await open(page);
  await page.getByRole("tab", { name: "App Store" }).click();
  await expect(page.getByTestId("board")).toBeVisible();
  await expect(page.getByTestId("slide-0")).toBeVisible();
}

test("the board shows five slides and edits the selected one", async ({ page }) => {
  await appStoreMode(page);
  await expect(page.locator("button.slide")).toHaveCount(5);
  await page.getByTestId("slide-2").click();
  await expect(page.getByTestId("slide-2")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("slide-headline").fill("Track every habit");
  expect((await state(page)).set.slides[2]!.headline).toBe("Track every habit");
  await expect(page.getByTestId("set-chip")).toContainText("1320 × 2868 · 5 slides");
});

test("slides can be added, moved, duplicated and removed (with undo)", async ({ page }) => {
  await appStoreMode(page);
  await page.getByTestId("add-slide").click();
  await expect(page.locator("button.slide")).toHaveCount(6);
  expect((await state(page)).selected).toBe(5);
  await page.getByTestId("slide-headline").fill("Last one");
  await page.getByRole("button", { name: "Move slide left" }).click();
  expect((await state(page)).set.slides[4]!.headline).toBe("Last one");
  await page.getByRole("button", { name: "Duplicate slide" }).click();
  await expect(page.locator("button.slide")).toHaveCount(7);
  await page.getByRole("button", { name: "Delete slide" }).click();
  await expect(page.locator("button.slide")).toHaveCount(6);
  await page.getByTestId("toast").getByRole("button", { name: "Undo" }).click();
  await expect(page.locator("button.slide")).toHaveCount(7);
});

test("dropping a screenshot on a slide fills it; styles apply to all slides", async ({ page }) => {
  await appStoreMode(page);
  await page.evaluate((b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], "shot.png", { type: "image/png" }));
    document
      .querySelector("[data-testid=slide-1]")!
      .dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, SAMPLE_B64);
  await expect.poll(async () => (await state(page)).set.slides[1]!.assetId).toBeTruthy();
  expect((await state(page)).set.slides[0]!.assetId).toBeNull();
  await page.getByRole("button", { name: "Grape Soda set style" }).click();
  expect((await state(page)).set.styleId).toBe("set-grape");
  // The file picker fills the selected slide too.
  await page.getByTestId("slide-3").click();
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByTestId("slide-image").click(),
  ]);
  await chooser.setFiles(SAMPLE);
  await expect.poll(async () => (await state(page)).set.slides[3]!.assetId).toBeTruthy();
});

test("exports a ZIP of exact-size PNGs without alpha", async ({ page }) => {
  await appStoreMode(page);
  await page.getByRole("radio", { name: /iPad 13/ }).click();
  // Every slide gets a screenshot (empty slides are skipped by default).
  await page.evaluate(async () => {
    const app = (
      window as unknown as {
        __shotcandy: { app: { sets: { setSlideImage(i: number, b: Blob): Promise<void> } } };
      }
    ).__shotcandy.app;
    const b = await (await fetch("/samples/sample-tablet-reader.webp")).blob();
    for (let i = 0; i < 5; i++) await app.sets.setSlideImage(i, b);
  });
  const [dl] = await Promise.all([
    page.waitForEvent("download", { timeout: 90_000 }),
    page.getByTestId("export").click(),
  ]);
  expect(dl.suggestedFilename()).toBe("shotcandy-appstore-ipad-13.zip");
  const files = unzipSync(new Uint8Array(readFileSync(await dl.path())));
  const names = Object.keys(files).sort();
  expect(names).toHaveLength(5);
  expect(names[0]).toMatch(/^shotcandy-appstore-ipad-13\/01-.*\.png$/);
  for (const n of names) {
    const png = PNG.sync.read(Buffer.from(files[n]!));
    expect([png.width, png.height, png.colorType]).toEqual([2064, 2752, 2]);
  }
  await expect(page.getByTestId("toast")).toContainText("5 slides");
});

test("the set survives a reload", async ({ page }) => {
  await appStoreMode(page);
  await page.getByTestId("slide-headline").fill("Remember me");
  await page.waitForTimeout(900);
  await page.reload();
  await page.waitForFunction(
    () => !!(window as unknown as { __shotcandy?: { ready: boolean } }).__shotcandy?.ready,
  );
  await page.getByRole("tab", { name: "App Store" }).click();
  await expect.poll(async () => (await state(page)).set.slides[0]!.headline).toBe("Remember me");
});

for (const scheme of ["light", "dark"] as const) {
  test(`App Store mode passes axe (${scheme})`, async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "axe runs once, in Chromium");
    await page.emulateMedia({ colorScheme: scheme });
    await appStoreMode(page);
    await page.waitForTimeout(600);
    const r = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(" ")}`)).toEqual([]);
  });
}
