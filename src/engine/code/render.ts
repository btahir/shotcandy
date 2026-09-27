/**
 * The "code" content kind: a snippet drawn as a window with a title bar,
 * line numbers, highlighted lines and syntax colours. Natural size comes from
 * measuring the text, so the card hugs the code; all lengths are px at 1x and
 * scale with the card. Registered with the content registry on import.
 */
import { hashString } from "../math/random";
import { registerContentRenderer } from "../render/content";
import type { Ctx2D } from "../render/env";
import { fontStack, UI_FONT_ID } from "../render/fonts";
import { measureGeneration, measureText } from "../render/measure";
import type { CodeContent } from "../scene/types";
import { categoryColor, getCodeTheme } from "./themes";

const TAB = "  ";
const DOTS = ["#ff5f57", "#febc2e", "#28c840"];

/** Key tying stored tokens to the exact code and language they came from. */
export function codeTokensKey(code: string, language: string): string {
  return `${language}:${code.length}:${hashString(code).toString(36)}`;
}

export interface CodeLayout {
  width: number;
  /** Width the code needs on its own (the window is never narrower). */
  naturalWidth: number;
  height: number;
  font: string;
  titleFont: string;
  fontSize: number;
  lineHeight: number;
  pad: number;
  headerH: number;
  gutterW: number;
  codeX: number;
  codeY: number;
  lines: [string, number][][];
}

function plainLines(code: string): [string, number][][] {
  const text = code.replace(/\r\n?/g, "\n").replace(/\t/g, TAB);
  const lines = text.split("\n");
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines.map((l) => (l ? [[l, 0]] : []));
}

/** Lines of [text, category] tokens: stored tokens when current, else plain text. */
export function codeLines(c: CodeContent): [string, number][][] {
  if (c.tokens && c.tokens.key === codeTokensKey(c.code, c.language)) {
    const lines = c.tokens.lines.map((l) =>
      l.map(([t, k]) => [t.replace(/\t/g, TAB), k] as [string, number]),
    );
    if (lines.length > 1 && lines[lines.length - 1]!.length === 0) lines.pop();
    return lines;
  }
  return plainLines(c.code);
}

const cache = new WeakMap<CodeContent, { gen: number; layout: CodeLayout }>();

const fontSizeMin = (F: number) => F * 32;

export function codeLayout(c: CodeContent): CodeLayout {
  const hit = cache.get(c);
  if (hit && hit.gen === measureGeneration()) return hit.layout;
  const F = c.fontSize;
  const font = `400 ${F}px ${fontStack("mono")}`;
  const titleFont = `600 ${Math.round(F * 0.86 * 10) / 10}px ${fontStack(UI_FONT_ID)}`;
  const lines = codeLines(c);
  const lineHeight = Math.round(F * 1.65 * 100) / 100;
  const pad = c.padding;
  const hasHeader = c.chrome !== "none" || c.title.trim().length > 0;
  const headerH = hasHeader ? Math.round(F * 2.9) : 0;
  const digits = Math.max(2, String(Math.max(1, lines.length)).length);
  const gutterW = c.lineNumbers ? measureText(font, "0".repeat(digits)) + F * 1.5 : 0;
  let codeW = 0;
  for (const line of lines) {
    let w = 0;
    for (const [t] of line) w += measureText(font, t);
    codeW = Math.max(codeW, w);
  }
  const minCode = measureText(font, "0".repeat(32));
  const titleW = c.title ? measureText(titleFont, c.title) + F * 9 : 0;
  // Never a cramped window: at least 32 font-sizes wide (480 px at 15 px), so
  // a one-line snippet still reads as a window (REVIEW r2 N12).
  const natural = Math.ceil(
    Math.max(pad * 2 + gutterW + Math.max(codeW, minCode), titleW, fontSizeMin(F)),
  );
  const width = Math.max(natural, Math.ceil(c.width ?? 0));
  const codeY = headerH ? headerH + pad * 0.55 : pad;
  const height = Math.ceil(codeY + Math.max(1, lines.length) * lineHeight + pad);
  const layout: CodeLayout = {
    width,
    naturalWidth: natural,
    height,
    font,
    titleFont,
    fontSize: F,
    lineHeight,
    pad,
    headerH,
    gutterW,
    codeX: pad + gutterW,
    codeY,
    lines,
  };
  cache.set(c, { gen: measureGeneration(), layout });
  return layout;
}

function drawCode(ctx: Ctx2D, c: CodeContent, L: CodeLayout): void {
  const theme = getCodeTheme(c.theme);
  const F = L.fontSize;
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, L.width, L.height);

  // Title bar.
  if (L.headerH) {
    const cy = L.headerH / 2 + F * 0.15;
    if (c.chrome === "mac") {
      const r = F * 0.42;
      DOTS.forEach((col, i) => {
        ctx.beginPath();
        ctx.arc(F * 1.35 + r + i * (r * 2 + F * 0.55), cy, r, 0, Math.PI * 2);
        ctx.fillStyle = col;
        ctx.fill();
      });
    }
    if (c.title) {
      ctx.font = L.titleFont;
      ctx.fillStyle = theme.title;
      ctx.textBaseline = "middle";
      if (c.chrome === "mac") {
        ctx.textAlign = "center";
        ctx.fillText(c.title, L.width / 2, cy);
      } else {
        ctx.textAlign = "left";
        ctx.fillText(c.title, L.pad, cy);
      }
    }
    if (c.chrome === "minimal") {
      ctx.fillStyle = theme.line;
      ctx.fillRect(0, L.headerH - 1, L.width, 1);
    }
  }

  // Highlighted lines.
  const hl = new Set(c.highlight);
  L.lines.forEach((_, i) => {
    if (!hl.has(i + 1)) return;
    const y = L.codeY + i * L.lineHeight;
    ctx.fillStyle = theme.highlight;
    ctx.fillRect(0, y, L.width, L.lineHeight);
    ctx.fillStyle = theme.highlightBar;
    ctx.fillRect(0, y, Math.max(2, F * 0.2), L.lineHeight);
  });

  ctx.font = L.font;
  ctx.textBaseline = "middle";
  // Line numbers.
  if (c.lineNumbers) {
    ctx.textAlign = "right";
    L.lines.forEach((_, i) => {
      ctx.fillStyle = hl.has(i + 1) ? theme.fg : theme.gutter;
      ctx.fillText(String(i + 1), L.pad + L.gutterW - F * 1.1, L.codeY + (i + 0.5) * L.lineHeight);
    });
  }
  // Code.
  ctx.textAlign = "left";
  L.lines.forEach((line, i) => {
    let x = L.codeX;
    const y = L.codeY + (i + 0.5) * L.lineHeight;
    for (const [text, cat] of line) {
      if (!text) continue;
      ctx.fillStyle = categoryColor(theme, cat);
      ctx.fillText(text, x, y);
      x += measureText(L.font, text);
    }
  });
}

registerContentRenderer<CodeContent>({
  kind: "code",
  naturalSize(c) {
    const L = codeLayout(c);
    return { width: L.width, height: L.height };
  },
  draw(ctx, c, dc) {
    const L = codeLayout(c);
    ctx.save();
    ctx.translate(dc.rect.x, dc.rect.y);
    ctx.scale(dc.rect.width / L.width, dc.rect.height / L.height);
    drawCode(ctx, c, L);
    ctx.restore();
  },
});
