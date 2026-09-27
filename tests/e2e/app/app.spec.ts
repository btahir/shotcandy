/**
 * End-to-end checks against the static build (`out/`, served by a plain file
 * server): input (file, paste, drop), export download, clipboard copy,
 * persistence across reloads, project round trip, and no network requests
 * beyond the site itself. Runs in Chromium, Firefox and WebKit.
 */
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import {
  SAMPLE_B64,
  chooseSize,
  loadSample,
  loadViaChooser,
  open,
  openMore,
  pngSize,
  previewData,
  setScale,
} from "./helpers";

test("loads with no third-party requests and no errors", async ({ page, baseURL }) => {
  const foreign: string[] = [];
  const errors: string[] = [];
  page.on("request", (r) => {
    if (
      !r.url().startsWith(baseURL!) &&
      !r.url().startsWith("data:") &&
      !r.url().startsWith("blob:")
    )
      foreign.push(r.url());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page);
  await loadSample(page);
  await page.getByRole("button", { name: /^Midnight style/ }).click();
  await page.waitForTimeout(300);
  expect(foreign).toEqual([]);
  expect(errors).toEqual([]);
});

test("imports by paste", async ({ page }) => {
  await open(page);
  await page.evaluate((b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], "shot.png", { type: "image/png" }));
    // Synthetic ClipboardEvent init data is ignored by Firefox/WebKit, so attach
    // the payload to a plain event: this still exercises the real paste handler.
    const e = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(e, "clipboardData", { value: dt });
    document.dispatchEvent(e);
  }, SAMPLE_B64);
  await expect(page.getByTestId("status")).toHaveText(/Screenshot added \(2880 × 1800\)/);
});

test("imports by drag and drop", async ({ page }) => {
  await open(page);
  await page.evaluate((b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], "shot.png", { type: "image/png" }));
    document.body.dispatchEvent(
      new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }),
    );
  }, SAMPLE_B64);
  await expect(page.getByTestId("status")).toHaveText(/Screenshot added \(2880 × 1800\)/);
});

test("rejects unsupported files with a clear message", async ({ page }) => {
  await open(page);
  await loadViaChooser(page, {
    name: "x.heic",
    mimeType: "image/heic",
    buffer: Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0, 0, 0, 0]),
  } as never);
  await expect(page.getByTestId("toast")).toContainText(/HEIC/);
  await expect(page.getByTestId("empty-state")).toBeVisible();
});

test("downloads exports at exact size and scale", async ({ page }) => {
  await open(page);
  await loadSample(page);
  await chooseSize(page, "Open Graph");
  await expect(page.getByTestId("size-tag")).toHaveText("1200 × 630");
  for (const [scale, w, h] of [
    [1, 1200, 630],
    [2, 2400, 1260],
  ] as const) {
    await setScale(page, scale);
    await expect(page.getByTestId("filename-preview")).toContainText(
      `shotcandy-${w}x${h}@${scale}x.png`,
    );
    const [dl] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("download").click(),
    ]);
    expect(dl.suggestedFilename()).toBe(`shotcandy-${w}x${h}@${scale}x.png`);
    const buf = readFileSync((await dl.path())!);
    expect(pngSize(buf)).toEqual({ width: w, height: h });
    await expect(page.getByTestId("toast")).toContainText(
      `Saved shotcandy-${w}x${h}@${scale}x.png`,
    );
  }
});

test("copies a PNG to the clipboard", async ({ page, context, browserName }) => {
  test.skip(
    browserName !== "chromium",
    "Clipboard permissions can only be granted in Chromium; Safari/Firefox are a documented manual check",
  );
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page);
  await loadSample(page);
  await chooseSize(page, "Open Graph");
  await setScale(page, 1);
  await page.keyboard.press("Escape");
  await page.getByTestId("copy").click();
  await expect(page.getByTestId("toast")).toContainText("Copied to clipboard");
  await expect(page.getByTestId("copy")).toContainText("Copied");
  const size = await page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    const blob = await item!.getType("image/png");
    const bmp = await createImageBitmap(blob);
    return { width: bmp.width, height: bmp.height, type: blob.type };
  });
  expect(size).toEqual({ width: 1200, height: 630, type: "image/png" });
});

test("recent designs are autosaved, survive a reload and render identically", async ({ page }) => {
  await open(page);
  await loadSample(page);
  await page.getByRole("button", { name: /^Midnight style/ }).click();
  await page.waitForFunction(
    () =>
      (
        window as unknown as { __shotcandy: { app: { ui: { get(): { recents: unknown[] } } } } }
      ).__shotcandy.app.ui.get().recents.length > 0,
  );
  await page.waitForTimeout(1200); // let the final debounced autosave land
  const before = await previewData(page);
  await page.reload();
  await open(page);
  await openMore(page);
  await page.getByRole("menuitem", { name: /Recent designs/ }).click();
  await page.getByRole("list", { name: "Saved designs" }).getByRole("button").first().click();
  await expect(page.getByTestId("preview")).toBeVisible();
  await page.waitForTimeout(400);
  expect(await previewData(page)).toBe(before);
});

test("project export then import restores an identical render", async ({ page }) => {
  await open(page);
  await loadSample(page);
  await page.evaluate(() =>
    (
      window as unknown as { __shotcandy: { app: { applyStyle(id: string): void } } }
    ).__shotcandy.app.applyStyle("tilted-taffy"),
  );
  await page.keyboard.press("a");
  const box = (await page.getByTestId("preview").boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.press("Escape");
  const before = await previewData(page);
  await openMore(page);
  const [dl] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: "Save project file" }).click(),
  ]);
  expect(dl.suggestedFilename()).toMatch(/\.shotcandy$/);
  const file = (await dl.path())!;
  await page.reload();
  await open(page);
  await openMore(page);
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("menuitem", { name: /Open project file/ }).click(),
  ]);
  await chooser.setFiles({
    name: "p.shotcandy",
    mimeType: "application/json",
    buffer: readFileSync(file),
  });
  await expect(page.getByTestId("toast")).toContainText("Project opened");
  await page.waitForTimeout(400);
  expect(await previewData(page)).toBe(before);
});
