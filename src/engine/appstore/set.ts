/**
 * App Store screenshot sets: 3-10 slides at an exact App Store size, each
 * with a headline, a subhead and a screenshot in a device frame, sharing one
 * style (a template scene: background, frame, shadow) and optionally one
 * background that flows across all slides.
 *
 * `slideScene` turns (set, template, index) into an ordinary Scene, so each
 * slide renders, previews and exports through the unchanged pipeline. Pure
 * and deterministic (text is measured with the engine's measurement module).
 */
import type { AssetResolver } from "../assets/types";
import { getBackgroundPreset } from "../presets/backgrounds";
import { SIZE_PRESETS, rotateSize } from "../presets/sizes";
import { fontStack } from "../render/fonts";
import { measureText, wrapText } from "../render/measure";
import { layoutScene } from "../render/render";
import { createScene } from "../scene/defaults";
import { deepMerge } from "../scene/patch";
import type { Color, Content, CropRect, Scene, StylePatch, TextAnnotation } from "../scene/types";

export const SET_MIN_SLIDES = 3;
export const SET_MAX_SLIDES = 10;

export interface AppStoreSlide {
  id: string;
  headline: string;
  subhead: string;
  /** Screenshot asset, or null for a placeholder screen. */
  assetId: string | null;
  /** Part of the screenshot to show (normalized), e.g. a phone-shaped crop of a landscape shot. */
  crop?: { x: number; y: number; width: number; height: number };
}

export interface SetText {
  font: "display" | "sans";
  /** Scales headline and subhead (0.7..1.4). */
  size: number;
  color: Color;
  subColor: Color;
  position: "top" | "bottom";
  align: "center" | "left";
}

export interface AppStoreSet {
  version: 1;
  /** An App Store size preset id (presets/sizes.ts, group "appstore"). */
  sizePresetId: string;
  landscape: boolean;
  /** Paint the background across all slides so it flows between them. */
  flow: boolean;
  /** "fit": the whole device shows; "bleed": bigger, running off the edge. */
  device: "fit" | "bleed";
  text: SetText;
  slides: AppStoreSlide[];
  /** Set style preset last applied (informational). */
  styleId?: string;
}

export const APPSTORE_SIZES = SIZE_PRESETS.filter((p) => p.group === "appstore");

export function setCanvasSize(set: AppStoreSet): { width: number; height: number } {
  const preset = APPSTORE_SIZES.find((p) => p.id === set.sizePresetId) ?? APPSTORE_SIZES[0]!;
  const size = set.landscape ? rotateSize(preset.size) : preset.size;
  return size.kind === "fixed"
    ? { width: size.width, height: size.height }
    : { width: 1320, height: 2868 };
}

export function isTabletSize(id: string): boolean {
  return id.includes("ipad");
}

let seq = 0;
/** Slide ids only need to be unique within a set; callers may pass their own. */
export function newSlideId(salt = ""): string {
  seq++;
  return `s${salt}${seq.toString(36)}`;
}

const HEADLINES: [string, string][] = [
  ["Your day, beautifully planned", "Everything you need, one tap away"],
  ["Habits that actually stick", "Gentle streaks and reminders"],
  ["See your progress", "Clear charts, no clutter"],
  ["Share with friends", "Stay motivated together"],
  ["Private by design", "Your data stays on your phone"],
];

