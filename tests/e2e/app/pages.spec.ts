import { expect, test } from "@playwright/test";

/** Content pages and the 404: no sideways scrolling on phones, and a real gutter. */
const ROUTES = ["/about/", "/screenshot-beautifier/", "/macos-window-frame/", "/og-image-maker/"];

for (const width of [320, 390, 768]) {
  test(`content pages fit a ${width} px viewport with a side gutter`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const route of [...ROUTES, "/this-page-does-not-exist/"]) {
      await page.goto(route);
      const m = await page.evaluate(() => {
        const h1 = document.querySelector("h1")!.getBoundingClientRect();
        return {
          scroll: document.documentElement.scrollWidth,
          inner: window.innerWidth,
          left: h1.left,
          right: h1.right,
        };
      });
      expect(m.scroll, `${route} scrolls sideways`).toBeLessThanOrEqual(m.inner);
      expect(m.left, `${route} h1 touches the left edge`).toBeGreaterThanOrEqual(16);
      expect(m.right, `${route} h1 touches the right edge`).toBeLessThanOrEqual(m.inner - 16);
    }
  });
}

test("unknown URLs show the branded 404 with a way back to the editor", async ({ page }) => {
  const res = await page.goto("/no-such-page/");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/This page melted/);
  await page.getByRole("main").getByRole("link", { name: "Open the editor" }).click();
  await expect(page).toHaveURL(/\/$/);
});
