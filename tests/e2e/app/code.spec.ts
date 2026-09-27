/**
 * Code images in the real app: switch to Code mode, paste code, auto-detect
 * and highlight (Shiki loads lazily), themes, window options, export, the
 * handoff from the /code-screenshot page, and axe.
 */
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { open, pngSize } from "./helpers";

type W = { __shotcandy: { app: { scene: { content: Record<string, unknown> } } } };
const content = (page: Page) =>
  page.evaluate(() => (window as unknown as W).__shotcandy.app.scene.content);

async function codeMode(page: Page) {
  await open(page);
  await page.getByRole("tab", { name: "Code" }).click();
  await expect(page.getByTestId("code-tray")).toBeVisible();
  await expect(page.getByTestId("preview")).toBeVisible();
}

test("Code mode starts with a highlighted sample and loads Shiki lazily", async ({ page }) => {
  const shiki: string[] = [];
  page.on("request", (r) => {
    if (/typescript|shiki|engine-javascript/i.test(r.url())) shiki.push(r.url());
  });
  await open(page);
  expect(shiki).toEqual([]); // nothing heavy before Code mode
  await page.getByRole("tab", { name: "Code" }).click();
  await expect
    .poll(async () => ((await content(page)).tokens as { language?: string } | null)?.language, {
      timeout: 15_000,
    })
    .toBe("typescript");
  await expect(page.getByTestId("language")).toHaveAccessibleName("Language: Auto · TypeScript");
  await expect(page.getByTestId("export")).toBeEnabled();
});

test("pasting code auto-detects the language and re-highlights", async ({ page }) => {
  await codeMode(page);
  const input = page.getByTestId("code-input");
  await input.fill(
    "def greet(name: str) -> str:\n    return f\"Hello, {name}\"\n\nprint(greet('candy'))\n",
  );
  await expect(page.getByTestId("language")).toContainText("Python");
  await expect
    .poll(async () => ((await content(page)).tokens as { language?: string } | null)?.language, {
      timeout: 15_000,
    })
    .toBe("python");
  // Choosing a language overrides detection.
  await page.getByTestId("language").click();
  await page.getByRole("menuitemradio", { name: "Ruby" }).click();
  await expect(page.getByTestId("language")).toContainText("Ruby");
  expect((await content(page)).language).toBe("ruby");
});

test("themes, window options and highlighted lines change the image", async ({ page }) => {
  await codeMode(page);
  const snap = () =>
    page.evaluate(async () => {
      for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r));
      return (document.querySelector("[data-testid=preview]") as HTMLCanvasElement).toDataURL();
    });
  const a = await snap();
  await page.getByRole("button", { name: "Sherbet theme" }).click();
  expect((await content(page)).theme).toBe("sherbet");
  const b = await snap();
  expect(b).not.toBe(a);
  await page.getByTestId("highlight-lines").fill("2, 4-5");
  expect((await content(page)).highlight).toEqual([2, 4, 5]);
  await page.getByRole("switch", { name: "Line numbers" }).click();
  expect((await content(page)).lineNumbers).toBe(false);
  await page.getByRole("radio", { name: "None" }).first().click();
  expect((await content(page)).chrome).toBe("none");
  expect(await snap()).not.toBe(b);
});

test("exports the code image as PNG at 2x", async ({ page }) => {
  await codeMode(page);
  const dims = await page.evaluate(() => {
    const el = document.querySelector("[data-testid=size-chip]")!;
    return el.textContent ?? "";
  });
  const m = /(\d+) × (\d+)/.exec(dims)!;
  const [dl] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("export").click(),
  ]);
  const size = pngSize(readFileSync(await dl.path()));
  expect(size).toEqual({ width: Number(m[1]) * 2, height: Number(m[2]) * 2 });
});

test("each mode keeps its own design", async ({ page }) => {
  await codeMode(page);
  await page.getByTestId("code-input").fill("SELECT 1;");
  await page.getByRole("tab", { name: "Screenshot" }).click();
  await expect(page.getByTestId("empty-state")).toBeVisible();
  await page.getByRole("tab", { name: "Code" }).click();
  await expect(page.getByTestId("code-input")).toHaveValue("SELECT 1;");
});

test("the code screenshot page hands code to the editor", async ({ page }) => {
  await page.goto("/code-screenshot/");
  await page.getByLabel("Your code").fill('fn main() {\n    println!("sweet");\n}');
  await page.getByTestId("make-code-image").click();
  await page.waitForURL((u) => u.pathname === "/");
  await page.waitForFunction(() => !!(window as unknown as { __shotcandy?: unknown }).__shotcandy);
  await expect(page.getByTestId("code-input")).toHaveValue(/println!/);
  await expect(page.getByTestId("language")).toContainText("Rust");
});

for (const scheme of ["light", "dark"] as const) {
  test(`Code mode passes axe (${scheme})`, async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "axe runs once, in Chromium");
    await page.emulateMedia({ colorScheme: scheme });
    await codeMode(page);
    await page.waitForTimeout(600);
    const r = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(" ")}`)).toEqual([]);
  });
}