export function createSet(slides = 5): AppStoreSet {
  return {
    version: 1,
    styleId: "set-sherbet",
    sizePresetId: "appstore-iphone-69",
    landscape: false,
    flow: true,
    device: "fit",
    text: {
      font: "display",
      size: 1,
      color: "#2a1f1a",
      subColor: "#6b5a4e",
      position: "top",
      align: "center",
    },
    slides: Array.from(
      { length: Math.max(SET_MIN_SLIDES, Math.min(SET_MAX_SLIDES, slides)) },
      (_, i) => ({
        id: newSlideId("i"),
        headline: HEADLINES[i % HEADLINES.length]![0],
        subhead: HEADLINES[i % HEADLINES.length]![1],
        assetId: null,
      }),
    ),
  };
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

export interface SetStyle {
  id: string;
  name: string;
  text: Pick<SetText, "color" | "subColor">;
  patch: StylePatch;
}

function setPatch(bg: string, frameTheme: "light" | "dark", shadow = "float"): StylePatch {
  const b = getBackgroundPreset(bg);
  return {
    canvas: { padding: 60 },
    background: b ? { fill: b.fill, grain: { amount: b.grain.amount } } : undefined,
    card: {
      frame: { id: "phone", theme: frameTheme },
      shadow: { preset: shadow, strength: 1 },
      tilt: { rotateX: 0, rotateY: 0, rotateZ: 0 },
      border: { width: 0 },
      inset: { width: 0 },
    },
  };
}

export const SET_STYLES: SetStyle[] = [
  {
    id: "set-sherbet",
    name: "Sherbet",
    text: { color: "#3a1622", subColor: "#7a4150" },
    patch: setPatch("sherbet", "dark"),
  },
  {
    id: "set-grape",
    name: "Grape Soda",
    text: { color: "#ffffff", subColor: "#e3d9ff" },
    patch: setPatch("grape-soda", "dark"),
  },
  {
    id: "set-mint",
    name: "Mint Julep",
    text: { color: "#12352a", subColor: "#3d6a5a" },
    patch: setPatch("mint-julep", "dark"),
  },
  {
    id: "set-aurora",
    name: "Aurora",
    text: { color: "#1f1640", subColor: "#4b3f7a" },
    patch: setPatch("aurora-pop", "light"),
  },
  {
    id: "set-licorice",
    name: "Licorice",
    text: { color: "#ffffff", subColor: "#c9bfb8" },
    patch: setPatch("licorice-gradient", "light"),
  },
  {
    id: "set-paper",
    name: "Paper",
    text: { color: "#2a1f1a", subColor: "#6b5a4e" },
    patch: setPatch("paper", "dark", "soft"),
  },
];

export function getSetStyle(id: string): SetStyle | undefined {
  return SET_STYLES.find((s) => s.id === id);
}

/** The shared style every slide starts from (background, frame, shadow). */
export function createSetTemplate(): Scene {
  const st = SET_STYLES[0]!;
  return deepMerge(
    createScene({ meta: { name: "appstore", stylePresetId: st.id } }),
    st.patch as never,
  );
}

// ---------------------------------------------------------------------------
// Slides -> scenes
// ---------------------------------------------------------------------------

function placeholderFor(set: AppStoreSet): Content {
  const tablet = isTabletSize(set.sizePresetId);
  const w = tablet ? 2048 : 1290;
  const h = tablet ? 2732 : 2796;
  return set.landscape
    ? { kind: "placeholder", width: h, height: w, color: "#f7f1ea" }
    : { kind: "placeholder", width: w, height: h, color: "#f7f1ea" };
}

interface TextBlock {
  lines: string[];
  px: number;
  lh: number;
}

function textBlocks(set: AppStoreSet, slide: AppStoreSlide, W: number, H: number) {
  const t = set.text;
  const short = Math.min(W, H);
  const hp = Math.round(short * 0.074 * t.size);
  const sp = Math.round(short * 0.04 * t.size);
  const maxW = W * (set.landscape ? 0.62 : 0.84);
  const hFont = `800 ${hp}px ${fontStack(t.font)}`;
  const sFont = `500 ${sp}px ${fontStack("sans")}`;
  const headAll = slide.headline.trim() ? wrapText(hFont, slide.headline.trim(), maxW) : [];
  const head: TextBlock = {
    lines: headAll.slice(0, 4),
    px: hp,
    lh: hp * 1.2,
  };
  const sub: TextBlock = {
    lines: slide.subhead.trim() ? wrapText(sFont, slide.subhead.trim(), maxW).slice(0, 4) : [],
    px: sp,
    lh: sp * 1.2,
  };
  const gap = head.lines.length && sub.lines.length ? sp * 0.8 : 0;
  const height = head.lines.length * head.lh + gap + sub.lines.length * sub.lh;
  return { head, sub, gap, height, maxW, hFont, headLines: headAll.length };
}

/** Lines the slide's headline wraps to (uncapped), for the "keep it to 3 lines" hint. */
export function headlineLineCount(set: AppStoreSet, slide: AppStoreSlide): number {
  const { width: W, height: H } = setCanvasSize(set);
  return textBlocks(set, slide, W, H).headLines;
}

/**
 * Height reserved for the text on every slide: the tallest block in the set,
 * so devices start at the same y on every slide however long each headline is.
 */
export function reservedTextHeight(set: AppStoreSet): number {
  const { width: W, height: H } = setCanvasSize(set);
  return Math.max(0, ...set.slides.map((sl) => textBlocks(set, sl, W, H).height));
}

/** Whether a screenshot's shape fights the set's orientation (landscape shot in a portrait set). */
export function orientationMismatch(
  set: AppStoreSet,
  size: { width: number; height: number },
): boolean {
  return set.landscape ? size.height > size.width * 1.05 : size.width > size.height * 1.05;
}

/** A centred crop of a screenshot with the device screen's proportions ("Crop to phone"). */
export function deviceCrop(set: AppStoreSet, size: { width: number; height: number }): CropRect {
  const tablet = isTabletSize(set.sizePresetId);
  const ratio = (tablet ? 2732 / 2048 : 2796 / 1290) ** (set.landscape ? -1 : 1); // h / w
  const srcRatio = size.height / size.width;
  if (srcRatio < ratio) {
    const w = size.height / ratio / size.width;
    return { x: (1 - w) / 2, y: 0, width: w, height: 1 };
  }
  const h = (size.width * ratio) / size.height;
  return { x: 0, y: 0, width: 1, height: h };
}

/**
 * The scene for slide `index`. `template` supplies the shared style;
 * `assets` resolves screenshot sizes for layout.
 */
export function slideScene(
  set: AppStoreSet,
  template: Scene,
  index: number,
  assets: AssetResolver,
): Scene {
  const slide = set.slides[index] ?? set.slides[0]!;
  const { width: W, height: H } = setCanvasSize(set);
  const count = set.slides.length;
  const content: Content =
    slide.assetId && assets.get(slide.assetId)
      ? { kind: "image", assetId: slide.assetId, ...(slide.crop ? { crop: slide.crop } : {}) }
      : placeholderFor(set);
  let scene: Scene = {
    ...template,
    canvas: { size: { kind: "fixed", width: W, height: H }, padding: template.canvas.padding },
    background: {
      ...template.background,
      ...(set.flow && count > 1 ? { span: { index, count } } : {}),
    },
    content,
    card: { ...template.card, transform: { scale: 1, offsetX: 0, offsetY: 0 } },
    annotations: [],
    meta: { ...template.meta, name: `slide-${index + 1}` },
  };
  if (!set.flow) {
    const { span: _s, ...bg } = scene.background;
    scene = { ...scene, background: bg };
  }

  // Region for the device: below (or above) the text block. Every slide
  // reserves the set's tallest text block (text top-aligned inside it), so the
  // devices line up across slides.
  const tb = textBlocks(set, slide, W, H);
  const reserved = reservedTextHeight(set);
  const margin = Math.min(W, H) * 0.075;
  const textTop = set.text.position === "top" ? margin : H - margin - reserved;
  const textGap = reserved ? Math.min(W, H) * 0.06 : 0;
  const region =
    set.text.position === "top"
      ? {
          y0: textTop + reserved + textGap,
          y1: set.device === "bleed" ? H + H * 0.2 : H - margin * 0.8,
        }
      : { y0: set.device === "bleed" ? -H * 0.2 : margin * 0.8, y1: textTop - textGap };
  const regionW = W - margin * 2;

  // Fit the card (at scale 1) into the region.
  const base = layoutScene(scene, assets);
  const xs = base.cardQuad.map((p) => p.x);
  const ys = base.cardQuad.map((p) => p.y);
  const bw = Math.max(...xs) - Math.min(...xs);
  const bh = Math.max(...ys) - Math.min(...ys);
  const regionH = Math.max(1, region.y1 - region.y0);
  let s = Math.min(regionW / bw, regionH / bh);
  if (set.device === "bleed")
    s = Math.min((W * (set.landscape ? 0.62 : 0.8)) / bw, (regionH * 1.4) / bh);
  const cardH = bh * s;
  const cy =
    set.device === "bleed"
      ? set.text.position === "top"
        ? region.y0 + cardH / 2
        : region.y1 - cardH / 2
      : set.text.position === "top"
        ? region.y0 + cardH / 2
        : region.y1 - cardH / 2;
  const cx0 = (Math.max(...xs) + Math.min(...xs)) / 2;
  scene = {
    ...scene,
    card: {
      ...scene.card,
      transform: { scale: s, offsetX: (W / 2 - cx0) / W, offsetY: (cy - H / 2) / H },
    },
  };

  // Headline and subhead as canvas-anchored text (sizes in card units of this layout).
  const k = layoutScene(scene, assets).k;
  const t = set.text;
  const x = t.align === "center" ? 0.5 : (W - tb.maxW) / 2 / W;
  const ann: TextAnnotation[] = [];
  const blockTop = textTop;
  if (tb.head.lines.length) {
    const h = tb.head.lines.length * tb.head.lh;
    ann.push({
      id: "headline",
      kind: "text",
      anchor: "canvas",
      x,
      y: (blockTop + h / 2) / H,
      text: tb.head.lines.join("\n"),
      font: t.font,
      size: tb.head.px / k,
      weight: 800,
      color: t.color,
      align: t.align,
      background: null,
    });
  }
  if (tb.sub.lines.length) {
    const top = blockTop + tb.head.lines.length * tb.head.lh + tb.gap;
    const h = tb.sub.lines.length * tb.sub.lh;
    ann.push({
      id: "subhead",
      kind: "text",
      anchor: "canvas",
      x,
      y: (top + h / 2) / H,
      text: tb.sub.lines.join("\n"),
      font: "sans",
      size: tb.sub.px / k,
      weight: 500,
      color: t.subColor,
      align: t.align,
      background: null,
    });
  }
  return { ...scene, annotations: ann };
}

/** Widest headline line in px (used by tests and the UI to warn about overflow). */
export function headlineWidth(set: AppStoreSet, slide: AppStoreSlide): number {
  const { width: W, height: H } = setCanvasSize(set);
  const tb = textBlocks(set, slide, W, H);
  return Math.max(0, ...tb.head.lines.map((l) => measureText(tb.hFont, l)));
}

// ---------------------------------------------------------------------------
// Validation (sets come back from IndexedDB)
// ---------------------------------------------------------------------------

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const hex = (v: unknown, d: string) =>
  typeof v === "string" && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(v) ? v.toLowerCase() : d;
const clamp = (v: unknown, a: number, b: number, d: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : d;

export function normalizeSet(input: unknown): AppStoreSet {
  const d = createSet();
  if (!isObj(input)) return d;
  const t = isObj(input.text) ? input.text : {};
  const slides = Array.isArray(input.slides)
    ? input.slides
        .filter(isObj)
        .slice(0, SET_MAX_SLIDES)
        .map((s, i) => ({
          id: typeof s.id === "string" && s.id ? s.id.slice(0, 40) : `s${i}`,
          headline: typeof s.headline === "string" ? s.headline.slice(0, 200) : "",
          subhead: typeof s.subhead === "string" ? s.subhead.slice(0, 300) : "",
          assetId: typeof s.assetId === "string" && s.assetId ? s.assetId : null,
          ...(isObj(s.crop) &&
          [s.crop.x, s.crop.y, s.crop.width, s.crop.height].every(
            (n) => typeof n === "number" && n >= 0 && n <= 1,
          ) &&
          (s.crop.width as number) > 0.02 &&
          (s.crop.height as number) > 0.02
            ? {
                crop: {
                  x: s.crop.x as number,
                  y: s.crop.y as number,
                  width: s.crop.width as number,
                  height: s.crop.height as number,
                },
              }
            : {}),
        }))
    : d.slides;
  while (slides.length < SET_MIN_SLIDES)
    slides.push({ ...d.slides[slides.length]!, id: newSlideId("n") });
  return {
    version: 1,
    sizePresetId:
      typeof input.sizePresetId === "string" &&
      APPSTORE_SIZES.some((p) => p.id === input.sizePresetId)
        ? input.sizePresetId
        : d.sizePresetId,
    landscape: input.landscape === true,
    flow: input.flow !== false,
    device: input.device === "bleed" ? "bleed" : "fit",
    text: {
      font: t.font === "sans" ? "sans" : "display",
      size: clamp(t.size, 0.7, 1.4, 1),
      color: hex(t.color, d.text.color),
      subColor: hex(t.subColor, d.text.subColor),
      position: t.position === "bottom" ? "bottom" : "top",
      align: t.align === "left" ? "left" : "center",
    },
    slides,
    ...(typeof input.styleId === "string" ? { styleId: input.styleId } : {}),
  };
}
