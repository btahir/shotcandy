/**
 * Screen recordings in the real app: open one, trim it, turn the sound off,
 * export MP4, WebM and GIF through the Export popover, and check the files
 * with a demuxer (frame count, length, size, sound track).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ALL_FORMATS, BufferSource, EncodedPacketSink, Input } from "mediabunny";
import { expect, test, type Page } from "@playwright/test";
import { parseGif } from "../../helpers/media";
import { SAMPLE, loadViaChooser, open } from "./helpers";

const FIXTURE = (name: string) => resolve(__dirname, "../../fixtures", name);

// VP9 + Opus decode everywhere Chromium runs; Playwright's WebKit and Firefox
// builds differ in WebCodecs support, so recordings are checked in Chromium.
test.skip(({ browserName }) => browserName !== "chromium", "recordings run in Chromium");

async function loadRecording(page: Page, name = "recording.webm") {
  await loadViaChooser(page, FIXTURE(name));
  await expect(page.getByTestId("status")).toHaveText(/Recording added \(320 × 200, 2\.0s\)/);
  await expect(page.getByTestId("preview")).toBeVisible();
}

/** Drop a file on the page (works whether or not a design is open). */
async function dropFile(page: Page, file: string, type: string) {
  await page.evaluate(
    ({ b64, name, type }) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], name, { type }));
      document.body.dispatchEvent(
        new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }),
      );
    },
    { b64: readFileSync(file).toString("base64"), name: file.split("/").pop()!, type },
  );
}

async function openVideoTab(page: Page) {
  await page.getByTestId("export-options").click();
  await page.getByRole("tab", { name: "Video" }).click();
  await expect(page.getByTestId("motion-export")).toBeVisible();
}

async function probe(bytes: Buffer) {
  const input = new Input({ source: new BufferSource(bytes), formats: ALL_FORMATS });
  const video = await input.getPrimaryVideoTrack();
  const audio = await input.getPrimaryAudioTrack();
  let frames = 0;
  for await (const _ of new EncodedPacketSink(video!).packets()) frames++;
  return {
    codec: video!.codec,
    width: await video!.getDisplayWidth(),
    height: await video!.getDisplayHeight(),
    frames,
    videoDuration: await video!.computeDuration(),
    audio: audio?.codec ?? null,
  };
}

async function exportClip(page: Page, ext: string) {
  const [dl] = await Promise.all([
    page.waitForEvent("download", { timeout: 90_000 }),
    page.getByTestId("export-motion").click(),
  ]);
  expect(dl.suggestedFilename()).toMatch(new RegExp(`\\.${ext}$`));
  return readFileSync(await dl.path());
}

