/**
 * Built-in one-click styles. A style is a StylePatch: it changes how the card
 * and background look, never the content, canvas size or annotations. Styles
 * using `auto` backgrounds adapt to each screenshot's own palette, which makes
 * preset thumbnails rendered with the user's screenshot feel personal.
 */
import type { StylePatch } from "../scene/types";
import { GRADIENT_PRESETS, MESH_PRESETS } from "./backgrounds";

export interface StylePreset {
  id: string;
  name: string;
  patch: StylePatch;
}

const fillOf = (list: typeof GRADIENT_PRESETS, id: string) => list.find((p) => p.id === id)!.fill;

const NO_FRAME = { id: "none" } as const;
const FLAT = { rotateX: 0, rotateY: 0, rotateZ: 0, perspective: 3 };
const NO_BORDER = { width: 0 };
const NO_INSET = { width: 0 };
const NO_GRAIN = { amount: 0 };
const CENTER = { scale: 1, offsetX: 0, offsetY: 0 };

/** Every style sets the same fields, so applying one fully replaces another. */
function style(
  id: string,
  name: string,
  p: {
    padding: number;
    fill: NonNullable<NonNullable<StylePatch["background"]>["fill"]>;
    grain?: number;
    frame?: { id: string; theme?: "light" | "dark" };
    radius: number;
    shadow: string;
    strength?: number;
    shadowColor?: string;
    border?: { width: number; color?: string };
    inset?: { width: number; color?: string };
    tilt?: Partial<typeof FLAT>;
  },
): StylePreset {
  return {
    id,
    name,
    patch: {
      canvas: { padding: p.padding },
      background: { fill: p.fill, grain: { ...NO_GRAIN, amount: p.grain ?? 0 } },
      card: {
        frame: p.frame ? { theme: "light", ...p.frame } : NO_FRAME,
        radius: p.radius,
        smoothing: 0.6,
        border: p.border ?? NO_BORDER,
        inset: p.inset ?? NO_INSET,
        shadow: { preset: p.shadow, strength: p.strength ?? 1, color: p.shadowColor ?? "#000000" },
        tilt: { ...FLAT, ...p.tilt },
        transform: CENTER,
      },
    },
  };
}

export const STYLE_PRESETS: readonly StylePreset[] = [
  style("candy", "Candy", {
    padding: 90,
    fill: fillOf(GRADIENT_PRESETS, "candy"),
    radius: 18,
    shadow: "soft",
  }),
  style("chameleon", "Chameleon", {
    padding: 100,
    fill: { kind: "auto", style: "mesh", variant: 0 },
    radius: 18,
    shadow: "soft",
    grain: 0.12,
  }),
  style("paper", "Paper", {
    padding: 80,
    fill: { kind: "auto", style: "soft", variant: 0 },
    radius: 14,
    shadow: "subtle",
  }),
  style("aurora", "Aurora", {
    padding: 110,
    fill: fillOf(MESH_PRESETS, "aurora"),
    radius: 20,
    shadow: "medium",
    grain: 0.15,
  }),
  style("mac", "Mac window", {
    padding: 90,
    fill: fillOf(GRADIENT_PRESETS, "cloud"),
    frame: { id: "macos" },
    radius: 14,
    shadow: "medium",
  }),
  style("midnight", "Midnight", {
    padding: 100,
    fill: fillOf(GRADIENT_PRESETS, "night"),
    frame: { id: "macos", theme: "dark" },
    radius: 14,
    shadow: "deep",
    grain: 0.1,
  }),
  style("browser", "Browser", {
    padding: 90,
    fill: { kind: "auto", style: "linear", variant: 0 },
    frame: { id: "browser" },
    radius: 14,
    shadow: "soft",
  }),
  style("glass", "Glass", {
    padding: 110,
    fill: fillOf(MESH_PRESETS, "lagoon-mesh"),
    radius: 22,
    shadow: "floating",
    border: { width: 14, color: "#ffffff73" },
  }),
  style("tilt", "Tilt", {
    padding: 120,
    fill: { kind: "auto", style: "mesh", variant: 1 },
    radius: 18,
    shadow: "deep",
    tilt: { rotateX: 14, rotateY: -20, rotateZ: 0, perspective: 2.6 },
  }),
  style("brutal", "Brutal", {
    padding: 90,
    fill: { kind: "solid", color: "#ffd43b" },
    radius: 0,
    shadow: "hard",
    border: { width: 5, color: "#111111" },
  }),
  style("sunset", "Sunset", {
    padding: 100,
    fill: fillOf(GRADIENT_PRESETS, "dusk"),
    radius: 18,
    shadow: "deep",
    grain: 0.25,
  }),
  style("minimal", "Minimal", {
    padding: 70,
    fill: { kind: "solid", color: "#f4f4f5" },
    radius: 12,
    shadow: "subtle",
  }),
  style("plate", "Plate", {
    padding: 90,
    fill: { kind: "auto", style: "radial", variant: 2 },
    radius: 20,
    shadow: "soft",
    inset: { width: 36, color: "auto" },
  }),
  style("phone", "Phone", {
    padding: 110,
    fill: { kind: "auto", style: "radial", variant: 0 },
    frame: { id: "phone", theme: "dark" },
    radius: 0,
    shadow: "medium",
  }),
  style("laptop", "Laptop", {
    padding: 100,
    fill: fillOf(GRADIENT_PRESETS, "lilac"),
    frame: { id: "laptop", theme: "dark" },
    radius: 0,
    shadow: "soft",
  }),
  style("noir", "Noir", {
    padding: 110,
    fill: fillOf(MESH_PRESETS, "velvet"),
    radius: 18,
    shadow: "glow",
    shadowColor: "#8b5cf6",
    strength: 0.9,
  }),
];

export function getStylePreset(id: string): StylePreset | undefined {
  return STYLE_PRESETS.find((s) => s.id === id);
}
