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

/** Characters a long token may break after (URLs, paths, hyphenated words). */
const SOFT_BREAK = /[/\-_.?&=#:,]/;

/**
 * Break one token that is wider than the line into pieces that fit: prefer
 * breaking after `/ - _ . ?` and friends, and fall back to any character (the
 * canvas equivalent of CSS `overflow-wrap: anywhere`). Never returns a piece
 * wider than `maxWidth` unless a single character is.
 */
function breakToken(font: string, token: string, maxWidth: number, lead = ""): string[] {
  const chars = Array.from(token);
  const out: string[] = [];
  let start = 0;
  let first = true;
  while (start < chars.length) {
    const prefix = first ? lead : "";
    let end = start;
    let soft = -1;
    while (end < chars.length) {
      const piece = prefix + chars.slice(start, end + 1).join("");
      if (measureText(font, piece) > maxWidth && end > start) break;
      if (SOFT_BREAK.test(chars[end]!)) soft = end;
      end++;
    }
    // Break after a soft character when one sits in the back half of the piece.
    if (end < chars.length && soft >= start && soft - start >= (end - start) / 2) end = soft + 1;
    if (end === start) end = start + 1;
    out.push(prefix + chars.slice(start, end).join(""));
    start = end;
    first = false;
  }
  return out;
}

/**
 * Greedy word wrap to `maxWidth`. Keeps explicit newlines, breaks overlong
 * words (URLs) at soft characters, else by character. Returns the lines (without trailing spaces).
 */
export function wrapText(font: string, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  const fits = (s: string) => measureText(font, s.trimEnd()) <= maxWidth;
  for (const para of text.split("\n")) {
    if (!para) {
      out.push("");
      continue;
    }
    const words = para.split(/(\s+)/).filter((w) => w.length);
    let line = "";
    for (const word of words) {
      if (/^\s+$/.test(word)) {
        if (line) line += word;
        continue;
      }
      if (fits(line + word)) {
        line += word;
        continue;
      }
      if (line.trim() && fits(word)) {
        out.push(line.trimEnd());
        line = word;
        continue;
      }
      // The word is wider than a whole line: continue the current line with
      // as much of it as fits, then carry on in line-sized pieces.
      const lead = line.trim() ? line : "";
      const pieces = breakToken(font, word, maxWidth, lead);
      if (lead && measureText(font, pieces[0]!) > maxWidth) {
        out.push(line.trimEnd());
        pieces.splice(0, pieces.length, ...breakToken(font, word, maxWidth));
      }
      for (let i = 0; i < pieces.length - 1; i++) out.push(pieces[i]!.trimEnd());
      line = pieces[pieces.length - 1]!;
    }
    out.push(line.trimEnd());
  }
  return out;
}
