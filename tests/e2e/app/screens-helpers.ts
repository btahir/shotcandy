import { type Page, expect } from "@playwright/test";
import { type FileSpec, b64 } from "./batch-helpers";

type Screens = {
  at(x: number, y: number): number | null;
  ui: { get(): { target: number | null } };
};
type W = {
  __shotcandy: {
    app: {
      screens: Screens;
      scene: {
        layout?: { id: string; count: number; params?: Record<string, number> };
        slots?: { assetId: string | null; annotations?: unknown[] }[];
        content: { assetId?: string | null };
        canvas: { padding: number };
        meta: { stylePresetId?: string };
      };
      store: { getState(): { doc: unknown; undoLabel: string | null } };
    };
  };
};

/** A client point inside screen `i` (its visible part: the topmost screen there is `i`). */
export async function screenPoint(page: Page, i: number): Promise<{ x: number; y: number }> {
  const box = await page.locator(`[data-testid=screen][data-screen="${i}"]`).boundingBox();
  expect(box, `screen ${i} is on the stage`).not.toBeNull();
  const p = await page.evaluate(
    ({ i, box }) => {
      const s = (window as unknown as W).__shotcandy.app.screens;
      // Search from the middle outwards for a point that hits this screen first.
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      for (let r = 0; r <= 0.45; r += 0.05)
        for (let a = 0; a < 16; a++) {
          const x = cx + Math.cos((a / 16) * Math.PI * 2) * r * box.width;
          const y = cy + Math.sin((a / 16) * Math.PI * 2) * r * box.height;
          if (s.at(x, y) === i) return { x, y };
          if (r === 0) break;
        }
      return null;
    },
    { i, box: box! },
  );
  expect(p, `a visible point of screen ${i}`).not.toBeNull();
  return p!;
}

/** The design on stage: its layout and each screen's asset (null = empty). */
export function design(page: Page) {
  return page.evaluate(() => {
    const s = (window as unknown as W).__shotcandy.app.scene;
    return {
      layout: s.layout?.id ?? "single",
      count: s.layout?.count ?? 1,
      params: s.layout?.params ?? {},
      screens: [s.content.assetId ?? null, ...(s.slots ?? []).map((x) => x.assetId)],
      padding: s.canvas.padding,
      style: s.meta.stylePresetId ?? null,
    };
  });
}

export const undoLabel = (page: Page) =>
  page.evaluate(() => (window as unknown as W).__shotcandy.app.store.getState().undoLabel);

function payload(files: (string | FileSpec)[]) {
  return files.map((f) => {
    const spec = typeof f === "string" ? { name: f } : f;
    return { name: spec.name, type: spec.type ?? "image/png", data: b64(spec.from ?? spec.name) };
  });
}

/** Drop files at a client point (the real window drop handler, with coordinates). */
export async function dropAt(
  page: Page,
  files: (string | FileSpec)[],
  at: { x: number; y: number } | null,
) {
  await page.evaluate(
    ({ items, at }) => {
      const dt = new DataTransfer();
      for (const it of items) {
        const bytes = Uint8Array.from(atob(it.data), (c) => c.charCodeAt(0));
        dt.items.add(new File([bytes], it.name, { type: it.type }));
      }
      const opts = {
        dataTransfer: dt,
        bubbles: true,
        cancelable: true,
        clientX: at?.x ?? 0,
        clientY: at?.y ?? 0,
      };
      const el = at ? document.elementFromPoint(at.x, at.y) : document.body;
      (el ?? document.body).dispatchEvent(new DragEvent("drop", opts));
    },
    { items: payload(files), at },
  );
}

/** Drag files over a point without dropping (the veil and the screen highlight). */
export async function dragOver(page: Page, at: { x: number; y: number }) {
  await page.evaluate((at) => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array([137, 80, 78, 71])], "x.png", { type: "image/png" }));
    const el = document.elementFromPoint(at.x, at.y) ?? document.body;
    const opts = {
      dataTransfer: dt,
      bubbles: true,
      cancelable: true,
      clientX: at.x,
      clientY: at.y,
    };
    el.dispatchEvent(new DragEvent("dragenter", opts));
    el.dispatchEvent(new DragEvent("dragover", opts));
  }, at);
}

/** Pick a layout in the Screens tray. */
export async function pickLayout(page: Page, name: string) {
  await page.getByTestId("screens-tray").getByRole("radio", { name, exact: true }).click();
  await expect(
    page.getByTestId("screens-tray").getByRole("radio", { name, exact: true }),
  ).toHaveAttribute("aria-checked", "true");
}

/** Choose a file for a screen through its file chooser (a click on the empty screen). */
export async function fillByClick(page: Page, i: number, file: string, name = file) {
  const p = await screenPoint(page, i);
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.mouse.click(p.x, p.y),
  ]);
  await chooser.setFiles({ name, mimeType: "image/png", buffer: Buffer.from(b64(file), "base64") });
}

/** Wait until screen `i` holds an image (or is empty). */
export async function waitScreen(page: Page, i: number, filled = true) {
  await expect
    .poll(async () => !!(await design(page)).screens[i], { timeout: 20_000 })
    .toBe(filled);
}
