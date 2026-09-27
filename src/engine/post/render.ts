/**
 * The "post" content kind: a social post or testimonial card the user types
 * in (no network, no platform branding). Text is measured and wrapped for
 * layout, so the card hugs its words; lengths are px at 1x.
 */
import { type AssetResolver, pickImage } from "../assets/types";
import { hashString } from "../math/random";
import { registerContentRenderer } from "../render/content";
import type { Ctx2D } from "../render/env";
import { fontStack, UI_FONT_ID } from "../render/fonts";
import { measureGeneration, measureText, wrapText } from "../render/measure";
import type { PostContent } from "../scene/types";
import { type PostTheme, getPostTheme } from "./themes";

const RICH = /(#[\p{L}\p{N}_]+|@[\w.]+\w|https?:\/\/\S+)/gu;

export interface PostLayout {
  width: number;
  height: number;
  pad: number;
  bodyFont: string;
  nameFont: string;
  metaFont: string;
  lineHeight: number;
  lines: string[];
  textY: number;
  avatar: number;
  footerY: number | null;
}

const fontsOf = (c: PostContent) => {
  const sans = fontStack("sans");
  if (c.variant === "testimonial") {
    return {
      body: `600 23px ${fontStack("display")}`,
      name: `700 16.5px ${fontStack(UI_FONT_ID)}`,
      meta: `500 14.5px ${fontStack(UI_FONT_ID)}`,
      lh: 33,
    };
  }
  return {
    body: `400 20px ${sans}`,
    name: `700 17.5px ${fontStack(UI_FONT_ID)}`,
    meta: `500 15px ${fontStack(UI_FONT_ID)}`,
    lh: 30,
  };
};

function hasMetrics(c: PostContent): boolean {
  return c.variant === "social" && !!(c.metrics.replies || c.metrics.reposts || c.metrics.likes);
}

const cache = new WeakMap<PostContent, { gen: number; layout: PostLayout }>();

export function postLayout(c: PostContent): PostLayout {
  const hit = cache.get(c);
  if (hit && hit.gen === measureGeneration()) return hit.layout;
  const f = fontsOf(c);
  const W = Math.round(c.width);
  let layout: PostLayout;
  if (c.variant === "testimonial") {
    const pad = 40;
    const lines = wrapText(f.body, c.text || " ", W - pad * 2);
    const textY = pad + 34 + 22;
    const avatar = 46;
    const height = textY + lines.length * f.lh + 28 + avatar + pad;
    layout = {
      width: W,
      height,
      pad,
      bodyFont: f.body,
      nameFont: f.name,
      metaFont: f.meta,
      lineHeight: f.lh,
      lines,
      textY,
      avatar,
      footerY: null,
    };
  } else {
    const pad = 32;
    const avatar = 52;
    const lines = wrapText(f.body, c.text || " ", W - pad * 2);
    const textY = pad + avatar + 18;
    const textEnd = textY + lines.length * f.lh;
    const footerY = hasMetrics(c) ? textEnd + 20 : null;
    const height = (footerY !== null ? footerY + 1 + 18 + 22 : textEnd) + pad;
    layout = {
      width: W,
      height,
      pad,
      bodyFont: f.body,
      nameFont: f.name,
      metaFont: f.meta,
      lineHeight: f.lh,
      lines,
      textY,
      avatar,
      footerY,
    };
  }
  cache.set(c, { gen: measureGeneration(), layout });
  return layout;
}

// ---------------------------------------------------------------------------

const AVATAR_GRADIENTS: [string, string][] = [
  ["#ff9ab5", "#ff4f7b"],
  ["#ffc98f", "#ff8a3c"],
  ["#9fe8c8", "#17a071"],
  ["#a9c8ff", "#4f7bff"],
  ["#cdbbff", "#8b6cff"],
  ["#ffe07a", "#f0a500"],
];

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const first = Array.from(parts[0]!)[0] ?? "";
  const last = parts.length > 1 ? (Array.from(parts[parts.length - 1]!)[0] ?? "") : "";
  return (first + last).toUpperCase();
}

