/**
 * Solid-box redaction end to end: draw with the Blur tool, choose Solid, and
 * the exported PNG (rendered by the export worker) has an opaque box of the
 * chosen colour where the screenshot was. Plus axe on that inspector state.
 */
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { PNG } from "pngjs";
import type { EditorApp } from "../../../src/components/editor/app";
import { loadSample, open } from "./helpers";

type W = { __shotcandy: { app: EditorApp } };

/** Where to drag, as fractions of the preview. */
const BOX = { x0: 0.34, y0: 0.3, x1: 0.62, y1: 0.42 };

async function drawSolid(page: Page) {
  await open(page);
  await loadSample(page);
  await page.getByRole("button", { name: "Blur (B)" }).click();
  // The inspector switches to the tool, which can reframe the stage: measure after.
  await page.waitForTimeout(300);
  const box = (await page.getByTestId("preview").boundingBox())!;
  const at = (fx: number, fy: number) => [box.x + box.width * fx, box.y + box.height * fy] as const;
  await page.mouse.move(...at(BOX.x0, BOX.y0));
  await page.mouse.down();
  await page.mouse.move(...at(BOX.x1, BOX.y1), { steps: 6 });
  await page.mouse.up();
  const props = page.getByTestId("annotation-props");
  await expect(props).toContainText("Solid hides text completely");
  await props.getByRole("radio", { name: "Solid" }).click();
  await expect(props).toContainText("Hides text completely");
  // Strength means nothing to a solid box; its colour row shows instead, on Auto.
  await expect(props.getByRole("slider", { name: "Strength" })).toHaveCount(0);
  await expect(props.getByRole("button", { name: /^Auto/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  return props;
}

/** Pixels of a PNG at fractions of its size. */
function sampler(buf: Buffer) {
  const png = PNG.sync.read(buf);
  return {
    png,
    at(u: number, v: number) {
      const x = Math.min(png.width - 1, Math.floor(u * png.width));
      const y = Math.min(png.height - 1, Math.floor(v * png.height));
      const i = (y * png.width + x) * 4;
      return Array.from(png.data.subarray(i, i + 4));
    },
  };
}

async function exportPng(page: Page) {
  const [dl] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("export").click(),
  ]);
  return readFileSync((await dl.path())!);
}

test("a solid box hides what is underneath in the export", async ({ page }) => {
  const props = await drawSolid(page);
  const scene = () =>
    page.evaluate(() => (window as unknown as W).__shotcandy.app.scene.annotations[0]);
  // No fill yet means auto (a stored scene spells it out).
  expect(await scene()).toMatchObject({ kind: "redact", mode: "solid" });
  expect(((await scene()) as { fill?: string }).fill ?? "auto").toBe("auto");

  await props.getByRole("button", { name: "Black" }).click();
  await expect(props.getByRole("button", { name: "Black" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(await scene()).toMatchObject({ mode: "solid", fill: "#000000" });
  await expect(page.getByRole("button", { name: /^Blur solid/ })).toBeVisible();

  // Where the box is, as fractions of the preview (and so of the export, which has its shape).
  const box = (await page.getByTestId("preview").boundingBox())!;
  const mark = (await page.locator(".ann-layer .outline.redact").boundingBox())!;
  const B = {
    x0: (mark.x - box.x) / box.width,
    y0: (mark.y - box.y) / box.height,
    x1: (mark.x + mark.width - box.x) / box.width,
    y1: (mark.y + mark.height - box.y) / box.height,
  };
  const png = sampler(await exportPng(page));
  expect(png.png.width / png.png.height).toBeCloseTo(box.width / box.height, 1);
  // Every sample well inside the box is opaque black.
  const inset = 0.15;
  const bw = B.x1 - B.x0;
  const bh = B.y1 - B.y0;
  expect(bw).toBeGreaterThan(0.2);
  let n = 0;
  for (let j = 0; j <= 12; j++)
    for (let i = 0; i <= 24; i++) {
      const u = B.x0 + bw * (inset + ((1 - 2 * inset) * i) / 24);
      const v = B.y0 + bh * (inset + ((1 - 2 * inset) * j) / 12);
      expect(png.at(u, v), `${u.toFixed(3)},${v.toFixed(3)}`).toEqual([0, 0, 0, 255]);
      n++;
    }
  expect(n).toBe(325);
  // Outside the box the screenshot shows (the light sample is not black there).
  const outside = png.at(B.x0 - 0.03, B.y1 + 0.05);
  expect(outside[0]! + outside[1]! + outside[2]!).toBeGreaterThan(300);

  // White, then auto (dark on this light dashboard), also reach the export.
  await props.getByRole("button", { name: "White" }).click();
  const white = sampler(await exportPng(page));
  expect(white.at((B.x0 + B.x1) / 2, (B.y0 + B.y1) / 2)).toEqual([255, 255, 255, 255]);
  await props.getByRole("button", { name: /^Auto/ }).click();
  const auto = sampler(await exportPng(page));
  expect(auto.at((B.x0 + B.x1) / 2, (B.y0 + B.y1) / 2)).toEqual([0x1c, 0x1c, 0x1e, 255]);
});

test("switching back to blur shows its strength again and keeps the colour", async ({ page }) => {
  const props = await drawSolid(page);
  await props.getByRole("button", { name: "White" }).click();
  await props.getByRole("radio", { name: "Blur" }).click();
  await expect(props.getByRole("slider", { name: "Strength" })).toBeVisible();
  await expect(props.getByRole("button", { name: "White" })).toHaveCount(0);
  await props.getByRole("radio", { name: "Solid" }).click();
  await expect(props.getByRole("button", { name: "White" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

for (const scheme of ["light", "dark"] as const) {
  test(`axe (${scheme}): the solid redaction inspector`, async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "axe runs once, in Chromium");
    await page.emulateMedia({ colorScheme: scheme });
    await drawSolid(page);
    await page.waitForTimeout(300);
    const r = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(" ")}`)).toEqual([]);
  });
}
