/**
 * Gradient editing model for the "Edit gradient" panel: one editable shape
 * (type, angle, 2-4 colour stops) that converts to and from every background
 * fill, plus mesh helpers (shuffle, hue shift). Pure functions on plain data.
 */
import { colorToOklch, mixColors, normalizeColor, oklchToHex } from "../math/color";
import { mulberry32 } from "../math/random";
import type { Palette } from "../palette/extract";
import { resolveAutoFill } from "../palette/suggest";
import type { BackgroundFill, GradientStop, MeshPoint } from "../scene/types";

export type GradientType = "linear" | "radial" | "conic" | "mesh";

export interface GradientEdit {
  type: GradientType;
  /** Degrees, CSS convention (0 = up, 90 = right). Linear and conic. */
  angle: number;
  /** 2..4 stops, sorted by offset. */
  stops: GradientStop[];
}

export const GRADIENT_TYPES: readonly { id: GradientType; label: string }[] = [
  { id: "linear", label: "Linear" },
  { id: "radial", label: "Radial" },
  { id: "conic", label: "Conic" },
  { id: "mesh", label: "Mesh" },
];

/** Eight one-tap angles for the dial. */
export const GRADIENT_ANGLES: readonly number[] = [0, 45, 90, 135, 180, 225, 270, 315];

export const MIN_STOPS = 2;
export const MAX_STOPS = 4;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Evenly spread offsets for n stops. */
function spread(n: number): number[] {
  return Array.from({ length: n }, (_, i) => (n === 1 ? 0 : i / (n - 1)));
}

/** Colour of a stop list at offset t (for inserting stops). */
export function colorAt(stops: GradientStop[], t: number): string {
  const s = [...stops].sort((a, b) => a.offset - b.offset);
  if (t <= s[0]!.offset) return s[0]!.color;
  for (let i = 1; i < s.length; i++) {
    const a = s[i - 1]!;
    const b = s[i]!;
    if (t <= b.offset) {
      const u = b.offset > a.offset ? (t - a.offset) / (b.offset - a.offset) : 0;
      return mixColors(a.color, b.color, u);
    }
  }
  return s[s.length - 1]!.color;
}

/** Normalize stops: clamp, sort, 2..4 of them. */
export function normalizeStops(stops: GradientStop[]): GradientStop[] {
  let s = stops
    .map((x) => ({ offset: clamp01(x.offset), color: normalizeColor(x.color) }))
    .sort((a, b) => a.offset - b.offset);
  if (s.length === 0) s = [{ offset: 0, color: "#ffffff" }];
  if (s.length === 1) s = [s[0]!, { offset: 1, color: s[0]!.color }];
  if (s.length > MAX_STOPS) {
    // Keep the ends and the most distinct middle stops.
    const ends = [s[0]!, s[s.length - 1]!];
    const mid = s.slice(1, -1).slice(0, MAX_STOPS - 2);
    s = [ends[0]!, ...mid, ends[1]!];
  }
  return s;
}

/** Change the number of stops (2..4), resampling the current colours evenly. */
export function setStopCount(stops: GradientStop[], n: number): GradientStop[] {
  const count = Math.min(MAX_STOPS, Math.max(MIN_STOPS, Math.round(n)));
  const src = normalizeStops(stops);
  return spread(count).map((t) => ({ offset: t, color: colorAt(src, t) }));
}

/** Mesh points laid out for n colours (deterministic corners, then centre). */
const MESH_LAYOUT: readonly [number, number, number][] = [
  [0.08, 0.1, 0.62],
  [0.92, 0.9, 0.62],
  [0.92, 0.12, 0.55],
  [0.1, 0.92, 0.55],
];

