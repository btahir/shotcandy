/// <reference lib="webworker" />
/**
 * Font loading inside workers: mirror the page's font registry and load the
 * same self-hosted files with FontFace, so worker renders match the preview.
 */
import { type FontDefinition, registerFont } from "../render/fonts";
import { clearTextMeasureCache } from "../render/measure";

const loadedFonts = new Set<string>();

export function workerHasFonts(): boolean {
  return typeof (self as unknown as { fonts?: unknown }).fonts !== "undefined";
}

export async function ensureWorkerFonts(fonts: FontDefinition[]): Promise<void> {
  for (const f of fonts) registerFont(f);
  const set = (self as unknown as { fonts?: FontFaceSet }).fonts;
  if (!set || typeof FontFace === "undefined") return;
  const jobs: Promise<unknown>[] = [];
  for (const f of fonts) {
    for (const src of f.sources ?? []) {
      const key = `${f.id}|${src.url}|${src.weight ?? ""}|${src.style ?? ""}`;
      if (loadedFonts.has(key)) continue;
      loadedFonts.add(key);
      const family = f.stack
        .split(",")[0]!
        .trim()
        .replace(/^["']|["']$/g, "");
      const face = new FontFace(family, `url(${src.url})`, {
        ...(src.weight ? { weight: src.weight } : {}),
        ...(src.style ? { style: src.style } : {}),
      });
      set.add(face);
      jobs.push(face.load());
    }
  }
  await Promise.all(jobs);
  // Text measured before these faces loaded (code and post layouts) is stale.
  if (jobs.length) clearTextMeasureCache();
}
