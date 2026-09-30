import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Page } from "@playwright/test";

export const SAMPLE = resolve(__dirname, "../../../brand/samples/sample-dashboard-light.png");
export const SAMPLE_B64 = readFileSync(SAMPLE).toString("base64");

/** Open the editor and wait until storage is ready. */
export async function open(page: Page, path = "/") {
  await page.goto(path);
  // Wait for hydration first: the prerendered HTML carries both layouts.
  await page.waitForFunction(
    () => !!(window as unknown as { __shotcandy?: { ready: boolean } }).__shotcandy?.ready,
  );
  await expect(page.getByTestId("stage")).toBeVisible();
}

/** Load the sample through the real "Choose file" button. */
export async function loadViaChooser(
  page: Page,
  file: string | Parameters<Page["setInputFiles"]>[1] = SAMPLE,
) {
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page
      .getByRole("button", { name: /Choose (file|a screenshot)/ })
      .first()
      .click(),
  ]);
  await chooser.setFiles(file as string);
}

export async function loadSample(page: Page) {
  await loadViaChooser(page);
  await expect(page.getByTestId("status")).toHaveText(/Screenshot added \(2880 × 1800\)/);
  await expect(page.getByTestId("preview")).toBeVisible();
}

/** The preview canvas as a data URL, after the next frames settle. */
export const previewData = (page: Page) =>
  page.evaluate(async () => {
    for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r));
    return (document.querySelector("[data-testid=preview]") as HTMLCanvasElement).toDataURL();
  });

export function pngSize(buf: Buffer) {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

export async function chooseSize(page: Page, label: string) {
  await page.getByTestId("size-chip").click();
  await page
    .getByRole("dialog", { name: "Canvas size" })
    .getByRole("radio", { name: new RegExp(`^${label}`) })
    .first()
    .click();
}

export async function setScale(page: Page, scale: number) {
  await page.getByTestId("export-options").click();
  await page.getByRole("radio", { name: `${scale}×`, exact: true }).click();
}

export async function openMore(page: Page) {
  await page.getByRole("button", { name: "More", exact: true }).click();
}

type Held = {
  requestAnimationFrame: (cb: FrameRequestCallback) => number;
  cancelAnimationFrame: (id: number) => void;
  __held: Map<number, FrameRequestCallback>;
  __raf: (cb: FrameRequestCallback) => number;
  __caf: (id: number) => void;
};

/** Hold animation frames back, as a busy main thread does (see releaseFrames). */
export function holdFrames(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as Held;
    let id = 1e6;
    w.__held = new Map();
    w.__raf = w.requestAnimationFrame;
    w.__caf = w.cancelAnimationFrame;
    w.requestAnimationFrame = (cb) => (w.__held.set(++id, cb), id);
    w.cancelAnimationFrame = (h) => void (w.__held.delete(h) || w.__caf.call(window, h));
  });
}

/** Let the held frames run, in order, and go back to real ones. */
export function releaseFrames(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as Held;
    w.requestAnimationFrame = w.__raf;
    w.cancelAnimationFrame = w.__caf;
    const due = [...w.__held.values()];
    w.__held.clear();
    for (const cb of due) cb(performance.now());
  });
}
