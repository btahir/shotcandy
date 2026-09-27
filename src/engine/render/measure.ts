/**
 * Text measurement for layout. Content kinds made of text (code, posts) need
 * their natural size before anything is drawn, so layout measures with a
 * shared scratch canvas. Results are memoized per (font, text); clear the
 * memo after web fonts finish loading (`clearTextMeasureCache`).
 *
 * The scratch canvas comes from the default environment (OffscreenCanvas in
 * pages and workers). Node tests inject theirs with `setMeasureEnvironment`.
 */
import { type Ctx2D, type RenderEnvironment, defaultEnvironment, get2d } from "./env";

let env: RenderEnvironment | null = null;
let ctx: Ctx2D | null = null;
let failed = false;
const memo = new Map<string, number>();
const MAX_MEMO = 20_000;
let generation = 0;

/** Bumped whenever measurements may have changed (fonts loaded, env swapped). */
export function measureGeneration(): number {
  return generation;
}

export function setMeasureEnvironment(e: RenderEnvironment | null): void {
  env = e;
  ctx = null;
  failed = false;
  memo.clear();
  generation++;
}

export function clearTextMeasureCache(): void {
  memo.clear();
  generation++;
}

function context(): Ctx2D | null {
  if (ctx || failed) return ctx;
  try {
    ctx = get2d((env ?? defaultEnvironment()).createCanvas(4, 4));
  } catch {
    failed = true;
  }
  return ctx;
}

/** Width of `text` in px for a CSS font string (e.g. `500 16px "Geist Mono"`). */
export function measureText(font: string, text: string): number {
  if (!text) return 0;
  const key = `${font}\u0000${text}`;
  const hit = memo.get(key);
  if (hit !== undefined) return hit;
  const c = context();
  let w: number;
  if (c) {
    c.font = font;
    w = c.measureText(text).width;
  } else {
    // No canvas at all (shouldn't happen in browsers): a monospace-ish estimate.
    const size = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 16);
    w = Array.from(text).length * size * 0.6;
  }
  if (memo.size > MAX_MEMO) memo.clear();
  memo.set(key, w);
  return w;
}

/**
 * Greedy word wrap to `maxWidth`. Keeps explicit newlines, breaks overlong
 * words by character. Returns the lines (without trailing spaces).
 */
export function wrapText(font: string, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    if (!para) {
      out.push("");
      continue;
    }
    const words = para.split(/(\s+)/).filter((w) => w.length);
    let line = "";
    for (const word of words) {
      const next = line + word;
      if (measureText(font, next.trimEnd()) <= maxWidth || !line.trim()) {
        if (measureText(font, next.trimEnd()) <= maxWidth) {
          line = next;
          continue;
        }
        // A single word wider than the line: break it by character.
        let chunk = line;
        for (const ch of Array.from(word)) {
          if (measureText(font, (chunk + ch).trimEnd()) > maxWidth && chunk.trim()) {
            out.push(chunk.trimEnd());
            chunk = "";
          }
          chunk += ch;
        }
        line = chunk;
        continue;
      }
      out.push(line.trimEnd());
      line = /^\s+$/.test(word) ? "" : word;
    }
    out.push(line.trimEnd());
  }
  return out;
}
