/**
 * Post and testimonial cards in the real app: edit the words, switch the card
 * type, rate, upload an avatar (stays local), style, export, and axe.
 */
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { SAMPLE, open, pngSize } from "./helpers";

type W = { __shotcandy: { app: { scene: { content: Record<string, unknown> } } } };
const content = (page: Page) =>
  page.evaluate(() => (window as unknown as W).__shotcandy.app.scene.content);

async function postMode(page: Page) {
  await open(page);
  await page.getByRole("tab", { name: "Post" }).click();
  await expect(page.getByTestId("post-tray")).toBeVisible();
  await expect(page.getByTestId("preview")).toBeVisible();
}

const snap = (page: Page) =>
  page.evaluate(async () => {
    for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r));
    return (document.querySelector("[data-testid=preview]") as HTMLCanvasElement).toDataURL();
  });

test("editing the card updates the preview", async ({ page }) => {
  await postMode(page);
  const a = await snap(page);
  await page.getByTestId("post-name").fill("Sam Rivera");
  await page.getByTestId("post-text").fill("Launch day! Try it at https://example.com #shipit");
  expect((await content(page)).name).toBe("Sam Rivera");
  expect(await snap(page)).not.toBe(a);
});

test("testimonial type, rating and style", async ({ page }) => {
  await postMode(page);
  await page.getByRole("radio", { name: "Testimonial" }).click();
  expect((await content(page)).variant).toBe("testimonial");
  expect((await content(page)).rating).toBe(5);
  await expect(page.getByText("Role or company")).toBeVisible();
  await page.getByRole("radio", { name: "3 stars" }).click();
  expect((await content(page)).rating).toBe(3);
  await page.getByRole("button", { name: "Midnight card style" }).click();
  expect((await content(page)).theme).toBe("midnight");
  await page.getByRole("radio", { name: "Cream" }).click();
  expect((await content(page)).theme).toBe("cream");
});

test("an uploaded avatar replaces the initials and is exported", async ({ page }) => {
  await postMode(page);
  const a = await snap(page);
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByTestId("avatar-upload").click(),
  ]);
  await chooser.setFiles(SAMPLE);
  await expect.poll(async () => (await content(page)).avatarAssetId).toBeTruthy();
  expect(await snap(page)).not.toBe(a);
  const dims = (await page.getByTestId("size-chip").textContent()) ?? "";
  const m = /(\d+) × (\d+)/.exec(dims)!;
  const [dl] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("export").click(),
  ]);
  expect(pngSize(readFileSync(await dl.path()))).toEqual({
    width: Number(m[1]) * 2,
    height: Number(m[2]) * 2,
  });
});

for (const scheme of ["light", "dark"] as const) {
  test(`Post mode passes axe (${scheme})`, async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "axe runs once, in Chromium");
    await page.emulateMedia({ colorScheme: scheme });
    await postMode(page);
    await page.waitForTimeout(500);
    const r = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(" ")}`)).toEqual([]);
  });
}
