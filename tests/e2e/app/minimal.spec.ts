/**
 * The design canvas frame and the Minimal style family in the real app.
 */
import { expect, test } from "@playwright/test";
import { loadSample, open, previewData } from "./helpers";

test("the design canvas frame has a name and a size switch", async ({ page }) => {
  await open(page);
  await loadSample(page);
  const tray = page.getByTestId("frame-tray");
  await tray.getByRole("radio", { name: "Design canvas" }).click();
  await expect(tray.getByRole("radio", { name: "Design canvas" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  const withTag = await previewData(page);
  await tray.getByRole("textbox", { name: "Frame name" }).fill("Checkout v2");
  const renamed = await previewData(page);
  expect(renamed).not.toBe(withTag);
  await tray.getByRole("switch", { name: "Show pixel size" }).click();
  await expect(tray.getByRole("switch", { name: "Show pixel size" })).not.toBeChecked();
  expect(await previewData(page)).not.toBe(renamed);
});

test("the Candy Jar has a Minimal family with Design Canvas", async ({ page }) => {
  await open(page);
  await loadSample(page);
  await page.keyboard.press("g");
  const jar = page.getByRole("dialog", { name: "Candy Jar" });
  await jar.getByRole("tab", { name: /Minimal/ }).click();
  for (const name of ["Plain White", "Soft Grey", "Outline", "Quiet Float", "Graphite"])
    await expect(jar.getByRole("button", { name: new RegExp(`^${name}`) })).toBeVisible();
  await jar.getByRole("button", { name: /^Design Canvas/ }).focus();
  await page.keyboard.press("Enter");
  await expect(jar).toBeHidden();
  await expect(
    page.getByTestId("frame-tray").getByRole("radio", { name: "Design canvas" }),
  ).toHaveAttribute("aria-checked", "true");
});