/** The editable gradient of any fill (solid and image fills become two-stop blends). */
export function toGradientEdit(fill: BackgroundFill, palette: Palette | null = null): GradientEdit {
  const f = fill.kind === "auto" ? resolveAutoFill(fill, palette) : fill;
  switch (f.kind) {
    case "linear":
      return { type: "linear", angle: f.angle, stops: normalizeStops(f.stops) };
    case "radial":
      return { type: "radial", angle: 135, stops: normalizeStops(f.stops) };
    case "conic":
      return { type: "conic", angle: f.angle, stops: normalizeStops(f.stops) };
    case "mesh": {
      const colors = [f.base, ...f.points.map((p) => p.color)].slice(0, MAX_STOPS);
      return {
        type: "mesh",
        angle: 135,
        stops: normalizeStops(
          colors.map((c, i) => ({ offset: spread(colors.length)[i]!, color: c })),
        ),
      };
    }
    case "solid":
      return {
        type: "linear",
        angle: 135,
        stops: [
          { offset: 0, color: normalizeColor(f.color) },
          { offset: 1, color: mixColors(f.color, "#000000", 0.18) },
        ],
      };
    default:
      return {
        type: "linear",
        angle: 135,
        stops: [
          { offset: 0, color: "#ffb38a" },
          { offset: 1, color: "#ff6f91" },
        ],
      };
  }
}

/** The background fill for an edited gradient. */
export function fromGradientEdit(edit: GradientEdit): BackgroundFill {
  const stops = normalizeStops(edit.stops);
  const angle = ((edit.angle % 360) + 360) % 360;
  switch (edit.type) {
    case "linear":
      return { kind: "linear", angle, stops };
    case "radial":
      return { kind: "radial", cx: 0.5, cy: 0.4, radius: 1.05, stops };
    case "conic": {
      // A seamless wheel: repeat the first colour at the end.
      const wheel =
        stops[stops.length - 1]!.color === stops[0]!.color
          ? stops
          : [
              ...stops.map((s) => ({ ...s, offset: s.offset * 0.999 })),
              { offset: 1, color: stops[0]!.color },
            ];
      return { kind: "conic", cx: 0.5, cy: 0.5, angle, stops: wheel.slice(0, 16) };
    }
    case "mesh": {
      const [base, ...rest] = stops.map((s) => s.color);
      const points: MeshPoint[] = rest.map((color, i) => {
        const [x, y, radius] = MESH_LAYOUT[i % MESH_LAYOUT.length]!;
        return { x, y, color, radius };
      });
      if (points.length === 0) points.push({ x: 0.5, y: 0.5, color: base!, radius: 0.6 });
      return { kind: "mesh", base: base!, points };
    }
  }
}

/** Re-roll mesh point positions and sizes (deterministic for a seed). */
export function shuffleMesh(fill: Extract<BackgroundFill, { kind: "mesh" }>, seed: number) {
  const rng = mulberry32(seed >>> 0 || 1);
  return {
    ...fill,
    points: fill.points.map((p) => ({
      ...p,
      x: Math.round((0.05 + rng() * 0.9) * 1000) / 1000,
      y: Math.round((0.05 + rng() * 0.9) * 1000) / 1000,
      radius: Math.round((0.45 + rng() * 0.3) * 1000) / 1000,
    })),
  };
}

/** Rotate every colour of a fill around the hue wheel (OKLCH), keeping lightness and chroma. */
export function hueShiftFill(fill: BackgroundFill, degrees: number): BackgroundFill {
  const shift = (hex: string) => {
    const c = colorToOklch(hex);
    return oklchToHex({ ...c, h: (((c.h + degrees) % 360) + 360) % 360 });
  };
  switch (fill.kind) {
    case "solid":
      return { ...fill, color: shift(fill.color) };
    case "linear":
    case "radial":
    case "conic":
      return { ...fill, stops: fill.stops.map((s) => ({ ...s, color: shift(s.color) })) };
    case "mesh":
      return {
        ...fill,
        base: shift(fill.base),
        points: fill.points.map((p) => ({ ...p, color: shift(p.color) })),
      };
    default:
      return fill;
  }
}

/** Stop colours suggested from the screenshot's palette (for the stop pickers). */
export function paletteStopSuggestions(palette: Palette | null): string[] {
  if (!palette) return [];
  const list = [
    palette.vibrant.hex,
    palette.light.hex,
    palette.dominant.hex,
    palette.muted.hex,
    palette.dark.hex,
    ...palette.swatches.map((s) => s.hex),
  ];
  return [...new Set(list.map((c) => normalizeColor(c)))].slice(0, 8);
}
