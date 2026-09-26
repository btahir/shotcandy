import { test as base, expect, type Page } from "@playwright/test";
import type { Harness } from "./harness/entry";

export const SAMPLES = {
  dashboard: "sample-dashboard-light.png",
  editor: "sample-editor-dark.png",
  mobile: "sample-mobile-habits.png",
  landing: "sample-landing-hero.png",
  terminal: "sample-terminal-code.png",
  kanban: "sample-kanban-light.png",
  tablet: "sample-tablet-reader.png",
  settings: "sample-settings-dark.png",
} as const;

/** Run a harness method in the page. */
export async function call<K extends keyof Harness>(
  page: Page,
  method: K,
  ...args: Parameters<Harness[K]>
): Promise<Awaited<ReturnType<Harness[K]>>> {
  return page.evaluate(
    ([m, a]) =>
      (window as unknown as { harness: Record<string, (...x: unknown[]) => unknown> }).harness[
        m as string
      ]!(...(a as unknown[])),
    [method, args] as const,
  ) as Promise<Awaited<ReturnType<Harness[K]>>>;
}

export const test = base.extend<{ harness: Page }>({
  harness: async ({ page }, use) => {
    await page.goto("/index.html");
    await page.waitForFunction(
      () => (window as unknown as { harnessReady?: boolean }).harnessReady === true,
    );
    for (const [id, file] of Object.entries(SAMPLES))
      await call(page, "load", id, `/fixtures/${file}`);
    await use(page);
  },
});

export { expect };

export function dataUrlToBuffer(dataUrl: string): Buffer {
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
}
