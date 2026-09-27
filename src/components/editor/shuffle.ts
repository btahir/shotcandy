/**
 * Candy Shuffle: re-roll a whole composition (style, background, tilt or
 * bleed, frame, shadow, padding) from art-directed rules, so every roll looks
 * designed rather than random. Pure and seeded: the same seed gives the same
 * scene, and applying it is one undo step.
 */
import {
  type BackgroundFill,
  type Palette,
  type Scene,
  type StylePreset,
  STYLE_PRESETS,
  applyStylePatch,
  getBackgroundPreset,
  isDark,
} from "@/engine";
import { fillDominant } from "@/lib/fill-css";

function rng(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(r: () => number, items: readonly (readonly [T, number])[]): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let x = r() * total;
  for (const [v, w] of items) {
    if ((x -= w) <= 0) return v;
  }
  return items[items.length - 1]![0];
}

export type Orientation = "landscape" | "portrait" | "tablet";

export function orientationOf(size: { width: number; height: number } | null): Orientation {
  if (!size) return "landscape";
  const r = size.height / size.width;
  if (r >= 1.6) return "portrait";
  if (r >= 1.15) return "tablet";
  return "landscape";
}

/** Styles that suit the screenshot's shape (device styles only where they fit). */
export function suitedStyles(o: Orientation): StylePreset[] {
  return STYLE_PRESETS.filter((p) => {
    const s = p.suits ?? "any";
    if (o === "portrait") return s !== "landscape" && s !== "tablet";
    if (o === "tablet") return s !== "landscape" && s !== "portrait";
    return s !== "portrait" && s !== "tablet";
  });
}

/** Curated backgrounds that carry a whole composition on their own. */
const GRADIENTS = [
  "sherbet-linear",
  "tangerine-dream",
  "mint-julep",
  "blueberry-soda",
  "grape-soda",
  "cotton-candy",
  "peach-fizz",
  "dusk-pop",
  "pink-glow",
  "midnight-halo",
];
const MESHES = [
  "sherbet",
  "taffy",
  "sorbet",
  "aurora-pop",
  "tropical",
  "dusk-candy",
  "sea-glass",
  "candy-silk",
  "lagoon",
  "blue-hour",
  "peach-bloom",
  "cocoa-mesh",
];

type Layer = "flat" | "left" | "right" | "lean" | "rise" | "peek";

const LAYER_LABEL: Record<Layer, string> = {
  flat: "flat",
  left: "tilted left",
  right: "tilted right",
  lean: "leaning back",
  rise: "rising from the bottom",
  peek: "peeking from the corner",
};

export interface ShuffleContext {
  seed: number;
  /** Source size of the screenshot (null for code/posts). */
  size: { width: number; height: number } | null;
  palette: Palette | null;
  /** Style to avoid repeating. */
  current?: string;
  isImage: boolean;
}

export interface ShuffleResult {
  scene: Scene;
  styleId: string;
  summary: string;
}

export function shuffleComposition(scene: Scene, ctx: ShuffleContext): ShuffleResult {
  const r = rng(ctx.seed);
  const o = orientationOf(ctx.size);
  let pool = suitedStyles(o).filter((p) => p.id !== ctx.current);
  if (!ctx.isImage) pool = pool.filter((p) => p.family !== "device");
  if (!ctx.palette) pool = pool.filter((p) => p.family !== "auto");
  const base = pool[Math.floor(r() * pool.length)] ?? STYLE_PRESETS[0]!;
  let next = applyStylePatch(scene, base.patch, base.id);
  const parts: string[] = [base.name];

  const device = ["phone", "tablet", "laptop"].includes(next.card.frame.id);
  const wallpaper = next.background.fill.kind === "image";
  const t = next.card.tilt;
  const composed =
    t.rotateX !== 0 || t.rotateY !== 0 || t.rotateZ !== 0 || (next.canvas.bleed ?? 0) > 0;

  // Background: keep the style's own, take it from the screenshot, or a curated one.
  if (!wallpaper && base.family !== "paper") {
    const choice = pick(r, [
      ["keep", 4],
      ["auto", ctx.palette ? 3 : 0],
      ["curated", 3],
    ] as const);
    let fill: BackgroundFill | null = null;
    let label = "";
    if (choice === "auto") {
      const style = pick(r, [
        ["mesh", 3],
        ["linear", 2],
        ["soft", 1],
      ] as const);
      fill = { kind: "auto", style, variant: Math.floor(r() * 6) };
      label = "colours from your shot";
    } else if (choice === "curated") {
      const list = r() < 0.55 ? MESHES : GRADIENTS;
      const bg = getBackgroundPreset(list[Math.floor(r() * list.length)]!);
      if (bg) {
        fill = bg.fill;
        label = bg.label;
      }
    }
    if (fill) {
      next = {
        ...next,
        background: { ...next.background, fill, grain: { ...next.background.grain, amount: 0 } },
      };
      parts.push(label);
    }
  }

  // Composition: a tilt or a bleed, only on styles that are flat and centred.
  if (!composed && !device) {
    const landscape = o === "landscape" && ctx.isImage;
    const layer = pick<Layer>(r, [
      ["flat", 4],
      ["left", 1.6],
      ["right", 1.6],
      ["lean", 0.8],
      ["rise", landscape ? 1.2 : 0],
      ["peek", landscape ? 1 : 0],
    ]);
    const card = next.card;
    const tilt = { ...card.tilt };
    let canvas = { ...next.canvas };
    if (layer === "left") Object.assign(tilt, { rotateX: 6, rotateY: -16, perspective: 2.8 });
    if (layer === "right") Object.assign(tilt, { rotateX: 6, rotateY: 16, perspective: 2.8 });
    if (layer === "lean") Object.assign(tilt, { rotateX: 22, rotateY: 0, perspective: 2.6 });
    if (layer === "rise") canvas = { ...canvas, anchor: "top", bleed: 0.22 };
    if (layer === "peek") canvas = { ...canvas, anchor: "top-left", bleed: 0.28 };
    if (layer === "flat")
      canvas = {
        ...canvas,
        padding: pick(r, [
          [80, 1],
          [96, 1],
          [112, 1],
        ]),
      };
    else canvas = { ...canvas, padding: layer === "rise" || layer === "peek" ? 84 : 104 };
    next = { ...next, canvas, card: { ...card, tilt } };
    if (layer !== "flat") parts.push(LAYER_LABEL[layer]);
  }

  // Frame: a window for most screenshots; devices keep their own.
  if (!device && ctx.isImage) {
    const id = pick(r, [
      ["macos", 4.5],
      ["browser", 2.5],
      ["none", 3],
    ] as const);
    next = { ...next, card: { ...next.card, frame: { ...next.card.frame, id, theme: "auto" } } };
    if (id !== "none") parts.push(id === "macos" ? "macOS window" : "browser window");
  }

  // Shadow suits the background: glow or deep on dark, floating on light.
  const dom = fillDominant(next.background.fill, ctx.palette);
  const dark = dom ? isDark(dom) : false;
  const preset = dark
    ? pick(r, [
        ["deep", 3],
        ["glow", 2],
      ] as const)
    : pick(r, [
        ["float", 3],
        ["soft", 2],
        ["deep", 1],
      ] as const);
  if (!device)
    next = {
      ...next,
      card: { ...next.card, shadow: { ...next.card.shadow, preset, strength: 1 } },
    };

  return { scene: next, styleId: base.id, summary: parts.join(" · ") };
}
