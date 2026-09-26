/**
 * Background suggestions derived from a screenshot palette.
 *
 * Colours are composed in OKLCH so lightness and chroma stay controlled: the
 * backgrounds echo the screenshot's own hues while staying soft enough to let
 * the screenshot remain the hero. Grey UIs (achromatic palettes) fall back to
 * a curated warm hue family. Everything is deterministic.
 */
import { oklchToHex } from "../math/color";
import type { AutoBackgroundStyle, BackgroundFill } from "../scene/types";
import type { Palette } from "./extract";

const FALLBACK_HUES = [35, 355, 300, 250, 170, 75];

interface HueSet {
  h0: number;
  h1: number;
}

const wrap = (h: number) => ((h % 360) + 360) % 360;

function hueSets(p: Palette): HueSet[] {
  if (p.achromatic) {
    return FALLBACK_HUES.map((h0, i) => ({
      h0,
      h1: FALLBACK_HUES[(i + 1) % FALLBACK_HUES.length]!,
    }));
  }
  const h0 = p.vibrant.lch.h;
  const other = p.swatches.find(
    (s) => s.lch.C >= 0.045 && Math.abs(((s.lch.h - h0 + 540) % 360) - 180) > 30,
  );
  const h1 = other ? other.lch.h : wrap(h0 + 40);
  return [
    { h0, h1: wrap(h0 + 38) },
    { h0, h1 },
    { h0: wrap(h0 - 28), h1: wrap(h0 + 28) },
    { h0, h1: wrap(h0 + 180) },
    { h0: wrap(h0 + 120), h1: wrap(h0 + 200) },
    { h0: wrap(h0 - 60), h1: h0 },
  ];
}

const c = (L: number, C: number, h: number) => oklchToHex({ L, C, h: wrap(h) });

function linear(set: HueSet, i: number): BackgroundFill {
  const dark = i === 4;
  return {
    kind: "linear",
    angle: [135, 160, 120, 145, 135, 200][i % 6]!,
    stops: dark
      ? [
          { offset: 0, color: c(0.32, 0.08, set.h0) },
          { offset: 1, color: c(0.18, 0.06, set.h1) },
        ]
      : [
          { offset: 0, color: c(0.86, 0.1, set.h0) },
          { offset: 1, color: c(0.7, 0.15, set.h1) },
        ],
  };
}

function radial(set: HueSet, i: number): BackgroundFill {
  return {
    kind: "radial",
    cx: 0.5,
    cy: i % 2 ? 0.2 : 0.35,
    radius: 1.1,
    stops: [
      { offset: 0, color: c(0.93, 0.06, set.h0) },
      { offset: 0.55, color: c(0.78, 0.12, set.h0) },
      { offset: 1, color: c(0.66, 0.13, set.h1) },
    ],
  };
}

function mesh(set: HueSet, i: number): BackgroundFill {
  const { h0, h1 } = set;
  const mid = wrap(h0 + (((h1 - h0 + 540) % 360) - 180) / 2);
  const dark = i === 4;
  const Lb = dark ? 0.22 : 0.9;
  const Lp = dark ? 0.42 : 0.78;
  return {
    kind: "mesh",
    base: c(Lb, dark ? 0.04 : 0.04, mid),
    points: [
      { x: 0.08, y: 0.1, color: c(Lp + 0.04, 0.13, h0), radius: 0.55 },
      { x: 0.92, y: 0.18, color: c(Lp, 0.15, h1), radius: 0.5 },
      { x: 0.78, y: 0.95, color: c(Lp - 0.04, 0.14, wrap(h0 + 20)), radius: 0.55 },
      { x: 0.12, y: 0.88, color: c(Lp + 0.06, 0.1, mid), radius: 0.5 },
      { x: 0.5, y: 0.5, color: c(Lb + (dark ? 0.08 : 0.04), 0.05, mid), radius: 0.35 },
    ],
  };
}

function solid(set: HueSet, i: number): BackgroundFill {
  const L = [0.86, 0.78, 0.93, 0.68, 0.24, 0.9][i % 6]!;
  return { kind: "solid", color: c(L, L < 0.3 ? 0.04 : 0.09, set.h0) };
}

function soft(set: HueSet, i: number): BackgroundFill {
  return {
    kind: "linear",
    angle: 180,
    stops: [
      { offset: 0, color: c(0.97, 0.025, set.h0) },
      { offset: 1, color: c(0.91, 0.045, i % 2 ? set.h1 : set.h0) },
    ],
  };
}

const BUILDERS: Record<AutoBackgroundStyle, (set: HueSet, i: number) => BackgroundFill> = {
  mesh,
  linear,
  radial,
  solid,
  soft,
};

/** Suggested fills for one style; always 6 variants. */
export function suggestBackgrounds(palette: Palette, style: AutoBackgroundStyle): BackgroundFill[] {
  return hueSets(palette).map((set, i) => BUILDERS[style](set, i));
}

/** A mixed shortlist across styles (for "auto palette" swatches in the UI). */
export function suggestMixed(palette: Palette): BackgroundFill[] {
  const sets = hueSets(palette);
  return [
    mesh(sets[0]!, 0),
    linear(sets[0]!, 0),
    soft(sets[1]!, 1),
    radial(sets[2]!, 2),
    mesh(sets[3]!, 3),
    linear(sets[4]!, 4),
  ];
}

/** Resolve an `auto` fill against a palette (null palette = no content yet). */
export function resolveAutoFill(
  fill: Extract<BackgroundFill, { kind: "auto" }>,
  palette: Palette | null,
): BackgroundFill {
  const p = palette ?? NEUTRAL_PALETTE;
  const list = suggestBackgrounds(p, fill.style);
  return list[fill.variant % list.length]!;
}

const white = { hex: "#ffffff", lch: { L: 1, C: 0, h: 0 }, weight: 1 };
export const NEUTRAL_PALETTE: Palette = {
  swatches: [white],
  dominant: white,
  vibrant: white,
  muted: white,
  dark: white,
  light: white,
  edge: "#ffffff",
  achromatic: true,
};
