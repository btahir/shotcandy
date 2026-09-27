/**
 * UI flows of the real editor: empty state and samples, sizes, styles and the
 * Candy Jar, custom presets, annotations, shortcuts, theme, moments, errors,
 * the narrow layout, tool-page handoff and a 4K interaction budget.
 */
import { expect, test } from "@playwright/test";
import type { EditorApp } from "../../../src/components/editor/app";
import { SAMPLE, chooseSize, loadSample, open, previewData } from "./helpers";

type W = { __shotcandy: { app: EditorApp } };

test("empty state offers paste, choose and samples; a sample lands with the default style", async ({
  page,
}) => {
  await open(page);
  const card = page.getByTestId("empty-state");
  await expect(card.getByRole("heading", { name: "Paste a screenshot" })).toBeVisible();
  await expect(page.getByTestId("copy")).toBeDisabled();
  await expect(page.getByTestId("export")).toBeDisabled();
  await card.getByRole("button", { name: "Try the dashboard sample" }).click();
  await expect(page.getByTestId("preview")).toBeVisible();
  await expect(page.getByTestId("status")).toHaveText(/Screenshot added.*Style: Sherbet/);
  await expect(page.getByTestId("dock")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Sherbet style/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("drag-over shows the veil and invalid types are called out", async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(8)], "a.png", { type: "image/png" }));
    window.dispatchEvent(new DragEvent("dragenter", { dataTransfer: dt, bubbles: true }));
  });
  await expect(page.getByTestId("drop-veil")).toContainText("Drop to sweeten it");
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(8)], "a.png", { type: "image/png" }));
    window.dispatchEvent(new DragEvent("dragleave", { dataTransfer: dt, bubbles: true }));
    const bad = new DataTransfer();
    bad.items.add(new File(["x"], "a.pdf", { type: "application/pdf" }));
    window.dispatchEvent(new DragEvent("dragenter", { dataTransfer: bad, bubbles: true }));
  });
  await expect(page.getByTestId("drop-veil")).toContainText("PNG, JPEG or WebP, please");
});