function drawAvatar(
  ctx: Ctx2D,
  c: PostContent,
  assets: AssetResolver,
  x: number,
  y: number,
  d: number,
  px: number,
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + d / 2, y + d / 2, d / 2, 0, Math.PI * 2);
  ctx.clip();
  const src = c.avatarAssetId ? assets.get(c.avatarAssetId) : undefined;
  const img = src ? pickImage(src, d * px) : undefined;
  if (src && img) {
    // Cover-crop to a square.
    const s = Math.min(src.width, src.height);
    const sx = ((src.width - s) / 2) * (img.width / src.width);
    const sy = ((src.height - s) / 2) * (img.height / src.height);
    const ss = s * (img.width / src.width);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img.image, sx, sy, ss, ss, x, y, d, d);
  } else {
    const [a, b] = AVATAR_GRADIENTS[hashString(c.name || "?") % AVATAR_GRADIENTS.length]!;
    const g = ctx.createLinearGradient(x, y, x + d, y + d);
    g.addColorStop(0, a);
    g.addColorStop(1, b);
    ctx.fillStyle = g;
    ctx.fillRect(x, y, d, d);
    ctx.fillStyle = "#ffffff";
    ctx.font = `800 ${Math.round(d * 0.38)}px ${fontStack("display")}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initials(c.name), x + d / 2, y + d / 2 + d * 0.02);
  }
  ctx.restore();
}

/**
 * Split wrapped lines into [text, accent?] runs for #tags, @mentions and
 * links, matched on the whole text so a URL broken across lines stays in the
 * accent colour on every line (REVIEW r2 N2).
 */
export function richRuns(text: string, lines: string[]): [string, boolean][][] {
  const accent = new Uint8Array(text.length);
  RICH.lastIndex = 0;
  for (const m of text.matchAll(RICH)) accent.fill(1, m.index!, m.index! + m[0].length);
  let cursor = 0;
  return lines.map((line) => {
    if (!line) return [];
    const at = text.indexOf(line, cursor);
    if (at < 0) return [[line, false]];
    cursor = at + line.length;
    const runs: [string, boolean][] = [];
    for (let i = 0; i < line.length; i++) {
      const on = accent[at + i] === 1;
      const last = runs[runs.length - 1];
      if (last && last[1] === on) last[0] += line[i];
      else runs.push([line[i]!, on]);
    }
    return runs;
  });
}

/** Draw a line's runs, accent runs in the accent colour. */
function drawRich(
  ctx: Ctx2D,
  font: string,
  runs: [string, boolean][],
  x: number,
  y: number,
  color: string,
  accent: string,
) {
  ctx.font = font;
  ctx.textAlign = "left";
  let cx = x;
  for (const [part, on] of runs) {
    ctx.fillStyle = on ? accent : color;
    ctx.fillText(part, cx, y);
    cx += measureText(font, part);
  }
}

function star(ctx: Ctx2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.46 : r;
    const px = cx + Math.cos(a) * rr;
    const py = cy + Math.sin(a) * rr;
    if (i) ctx.lineTo(px, py);
    else ctx.moveTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

function quoteMark(ctx: Ctx2D, x: number, y: number, s: number, color: string) {
  // Two rounded commas, drawn (no font glyph), 44 x 34 at s = 1.
  ctx.fillStyle = color;
  for (const ox of [0, 24]) {
    ctx.beginPath();
    ctx.arc(x + (ox + 10) * s, y + 22 * s, 10 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + (ox + 1) * s, y + 20 * s);
    ctx.quadraticCurveTo(x + (ox + 1) * s, y + 4 * s, x + (ox + 16) * s, y);
    ctx.lineTo(x + (ox + 17) * s, y + 4 * s);
    ctx.quadraticCurveTo(x + (ox + 9) * s, y + 8 * s, x + (ox + 9) * s, y + 16 * s);
    ctx.closePath();
    ctx.fill();
  }
}

function icon(ctx: Ctx2D, kind: "reply" | "repost" | "like", x: number, y: number, color: string) {
  // 20 px outline icons, our own geometry.
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.8;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  if (kind === "reply") {
    ctx.moveTo(4, 4.5);
    ctx.arcTo(16.5, 4.5, 16.5, 13, 3.5);
    ctx.arcTo(16.5, 13, 8, 13, 3.5);
    ctx.lineTo(8, 13);
    ctx.lineTo(4.5, 16.5);
    ctx.lineTo(4.5, 13);
    ctx.arcTo(2, 13, 2, 4.5, 2.5);
    ctx.arcTo(2, 4.5, 16.5, 4.5, 2.5);
    ctx.closePath();
  } else if (kind === "repost") {
    ctx.moveTo(3, 9);
    ctx.lineTo(3, 7);
    ctx.arcTo(3, 4.5, 6, 4.5, 2.5);
    ctx.lineTo(15.5, 4.5);
    ctx.moveTo(13, 2);
    ctx.lineTo(15.5, 4.5);
    ctx.lineTo(13, 7);
    ctx.moveTo(17, 11);
    ctx.lineTo(17, 13);
    ctx.arcTo(17, 15.5, 14, 15.5, 2.5);
    ctx.lineTo(4.5, 15.5);
    ctx.moveTo(7, 13);
    ctx.lineTo(4.5, 15.5);
    ctx.lineTo(7, 18);
  } else {
    ctx.moveTo(10, 16.8);
    ctx.bezierCurveTo(4, 12.8, 2, 10, 2, 7.4);
    ctx.bezierCurveTo(2, 5, 3.9, 3.2, 6.1, 3.2);
    ctx.bezierCurveTo(7.8, 3.2, 9.2, 4.2, 10, 5.6);
    ctx.bezierCurveTo(10.8, 4.2, 12.2, 3.2, 13.9, 3.2);
    ctx.bezierCurveTo(16.1, 3.2, 18, 5, 18, 7.4);
    ctx.bezierCurveTo(18, 10, 16, 12.8, 10, 16.8);
    ctx.closePath();
  }
  ctx.stroke();
  ctx.restore();
}

function ellipsize(font: string, text: string, max: number): string {
  if (measureText(font, text) <= max) return text;
  const chars = Array.from(text);
  while (chars.length && measureText(font, chars.join("") + "…") > max) chars.pop();
  return chars.join("") + "…";
}

function drawPost(
  ctx: Ctx2D,
  c: PostContent,
  L: PostLayout,
  t: PostTheme,
  assets: AssetResolver,
  px: number,
) {
  ctx.fillStyle = t.bg;
  ctx.fillRect(0, 0, L.width, L.height);
  ctx.textBaseline = "middle";
  const inner = L.width - L.pad * 2;

  if (c.variant === "testimonial") {
    quoteMark(ctx, L.pad, L.pad, 1, c.accent);
    if (c.rating > 0) {
      ctx.fillStyle = t.star;
      for (let i = 0; i < c.rating; i++)
        star(ctx, L.width - L.pad - 9 - (c.rating - 1 - i) * 23, L.pad + 17, 9.5);
    }
    richRuns(c.text, L.lines).forEach((runs, i) =>
      drawRich(ctx, L.bodyFont, runs, L.pad, L.textY + (i + 0.5) * L.lineHeight, t.text, c.accent),
    );
    const ay = L.height - L.pad - L.avatar;
    drawAvatar(ctx, c, assets, L.pad, ay, L.avatar, px);
    const tx = L.pad + L.avatar + 14;
    const maxT = L.width - tx - L.pad;
    ctx.textAlign = "left";
    ctx.fillStyle = t.text;
    ctx.font = L.nameFont;
    ctx.fillText(ellipsize(L.nameFont, c.name, maxT), tx, ay + (c.handle ? 14 : L.avatar / 2));
    if (c.handle) {
      ctx.fillStyle = t.muted;
      ctx.font = L.metaFont;
      ctx.fillText(ellipsize(L.metaFont, c.handle, maxT), tx, ay + 34);
    }
    return;
  }

  // Social post header: avatar, name, handle · date.
  drawAvatar(ctx, c, assets, L.pad, L.pad, L.avatar, px);
  const tx = L.pad + L.avatar + 14;
  const maxT = L.width - tx - L.pad;
  ctx.textAlign = "left";
  ctx.fillStyle = t.text;
  ctx.font = L.nameFont;
  ctx.fillText(ellipsize(L.nameFont, c.name || "Your name", maxT), tx, L.pad + 15);
  const meta = [c.handle, c.date].filter(Boolean).join(" · ");
  if (meta) {
    ctx.fillStyle = t.muted;
    ctx.font = L.metaFont;
    ctx.fillText(ellipsize(L.metaFont, meta, maxT), tx, L.pad + 38);
  }
  richRuns(c.text, L.lines).forEach((runs, i) =>
    drawRich(ctx, L.bodyFont, runs, L.pad, L.textY + (i + 0.5) * L.lineHeight, t.text, c.accent),
  );
  if (L.footerY !== null) {
    ctx.fillStyle = t.line;
    ctx.fillRect(L.pad, L.footerY, inner, 1);
    const y = L.footerY + 19;
    let x = L.pad;
    const items: ["reply" | "repost" | "like", string][] = [
      ["reply", c.metrics.replies],
      ["repost", c.metrics.reposts],
      ["like", c.metrics.likes],
    ];
    ctx.font = `600 15px ${fontStack(UI_FONT_ID)}`;
    for (const [kind, value] of items) {
      if (!value) continue;
      icon(ctx, kind, x, y + 1, t.muted);
      ctx.fillStyle = t.muted;
      ctx.fillText(value, x + 27, y + 11);
      x += 27 + measureText(ctx.font, value) + 34;
    }
  }
}

registerContentRenderer<PostContent>({
  kind: "post",
  naturalSize(c) {
    const L = postLayout(c);
    return { width: L.width, height: L.height };
  },
  draw(ctx, c, dc) {
    const L = postLayout(c);
    ctx.save();
    ctx.translate(dc.rect.x, dc.rect.y);
    const s = dc.rect.width / L.width;
    ctx.scale(s, dc.rect.height / L.height);
    drawPost(ctx, c, L, getPostTheme(c.theme), dc.assets, dc.pixelRatio * s);
    ctx.restore();
  },
});
