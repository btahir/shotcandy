/**
 * File names in and out of a batch: natural sort on import ("shot-2" before
 * "shot-10"), base names, and export names that never collide.
 */
import { DEFAULT_FILENAME_PATTERN, formatFilename, sanitizeFilename } from "../export/filename";
import type { ExportFormat } from "../export/formats";

const collator =
  typeof Intl !== "undefined"
    ? new Intl.Collator(undefined, { numeric: true, sensitivity: "base" })
    : null;

/** Natural order: numbers compare by value, case and accents are ignored. */
export function naturalCompare(a: string, b: string): number {
  if (collator) {
    const c = collator.compare(a, b);
    if (c !== 0) return c;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Sort files by path (folders) or name, in natural order. Stable. */
export function sortByName<T extends { name: string; path?: string }>(files: readonly T[]): T[] {
  return files
    .map((f, i) => ({ f, i }))
    .sort((x, y) => naturalCompare(x.f.path || x.f.name, y.f.path || y.f.name) || x.i - y.i)
    .map((x) => x.f);
}

/** "shots/Login screen.png" -> "Login screen". */
export function baseName(name: string): string {
  const file = name.split(/[\\/]/).pop() ?? "";
  const dot = file.lastIndexOf(".");
  return (dot > 0 ? file.slice(0, dot) : file).trim();
}

/** Append " (2)", " (3)"… to names already used (case-insensitive). */
export function dedupeName(name: string, taken: Set<string>): string {
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let out = name;
  for (let n = 2; taken.has(out.toLowerCase()); n++) out = `${stem} (${n})${ext}`;
  taken.add(out.toLowerCase());
  return out;
}

export interface BatchFileVars {
  /** Source file name of the item ("login.png"). */
  source: string;
  /** 1-based position in the batch. */
  n: number;
  width: number;
  height: number;
  scale: number;
  format: ExportFormat;
  style?: string;
  preset?: string;
  now: Date;
}

/**
 * The export name of one batch image. With the default pattern it keeps the
 * original name ("login.png"); a custom pattern still works, with {name} as
 * the original name and {n} as the position.
 */
export function batchFileName(pattern: string, v: BatchFileVars): string {
  const name = sanitizeFilename(baseName(v.source)) || "shotcandy";
  const p = !pattern || pattern === DEFAULT_FILENAME_PATTERN ? "{name}" : pattern;
  return formatFilename(p, {
    name,
    n: v.n,
    width: v.width,
    height: v.height,
    scale: v.scale,
    format: v.format,
    now: v.now,
    ...(v.style ? { style: v.style } : {}),
    ...(v.preset ? { preset: v.preset } : {}),
  });
}

/** Names for a whole export, in order, with collisions numbered. */
export function uniqueNames(names: readonly string[], taken: Set<string> = new Set()): string[] {
  return names.map((n) => dedupeName(n, taken));
}

/** "shotcandy-12-images-2026-09-29". */
export function batchArchiveName(count: number, now: Date): string {
  const pad = (x: number) => String(x).padStart(2, "0");
  return `shotcandy-${count}-${count === 1 ? "image" : "images"}-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