test("size presets, styles and inspector controls update the preview live", async ({ page }) => {
  await open(page);
  await loadSample(page);
  const a = await previewData(page);
  await chooseSize(page, "Instagram story");
  await expect(page.getByTestId("size-tag")).toHaveText("1080 × 1920");
  await page.getByRole("button", { name: /^Grape Isometric style/ }).click();
  await expect(page.getByRole("button", { name: /^Grape Isometric style/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // Padding slider via keyboard.
  const pad = page.getByRole("slider", { name: "Padding" });
  const before = Number(await pad.getAttribute("aria-valuenow"));
  await pad.focus();
  await page.keyboard.press("Shift+ArrowRight");
  await expect(pad).toHaveAttribute("aria-valuenow", String(before + 10));
  // Frame tiles and background tabs.
  await page.getByRole("radio", { name: "Browser" }).click();
  await expect(page.getByRole("textbox", { name: "Address bar URL" })).toBeVisible();
  await page.getByRole("tab", { name: "Solid" }).click();
  await page.getByRole("button", { name: "Licorice", exact: true }).click();
  expect(await previewData(page)).not.toBe(a);
  // Undo walks back.
  await page.getByRole("button", { name: /^Undo/ }).click();
  await expect(page.getByRole("button", { name: /^Redo/ })).toBeEnabled();
});

test("Candy Jar: filters, keyboard apply, save/rename/delete a custom style that persists", async ({
  page,
}) => {
  await open(page);
  await loadSample(page);
  await page.keyboard.press("g");
  const jar = page.getByRole("dialog", { name: "Candy Jar" });
  await expect(jar).toBeVisible();
  await jar.getByRole("tab", { name: /Device/ }).click();
  await expect(jar.getByRole("button", { name: /Sorbet Phone/ })).toBeVisible();
  await jar.getByRole("tab", { name: /^All/ }).click();
  await jar.getByPlaceholder("Search styles").fill("mint");
  await jar.getByRole("button", { name: /^Mint Peek/ }).focus();
  await page.keyboard.press("Enter");
  await expect(jar).toBeHidden();
  await expect(page.getByRole("button", { name: /^Mint Peek style/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.keyboard.press("g");
  await jar.getByRole("button", { name: /Save current style/ }).click();
  const name = jar.getByRole("textbox", { name: "Style name" });
  await name.fill("Launch week");
  await name.press("Enter");
  await expect(jar.getByRole("button", { name: /^Launch week/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.reload();
  await open(page);
  await page.keyboard.press("g");
  await expect(jar.getByRole("button", { name: /^Launch week/ })).toBeVisible();
  await jar.getByRole("button", { name: "Options for Launch week" }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await jar.getByRole("textbox", { name: "Style name" }).fill("Docs shots");
  await jar.getByRole("textbox", { name: "Style name" }).press("Enter");
  await expect(jar.getByRole("button", { name: /^Docs shots/ })).toBeVisible();
  await jar.getByRole("button", { name: "Options for Docs shots" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(jar.getByRole("button", { name: /^Docs shots/ })).toHaveCount(0);
});

test("annotations: draw, select, move, edit text, delete with undo", async ({ page }) => {
  await open(page);
  await loadSample(page);
  const box = (await page.getByTestId("preview").boundingBox())!;
  const at = (fx: number, fy: number) => [box.x + box.width * fx, box.y + box.height * fy] as const;

  // Arrow
  await page.getByRole("button", { name: "Arrow (A)" }).click();
  await page.mouse.move(...at(0.3, 0.3));
  await page.mouse.down();
  await page.mouse.move(...at(0.55, 0.5), { steps: 6 });
  await page.mouse.up();
  await expect(page.getByTestId("annotation-props")).toContainText("Arrow");
  // Highlight via shortcut
  await page.keyboard.press("r");
  await page.mouse.move(...at(0.6, 0.6));
  await page.mouse.down();
  await page.mouse.move(...at(0.8, 0.75), { steps: 6 });
  await page.mouse.up();
  await expect(page.getByTestId("annotation-props")).toContainText("Highlight");
  // Text: click places and edits.
  await page.keyboard.press("t");
  await page.mouse.click(...at(0.5, 0.15));
  const editor = page.getByRole("textbox", { name: "Annotation text" });
  await expect(editor).toBeFocused();
  await editor.fill("Ship it");
  await editor.press("Enter");
  const anns = await page.evaluate(() =>
    (window as unknown as W).__shotcandy.app.scene.annotations.map((a) => a.kind),
  );
  expect(anns).toEqual(["arrow", "rect", "text"]);
  const text = await page.evaluate(
    () =>
      (window as unknown as W).__shotcandy.app.scene.annotations.find((a) => a.kind === "text") as {
        text: string;
      },
  );
  expect(text.text).toBe("Ship it");

  // Move the highlight with the keyboard and delete it.
  await page.getByRole("button", { name: /^Highlight outline/ }).click();
  const x0 = await page.evaluate(
    () => ((window as unknown as W).__shotcandy.app.scene.annotations[1] as { x: number }).x,
  );
  await page.getByTestId("stage").focus();
  await page.keyboard.press("Shift+ArrowRight");
  const x1 = await page.evaluate(
    () => ((window as unknown as W).__shotcandy.app.scene.annotations[1] as { x: number }).x,
  );
  expect(x1).toBeGreaterThan(x0);
  await page.keyboard.press("Delete");
  await expect(page.getByTestId("toast")).toContainText("Annotation deleted");
  await page.getByTestId("toast").getByRole("button", { name: "Undo" }).click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as W).__shotcandy.app.scene.annotations.length),
    )
    .toBe(3);
});

test("shortcuts sheet, theme toggle and zoom controls", async ({ page }) => {
  await open(page);
  await loadSample(page);
  await page.getByTestId("stage").focus();
  await page.keyboard.press("Shift+?");
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeHidden();

  await page.getByRole("button", { name: "More", exact: true }).click();
  const more = page.getByRole("dialog", { name: "More" });
  await more.getByRole("radio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await more.getByRole("radio", { name: "System" }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /./);
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: /^Zoom in \(/ }).click();
  await expect(page.getByRole("button", { name: /^Zoom \d+%/ })).not.toHaveText("27%");
  await page.getByRole("button", { name: /^Zoom \d+%/ }).click();
});

test("clipboard read denied shows a helpful error", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: { read: () => Promise.reject(new DOMException("denied", "NotAllowedError")) },
      configurable: true,
    });
  });
  await open(page);
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: /Paste from clipboard/ }).click();
  await expect(page.getByTestId("toast")).toContainText("Clipboard access was blocked");
});

test("tool page hands a screenshot to the editor with the matching preset", async ({ page }) => {
  await page.goto("/macos-window-frame/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("macOS window frame");
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: "Choose file" }).click(),
  ]);
  await chooser.setFiles(SAMPLE);
  await expect(page.getByTestId("preview")).toBeVisible({ timeout: 15_000 });
  const frame = await page.evaluate(
    () => (window as unknown as W).__shotcandy.app.scene.card.frame.id,
  );
  expect(frame).toBe("macos");
  await expect(page.getByRole("button", { name: /^Sherbet style/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test.describe("narrow layout", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  test("bottom sheet tabs and the Save your image sheet", async ({ page }) => {
    await open(page);
    await expect(page.getByRole("heading", { name: "Make a screenshot lovely" })).toBeVisible();
    await page.getByRole("button", { name: "Try the phone sample" }).click();
    await expect(page.getByTestId("preview")).toBeVisible();
    const tabs = page.getByRole("tablist", { name: "Panels" });
    await expect(tabs).toBeVisible();
    await tabs.getByRole("tab", { name: "Layout" }).click();
    await expect(page.getByRole("slider", { name: "Padding" })).toBeVisible();
    await tabs.getByRole("tab", { name: "Frame" }).click();
    await expect(page.getByRole("radio", { name: "Laptop" })).toBeVisible();
    await page.getByTestId("export").click();
    const sheet = page.getByRole("dialog", { name: "Save your image" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Save to Photos" })).toBeVisible();
  });
});

test("preview interactions stay under 100 ms with a 4K screenshot", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "timing budget measured in Chromium");
  await open(page);
  await page.evaluate(async () => {
    const c = new OffscreenCanvas(3840, 2400);
    const g = c.getContext("2d")!;
    const grad = g.createLinearGradient(0, 0, 3840, 2400);
    grad.addColorStop(0, "#f7f3ff");
    grad.addColorStop(1, "#dfe9ff");
    g.fillStyle = grad;
    g.fillRect(0, 0, 3840, 2400);
    for (let i = 0; i < 400; i++) {
      g.fillStyle = `hsl(${(i * 37) % 360} 70% 60%)`;
      g.fillRect((i * 97) % 3700, (i * 53) % 2300, 120, 40);
    }
    const blob = await c.convertToBlob({ type: "image/png" });
    await (window as unknown as W).__shotcandy.app.loadBlob(blob);
  });
  await expect(page.getByTestId("preview")).toBeVisible();
  await page.waitForTimeout(600);
  const pad = page.getByRole("slider", { name: "Padding" });
  await pad.focus();
  const times: number[] = [];
  for (let i = 0; i < 12; i++) {
    const t = await page.evaluate(async () => {
      const t0 = performance.now();
      document.activeElement!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      );
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return performance.now() - t0;
    });
    times.push(t);
  }
  times.sort((a, b) => a - b);
  const p95 = times[Math.floor(times.length * 0.95) - 1]!;
  console.log(
    `4K padding interaction p95 ${p95.toFixed(1)} ms (median ${times[6]!.toFixed(1)} ms)`,
  );
  expect(p95).toBeLessThan(100);
});
