/**
 * What an import does, decided before any file is read:
 *
 * - One file into a single design (or an empty editor) opens exactly as it
 *   always has: it replaces the image. That path is "single".
 * - Several files, a folder, "Add images…", or anything into a batch adds
 *   images: "batch". Screen recordings and non-images are skipped with a
 *   reason, the rest are sorted by name (natural order) and capped at the
 *   batch's room.
 */
import { fileKind } from "../input/files";
import { sortByName } from "./names";

export interface ImportContext {
  /** Images in the open batch (0 when there is none). */
  batch: number;
  /** A single design with an image is open (it joins a new batch). */
  single: boolean;
  /** That single design is a screen recording (it can't join a batch). */
  recording?: boolean;
  /** Most images a batch may hold. */
  max: number;
}

export interface ImportSource {
  file: { name: string; type: string };
  path?: string;
}

export interface Skipped {
  name: string;
  reason: string;
}

export interface ImportPlan<T extends ImportSource> {
  route: "single" | "batch";
  /** Images to decode, in order (already capped). */
  accept: T[];
  skipped: Skipped[];
  /** Images left out because the batch is full. */
  over: number;
  /** Images the batch still had room for. */
  room: number;
}

export const SKIP_VIDEO = "screen recording (open it on its own)";
export const SKIP_OTHER = "not an image";

export function planImport<T extends ImportSource>(
  files: readonly T[],
  ctx: ImportContext,
  opts: { folder?: boolean; add?: boolean } = {},
): ImportPlan<T> {
  if (files.length === 1 && !opts.folder && !opts.add && ctx.batch === 0)
    return { route: "single", accept: files.slice(), skipped: [], over: 0, room: 1 };
  const skipped: Skipped[] = [];
  const images: T[] = [];
  const sorted = sortByName(files.map((f) => ({ f, name: f.file.name, path: f.path ?? "" })));
  for (const { f } of sorted) {
    const k = fileKind(f.file);
    if (k === "image") images.push(f);
    else skipped.push({ name: f.file.name, reason: k === "video" ? SKIP_VIDEO : SKIP_OTHER });
  }
  const have = ctx.batch || (ctx.single && !ctx.recording ? 1 : 0);
  const room = Math.max(0, ctx.max - have);
  const accept = images.slice(0, room);
  return { route: "batch", accept, skipped, over: images.length - accept.length, room };
}

/** "3 not an image, 1 already added" (one line for the summary toast). */
export function summarizeSkipped(skipped: readonly Skipped[]): string {
  const counts = new Map<string, number>();
  for (const s of skipped) counts.set(s.reason, (counts.get(s.reason) ?? 0) + 1);
  return [...counts].map(([r, n]) => `${n} ${r}`).join(", ");
}
