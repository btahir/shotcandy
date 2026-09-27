/**
 * Accessibility: axe on every screen (no serious or critical violations) in
 * light and dark, plus keyboard reachability with a visible focus ring.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { loadSample, open } from "./helpers";

async function axe(page: Page, label: string) {
  const r = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  if (bad.length)
    console.log(
      label,
      JSON.stringify(
        bad.map((v) => ({
          id: v.id,
          n: v.nodes.length,
          t: v.nodes.slice(0, 3).map((n) => n.target),
        })),
        null,
        1,
      ),
    );
  expect(bad, `${label}: ${bad.map((v) => v.id).join(", ")}`).toEqual([]);
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`axe (${scheme})`, () => {
    test.use({ colorScheme: scheme });
    test.skip(({ browserName }) => browserName !== "chromium", "axe runs once, in Chromium");

    test("editor: empty, loaded, export popover, gallery, annotation mode", async ({ page }) => {
      await open(page);
      await axe(page, "empty");
      await loadSample(page);
      await page.waitForTimeout(400);
      await axe(page, "loaded");
      await page.getByTestId("export-options").click();
      await page.waitForTimeout(300);
      await axe(page, "export popover");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
      await page.getByTestId("size-chip").click();
      await page.waitForTimeout(300);
      await axe(page, "size menu");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
      await page.keyboard.press("g");
      await page.waitForTimeout(500);
      await axe(page, "gallery");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
      await page.getByRole("button", { name: "Arrow (A)" }).click();
      await page.waitForTimeout(400);
      await axe(page, "annotation mode");
    });

    for (const path of [
      "/about/",
      "/screenshot-beautifier/",
      "/macos-window-frame/",
      "/og-image-maker/",
    ]) {
      test(`page ${path}`, async ({ page }) => {
        await page.goto(path);
        await axe(page, path);
      });
    }
  });
}

test("every header and inspector control is reachable by keyboard with a visible focus ring", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "checked once");
  await open(page);
  await loadSample(page);
  await page.locator("body").focus();
  const seen = new Set<string>();
  let ringless = 0;
  for (let i = 0; i < 70; i++) {
    await page.keyboard.press("Tab");
    await page.waitForTimeout(170);
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const hasRing = (n: Element | null) => {
        if (!n) return false;
        const cs = getComputedStyle(n);
        return /0px 0px 0px (2|4)px/.test(cs.boxShadow) || cs.outlineStyle !== "none";
      };
      const ring =
        hasRing(el) ||
        hasRing(el.querySelector(".knob")) ||
        hasRing(el.querySelector(".thumb")) ||
        hasRing(el.querySelector(".th")) ||
        hasRing(el.closest(".input"));
      return {
        name: el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 30) ?? el.tagName,
        ring,
        cls: el.className?.toString?.() ?? "",
      };
    });
    if (!info) continue;
    seen.add(info.name);
    if (!info.ring) {
      ringless++;
      console.log("no focus ring:", info.name, info.cls);
    }
  }
  for (const name of ["Undo (⌘Z)", "More", "Export options (⇧⌘S)"])
    expect([...seen]).toContain(name);
  expect([...seen].some((n) => /Copy/.test(n))).toBe(true);
  expect([...seen].some((n) => /Sherbet style/.test(n))).toBe(true);
  expect(ringless).toBe(0);
});