test("a recording lands styled, with trim, sound and a timeline", async ({ page }) => {
  await open(page);
  await loadRecording(page);
  await expect(page.getByRole("heading", { name: "Recording" })).toBeVisible();
  await expect(page.getByTestId("clip-controls")).toBeVisible();
  await expect(page.getByTestId("timeline")).toBeVisible();
  await expect(page.getByTestId("scrubber")).toHaveAttribute("aria-valuemax", /^2(\.0+)?/);
  await expect(page.getByRole("switch", { name: "Sound" })).toBeChecked();
  await expect(page.getByRole("button", { name: /^No motion/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // Recordings export as video by default.
  await expect(page.getByTestId("export")).toContainText("MP4");

  // Scrubbing shows the recording's own frames.
  const preview = () =>
    page.evaluate(() =>
      (document.querySelector("[data-testid=preview]") as HTMLCanvasElement).toDataURL(),
    );
  await page.getByTestId("scrubber").press("Home");
  await page.waitForTimeout(600);
  const start = await preview();
  await page.getByTestId("scrubber").press("End");
  await expect.poll(preview, { timeout: 5000 }).not.toBe(start);

  // Trimming shortens the timeline.
  const startSlider = page.getByRole("slider", { name: "Start" });
  await startSlider.focus();
  await startSlider.press("Shift+ArrowRight");
  await expect(page.getByTestId("scrubber")).toHaveAttribute("aria-valuemax", /^1\.0/);
});

test("exports a trimmed MP4 with the recording's sound", async ({ page }) => {
  await open(page);
  await loadRecording(page);
  const startSlider = page.getByRole("slider", { name: "Start" });
  await startSlider.focus();
  await startSlider.press("Shift+ArrowRight");
  await openVideoTab(page);
  await page.getByRole("radio", { name: "720p" }).click();
  await expect(page.getByTestId("motion-summary")).toContainText("1.0 s · 30 frames");
  const info = await probe(await exportClip(page, "mp4"));
  expect(info.codec).toBe("avc");
  expect(info.height).toBe(720);
  expect(info.frames).toBe(30);
  expect(info.videoDuration).toBeCloseTo(1, 1);
  // Opus from the WebM recording is copied into the MP4 untouched.
  expect(info.audio).toBe("opus");
  await expect(page.getByTestId("toast")).toContainText(/Saved .*\.mp4/);
});

test("exports WebM without sound when the sound is off", async ({ page }) => {
  await open(page);
  await loadRecording(page);
  await page.getByRole("switch", { name: "Sound" }).click();
  await expect(page.getByRole("switch", { name: "Sound" })).not.toBeChecked();
  await openVideoTab(page);
  await page.getByRole("radio", { name: "WebM" }).click();
  await page.getByRole("radio", { name: "720p" }).click();
  const info = await probe(await exportClip(page, "webm"));
  expect(info.codec).toBe("vp9");
  expect(info.frames).toBe(60);
  expect(info.audio).toBeNull();
});

test("exports a recording as a GIF, with motion on top", async ({ page }) => {
  await open(page);
  await loadRecording(page);
  await page.getByRole("button", { name: /^Float motion/ }).click();
  await expect(page.getByRole("slider", { name: "Motion length" })).toBeVisible();
  await openVideoTab(page);
  await page.getByRole("radio", { name: "GIF", exact: true }).click();
  await page.getByRole("radio", { name: "S", exact: true }).click();
  await page.getByRole("radio", { name: "10", exact: true }).click();
  const gif = parseGif(await exportClip(page, "gif"));
  expect(gif.trailer).toBe(true);
  expect(gif.width).toBe(480);
  expect(gif.frames).toBe(20);
  expect(gif.delays.reduce((a, b) => a + b, 0)).toBe(200);
});

test("a screenshot after a recording drops the recording's timeline", async ({ page }) => {
  await open(page);
  await loadRecording(page);
  await expect(page.getByTestId("timeline")).toBeVisible();
  await dropFile(page, SAMPLE, "image/png");
  await expect(page.getByTestId("status")).toHaveText(/Screenshot added \(2880 × 1800\)/);
  await expect(page.getByTestId("timeline")).toHaveCount(0);
  await expect(page.getByTestId("export")).toContainText("PNG");
});

test("MP4 and MOV recordings open by drop too", async ({ page }) => {
  await open(page);
  for (const [name, type] of [
    ["recording.mp4", "video/mp4"],
    ["recording.mov", "video/quicktime"],
  ] as const) {
    await dropFile(page, FIXTURE(name), type);
    // H.264 decoding depends on the Chromium build: open it, or say why not.
    await expect(page.getByTestId("status")).toHaveText(
      /Recording added \(320 × 200, 2\.0s\)|can't play H\.264/,
    );
    await page.getByTestId("status").evaluate((el) => (el.textContent = ""));
  }
});

test("a still export of a trimmed recording shows the frame at the trim start", async ({
  page,
}) => {
  await open(page);
  await loadRecording(page);
  const startSlider = page.getByRole("slider", { name: "Start" });
  await startSlider.focus();
  await startSlider.press("Shift+ArrowRight");
  const still = async () => {
    await page.getByTestId("export-options").click();
    await page
      .getByRole("tablist", { name: "Export type" })
      .getByRole("tab", { name: "Image" })
      .click();
    const [dl] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("download").click(),
    ]);
    expect(dl.suggestedFilename()).toMatch(/\.png$/);
    const buf = readFileSync((await dl.path())!);
    await page.keyboard.press("Escape");
    return buf;
  };
  const trimmed = await still();
  await startSlider.focus();
  await startSlider.press("Home");
  const untrimmed = await still();
  expect(trimmed.equals(untrimmed)).toBe(false);
});
