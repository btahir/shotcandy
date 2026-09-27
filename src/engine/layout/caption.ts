/**
 * Caption card: a headline and subhead set in the canvas above the card, for
 * tall canvases (9:16, 4:5) holding a landscape screenshot, where a centred
 * card would leave half the canvas empty. The text block takes the top of the
 * canvas and the card is composed in the space below it. Pure: measured with
 * the engine's text measurement, drawn by render.ts.
 */
import { fontStack } from "../render/fonts";
import { measureText, wrapText } from "../render/measure";
import type { AssetResolver } from "../assets/types";
import { isDark, mixColors } from "../math/color";
import type { Palette } from "../palette/extract";
import { resolveAutoFill } from "../palette/suggest";
import type { BackgroundFill, CaptionSpec, Scene } from "../scene/types";

export interface CaptionLine {
  text: string;
  /** Baseline-centred y of the line, canvas px at scale 1. */
  y: number;
}

export interface CaptionBlock {
  font: string;
  px: number;
  weight: number;
  lines: CaptionLine[];
  role: "headline" | "subhead";
  /** Block box (canvas px at scale 1), for hit-testing and inline editing. */
  box: { x: number; y: number; width: number; height: number };
}

export interface CaptionLayout {
  /** Height taken from the top of the canvas (canvas px at scale 1). */
  height: number;
  x: number;
  width: number;
  align: CaptionSpec["align"];
  blocks: CaptionBlock[];
}

/** Whether the scene shows a caption (enabled and with some text). */
export function captionActive(scene: Scene): boolean {
  const c = scene.caption;
  return !!c && c.enabled && (c.headline.trim().length > 0 || c.subhead.trim().length > 0);
}

/**
 * Lay the caption out for a canvas W x H. Type sizes follow the canvas's short
 * side (like the App Store sets), headlines wrap to at most 3 lines, subheads
 * to 3.
 */
export function captionLayout(c: CaptionSpec, W: number, H: number): CaptionLayout {
  const short = Math.min(W, H);
  const margin = short * 0.085;
  const hp = Math.round(short * 0.078 * c.size);
  const sp = Math.round(short * 0.04 * c.size);
  const maxW = W - margin * 2;
  const hFont = `800 ${hp}px ${fontStack(c.font)}`;
  const sFont = `500 ${sp}px ${fontStack("sans")}`;
  const head = c.headline.trim() ? wrapText(hFont, c.headline.trim(), maxW).slice(0, 3) : [];
  const sub = c.subhead.trim() ? wrapText(sFont, c.subhead.trim(), maxW).slice(0, 3) : [];
  const hLh = hp * 1.14;
  const sLh = sp * 1.35;
  const gap = head.length && sub.length ? sp * 0.75 : 0;
  let y = margin * 1.15;
  const blocks: CaptionBlock[] = [];
  const widest = (font: string, lines: string[]) =>
    Math.max(0, ...lines.map((l) => measureText(font, l)));
  if (head.length) {
    const h = head.length * hLh;
    const w = Math.min(maxW, widest(hFont, head));
    blocks.push({
      role: "headline",
      font: hFont,
      px: hp,
      weight: 800,
      lines: head.map((text, i) => ({ text, y: y + (i + 0.5) * hLh })),
      box: { x: c.align === "center" ? (W - w) / 2 : margin, y, width: w, height: h },
    });
    y += h + gap;
  }
  if (sub.length) {
    const h = sub.length * sLh;
    const w = Math.min(maxW, widest(sFont, sub));
    blocks.push({
      role: "subhead",
      font: sFont,
      px: sp,
      weight: 500,
      lines: sub.map((text, i) => ({ text, y: y + (i + 0.5) * sLh })),
      box: { x: c.align === "center" ? (W - w) / 2 : margin, y, width: w, height: h },
    });
    y += h;
  }
  // The card's own padding supplies the gap below the text.
  return {
    height: blocks.length ? y + margin * 0.15 : 0,
    x: margin,
    width: maxW,
    align: c.align,
    blocks,
  };
}

/** Default copy for a new caption. */
export const DEFAULT_CAPTION: CaptionSpec = {
  enabled: true,
  headline: "Say what’s new",
  subhead: "One line on why it matters",
  font: "display",
  align: "center",
  color: "auto",
  size: 1,
};

/** Minimal 2D context surface the caption needs (canvas, OffscreenCanvas, Skia). */
interface CaptionCtx {
  font: string;
  fillStyle: unknown;
  globalAlpha: number;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  fillText(text: string, x: number, y: number): void;
  save(): void;
  restore(): void;
}

/** A representative colour of a background fill (for choosing caption ink). */
export function fillTone(
  fill: BackgroundFill,
  palette: Palette | null,
  assets?: AssetResolver,
): string {
  const f = fill.kind === "auto" ? resolveAutoFill(fill, palette) : fill;
  const avg = (cs: string[]) =>
    cs.reduce((acc, c, i) => (i === 0 ? c : mixColors(acc, c, 1 / (i + 1))), cs[0] ?? "#ffffff");
  switch (f.kind) {
    case "solid":
      return f.color;
    case "linear":
    case "radial":
    case "conic":
      return avg(f.stops.map((s) => s.color));
    case "mesh":
      return mixColors(f.base, avg(f.points.map((p) => p.color)), 0.5);
    case "image": {
      const p = assets?.get(f.assetId)?.palette;
      return p ? p.dominant.hex : "#808080";
    }
    default:
      return "#ffffff";
  }
}

/** Draw the caption (call after the background, before the card). */
export function drawCaption(
  ctx: CaptionCtx,
  spec: CaptionSpec,
  cap: CaptionLayout,
  scale: number,
  canvasW: number,
  tone: string,
): void {
  if (!cap.blocks.length) return;
  let color: string;
  let subAlpha = 0.78;
  if (spec.color === "auto") {
    const light = isDark(tone);
    color = light ? "#ffffff" : "#2a1f1a";
    subAlpha = light ? 0.86 : 0.72;
  } else color = spec.color;
  ctx.save();
  ctx.textBaseline = "middle";
  ctx.textAlign = cap.align === "center" ? "center" : "left";
  ctx.fillStyle = color;
  const x = cap.align === "center" ? (canvasW * scale) / 2 : cap.x * scale;
  for (const b of cap.blocks) {
    ctx.font = b.font.replace(/(\d+(?:\.\d+)?)px/, (_, v: string) => `${Number(v) * scale}px`);
    ctx.globalAlpha = b.role === "subhead" ? subAlpha : 1;
    for (const l of b.lines) ctx.fillText(l.text, x, l.y * scale);
  }
  ctx.restore();
}
