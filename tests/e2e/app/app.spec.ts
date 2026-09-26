/**
 * End-to-end checks against the static build (`out/`, served by a plain file
 * server): input (file, paste, drop), export download, clipboard copy,
 * persistence across reloads, project round trip, and no network requests
 * beyond the site itself. Written against the minimal engine shell; the UI
 * builder should keep these flows passing as the real UI replaces the shell.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const SAMPLE = resolve(__dirname, "../../../brand/samples/sample-dashboard-light.png");
const SAMPLE_B64 = readFileSync(SAMPLE).toString("base64");

async function open(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("preview")).toBeVisible();
  await page.waitForFunction(
    () => !!(window as unknown as { __shotcandy?: { db: unknown } }).__shotcandy?.db,
  );
}

async function loadViaInput(page: Page) {
  await page.getByLabel("Screenshot", { exact: true }).setInputFiles(SAMPLE);
  await expect(page.getByTestId("status")).toHaveText(/Loaded 2880×1800/);
}

const previewData = (page: Page) =>
  page.evaluate(async () => {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return (document.querySelector("[data-testid=preview]") as HTMLCanvasElement).toDataURL();
  });

function pngSize(buf: Buffer) {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

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
  await loadViaInput(page);
  await page.getByLabel("Style preset", { exact: true }).selectOption("sherbet");
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
  await expect(page.getByTestId("status")).toHaveText(/Loaded 2880×1800/);
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
  await expect(page.getByTestId("status")).toHaveText(/Loaded 2880×1800/);
});

test("rejects unsupported files with a clear message", async ({ page }) => {
  await open(page);
  await page.getByLabel("Screenshot", { exact: true }).setInputFiles({
    name: "x.heic",
    mimeType: "image/heic",
    buffer: Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0, 0, 0, 0]),
  });
  await expect(page.getByTestId("status")).toHaveText(/HEIC/);
});

test("downloads exports at exact size and scale", async ({ page }) => {
  await open(page);
  await loadViaInput(page);
  await page.getByLabel("Size", { exact: true }).selectOption("og");
  for (const [scale, w, h] of [
    [1, 1200, 630],
    [2, 2400, 1260],
  ] as const) {
    await page.getByLabel("Scale", { exact: true }).selectOption(String(scale));
    const [dl] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Download" }).click(),
    ]);
    expect(dl.suggestedFilename()).toBe(`shotcandy-${w}x${h}@${scale}x.png`);
    const buf = readFileSync((await dl.path())!);
    expect(pngSize(buf)).toEqual({ width: w, height: h });
  }
});

test("copies a PNG to the clipboard", async ({ page, context, browserName }) => {
  test.skip(
    browserName !== "chromium",
    "Clipboard permissions can only be granted in Chromium; Safari/Firefox are a documented manual check",
  );
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page);
  await loadViaInput(page);
  await page.getByLabel("Size", { exact: true }).selectOption("og");
  await page.getByLabel("Scale", { exact: true }).selectOption("1");
  await page.getByRole("button", { name: "Copy" }).click();
  await expect(page.getByTestId("status")).toHaveText(/Copied PNG/);
  const size = await page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    const blob = await item!.getType("image/png");
    const bmp = await createImageBitmap(blob);
    return { width: bmp.width, height: bmp.height, type: blob.type };
  });
  expect(size).toEqual({ width: 1200, height: 630, type: "image/png" });
});

test("saved designs survive a reload and render identically", async ({ page }) => {
  await open(page);
  await loadViaInput(page);
  await page.getByLabel("Style preset", { exact: true }).selectOption("midnight");
  const before = await previewData(page);
  await page.getByRole("button", { name: "Save design" }).click();
  await expect(page.getByTestId("status")).toHaveText("Design saved");
  await page.reload();
  await open(page);
  await page.getByRole("list", { name: "Saved designs" }).getByRole("button").first().click();
  await page.waitForTimeout(300);
  expect(await previewData(page)).toBe(before);
});

test("project export then import restores an identical render", async ({ page }) => {
  await open(page);
  await loadViaInput(page);
  await page.getByLabel("Style preset", { exact: true }).selectOption("tilted-taffy");
  await page.getByRole("button", { name: "+ Arrow" }).click();
  const before = await previewData(page);
  const [dl] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Save .shotcandy" }).click(),
  ]);
  const file = (await dl.path())!;
  await page.reload();
  await open(page);
  await page.getByLabel("Open .shotcandy", { exact: true }).setInputFiles({
    name: "p.shotcandy",
    mimeType: "application/json",
    buffer: readFileSync(file),
  });
  await expect(page.getByTestId("status")).toHaveText("Project loaded");
  expect(await previewData(page)).toBe(before);
});
