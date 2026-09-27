/** The mode switcher and the empty-state mode picks (desktop and narrow). */
import { expect, test } from "@playwright/test";
import { open } from "./helpers";

test("empty state offers the other modes", async ({ page }) => {
  await open(page);
  await page.getByTestId("pick-post").click();
  await expect(page.getByRole("tab", { name: "Post" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("post-tray")).toBeVisible();
});

test("the header switcher works with the keyboard", async ({ page }) => {
  await open(page);
  const tabs = page.getByTestId("mode-switch");
  await tabs.getByRole("tab", { name: "Screenshot" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(tabs.getByRole("tab", { name: "Code" })).toHaveAttribute("aria-selected", "true");
  await expect(tabs.getByRole("tab", { name: "Code" })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(tabs.getByRole("tab", { name: "App Store" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByTestId("board")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(tabs.getByRole("tab", { name: "Screenshot" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("?mode= opens a mode directly", async ({ page }) => {
  await open(page, "/?mode=post");
  await expect(page.getByTestId("post-tray")).toBeVisible();
});

test.describe("narrow", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("the mode chip switches modes", async ({ page }) => {
    await open(page);
    await page.getByTestId("mode-chip").click();
    await page.getByRole("menuitemradio", { name: /App Store/ }).click();
    await expect(page.getByTestId("board")).toBeVisible();
    await expect(page.getByRole("tab", { name: "Slide" })).toBeVisible();
  });
});
