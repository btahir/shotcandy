/**
 * Built-in one-click styles (data from the design team: presets/data/styles.json).
 *
 * A style is a StylePatch: it changes how the card and background look, never
 * the content, canvas size or annotations. Patches are completed against a
 * neutral base so applying any style fully replaces the previous one. Styles
 * with `auto` backgrounds adapt to each screenshot's own palette.
 */
import { deepMerge } from "../scene/patch";
import type { GrainSpec, StylePatch } from "../scene/types";
import { getBackgroundPreset } from "./backgrounds";
import data from "./data/styles.json";

export interface StylePreset {
  id: string;
  name: string;
  family: string;
  description?: string;
  /** Gallery ordering hint ("any", "portrait", ...). */
  suits?: string;
  patch: StylePatch;
}

/** Every style field, at neutral values; each preset patch is merged over it. */
export const STYLE_BASE: StylePatch = {
  canvas: { padding: 80, anchor: "center", bleed: 0 },
  background: { grain: { amount: 0, size: 1, seed: 7 }, texture: null, vignette: null },
  card: {
    frame: { id: "none", theme: "auto" },
    radius: 14,
    smoothing: 0.6,
    border: { width: 0, color: "#ffffff66" },
    inset: { width: 0, color: "auto" },
    shadow: { preset: "soft", strength: 1, color: "#000000" },
    tilt: { rotateX: 0, rotateY: 0, rotateZ: 0, perspective: 3 },
    transform: { scale: 1, offsetX: 0, offsetY: 0 },
    stack: null,
    reflection: null,
  },
};

/** A preset patch as authored: `background.fill` may be an "@backgroundId" reference. */
type RawPatch = Omit<StylePatch, "background"> & {
  background?: Omit<NonNullable<StylePatch["background"]>, "fill" | "grain"> & {
    fill?: unknown;
    grain?: Partial<GrainSpec>;
  };
};

/** Resolve `@backgroundId` references and complete the patch against STYLE_BASE. */
export function completeStylePatch(raw: RawPatch): StylePatch {
  const bg = raw.background ?? {};
  let fill = bg.fill;
  let grain = bg.grain;
  if (typeof fill === "string" && fill.startsWith("@")) {
    const ref = getBackgroundPreset(fill.slice(1));
    if (!ref) throw new Error(`Unknown background reference ${fill}`);
    fill = ref.fill;
    grain = { ...ref.grain, ...(grain ?? {}) };
  }
  const { fill: _fill, ...rest } = bg;
  void _fill;
  const merged = deepMerge(STYLE_BASE, { ...raw, background: { ...rest, grain } });
  return fill === undefined
    ? merged
    : { ...merged, background: { ...merged.background, fill: fill as never } };
}

export const STYLE_FAMILIES: readonly { id: string; label: string }[] = data.families;
export const DEFAULT_STYLE_ID: string = data.default;

export const STYLE_PRESETS: readonly StylePreset[] = data.presets.map((p) => ({
  id: p.id,
  name: p.name,
  family: p.family,
  ...(p.description ? { description: p.description } : {}),
  ...(p.suits ? { suits: p.suits } : {}),
  patch: completeStylePatch(p.patch as RawPatch),
}));

export function getStylePreset(id: string): StylePreset | undefined {
  return STYLE_PRESETS.find((s) => s.id === id);
}
