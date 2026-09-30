import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Page } from "@playwright/test";

const DIR = resolve(__dirname, "../../../brand/samples");
export const SHOTS = [
  "sample-dashboard-light.png",
  "sample-editor-dark.png",
  "sample-kanban-light.png",
  "sample-landing-hero.png",
  "sample-mobile-habits.png",
  "sample-settings-dark.png",
  "sample-tablet-reader.png",
  "sample-terminal-code.png",
] as const;

export const b64 = (name: string) => readFileSync(resolve(DIR, name)).toString("base64");

export interface FileSpec {
  /** Name the file arrives with. */
  name: string;
  /** Sample it holds (defaults to `name`). */
  from?: string;
  type?: string;
  /** Raw bytes instead of a sample (e.g. a text file). */
  text?: string;
}

async function payload(files: (string | FileSpec)[]) {
  return files.map((f) => {
    const spec = typeof f === "string" ? { name: f } : f;
    return {
      name: spec.name,
      type: spec.type ?? (spec.text !== undefined ? "text/plain" : "image/png"),
      data: spec.text !== undefined ? btoa(spec.text) : b64(spec.from ?? spec.name),
    };
  });
}

/** Drop files on the window (the real drop handler). */
export async function dropFiles(page: Page, files: (string | FileSpec)[]) {
  const list = await payload(files);
  await page.evaluate((items) => {
    const dt = new DataTransfer();
    for (const it of items) {
      const bytes = Uint8Array.from(atob(it.data), (c) => c.charCodeAt(0));
      dt.items.add(new File([bytes], it.name, { type: it.type }));
    }
    document.body.dispatchEvent(
      new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }),
    );
  }, list);
}

/** Paste files (the real paste handler). */
export async function pasteFiles(page: Page, files: (string | FileSpec)[]) {
  const list = await payload(files);
  await page.evaluate((items) => {
    const dt = new DataTransfer();
    for (const it of items) {
      const bytes = Uint8Array.from(atob(it.data), (c) => c.charCodeAt(0));
      dt.items.add(new File([bytes], it.name, { type: it.type }));
    }
    const e = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(e, "clipboardData", { value: dt });
    document.dispatchEvent(e);
  }, list);
}

type W = {
  __shotcandy: {
    app: {
      store: { getState(): { doc: unknown; scene: unknown; undoLabel: string | null } };
      batch: { ui: { get(): unknown }; memoryStats(): { full: number; thumbs: number } };
      ui: { get(): { hasContent: boolean } };
      on(evt: string, fn: (arg?: unknown) => void): () => void;
    };
  };
};

export interface BatchInfo {
  kind: "batch" | "single";
  names: string[];
  active: number;
  selected: number[];
  custom: number[];
}

/** A summary of the document: a batch (names, active, selected) or a single design. */
export function info(page: Page): Promise<BatchInfo> {
  return page.evaluate(() => {
    const doc = (window as unknown as W).__shotcandy.app.store.getState().doc as {
      kind?: string;
      items?: { id: string; name: string; overrides?: unknown }[];
      active?: string;
      selected?: string[];
    };
    if (doc.kind !== "batch" || !doc.items)
      return { kind: "single", names: [], active: -1, selected: [], custom: [] } as BatchInfo;
    const idx = (id: string) => doc.items!.findIndex((x) => x.id === id);
    return {
      kind: "batch",
      names: doc.items.map((x) => x.name),
      active: idx(doc.active!),
      selected: doc.selected!.map(idx),
      custom: doc.items.flatMap((x, i) => (x.overrides ? [i] : [])),
    } as BatchInfo;
  });
}

export async function waitForCount(page: Page, n: number, testId = "batch-tile") {
  await expect(page.getByTestId(testId)).toHaveCount(n, { timeout: 20_000 });
  await expect(page.getByTestId("batch-pending")).toHaveCount(0, { timeout: 20_000 });
}

/** Every visible styled thumbnail has painted. */
export async function thumbsReady(page: Page, testId = "batch-tile") {
  await expect
    .poll(
      () =>
        page.evaluate(
          (id) =>
            Array.from(document.querySelectorAll(`[data-testid=${id}] canvas`))
              .filter((c) => {
                // Only tiles on screen render (the rest wait until scrolled to).
                const r = c.getBoundingClientRect();
                const p = c.closest(".brail-scroll, .bstrip-scroll")?.getBoundingClientRect();
                const vw = window.innerWidth;
                const vh = window.innerHeight;
                return (
                  r.bottom > Math.max(0, p?.top ?? 0) &&
                  r.top < Math.min(vh, p?.bottom ?? vh) &&
                  r.right > Math.max(0, p?.left ?? 0) &&
                  r.left < Math.min(vw, p?.right ?? vw)
                );
              })
              .every((c) => (c as HTMLCanvasElement).dataset.ready !== undefined),
          testId,
        ),
      { timeout: 20_000 },
    )
    .toBe(true);
}

export const tiles = (page: Page) => page.getByTestId("batch-tile");
