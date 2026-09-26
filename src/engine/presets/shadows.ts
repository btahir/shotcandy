/**
 * Shadow presets. Realistic shadows are several stacked layers with growing
 * offset and blur and shrinking opacity (the "smooth shadow" technique), which
 * reads as soft ambient occlusion plus a directional key light. Lengths are
 * card units (the screenshot's longer side is 1000 cu).
 */
import type { ShadowLayer, ShadowSpec } from "../scene/types";

export interface ShadowPreset {
  id: string;
  label: string;
  layers: ShadowLayer[];
}

const L = (y: number, blur: number, opacity: number, spread = 0, x = 0): ShadowLayer => ({
  x,
  y,
  blur,
  spread,
  opacity,
});

export const SHADOW_PRESETS: readonly ShadowPreset[] = [
  { id: "none", label: "None", layers: [] },
  { id: "subtle", label: "Subtle", layers: [L(1, 3, 0.1), L(4, 12, 0.08), L(10, 28, 0.06)] },
  {
    id: "soft",
    label: "Soft",
    layers: [L(2, 4, 0.05), L(6, 14, 0.06), L(16, 36, 0.08), L(36, 80, 0.1), L(70, 150, 0.1)],
  },
  {
    id: "medium",
    label: "Realistic",
    layers: [L(1, 2, 0.12), L(4, 8, 0.1), L(12, 24, 0.12), L(28, 56, 0.14), L(56, 110, 0.16)],
  },
  {
    id: "deep",
    label: "Deep",
    layers: [L(3, 6, 0.12), L(12, 24, 0.14), L(32, 64, 0.18), L(64, 128, 0.22), L(110, 220, 0.24)],
  },
  {
    id: "floating",
    label: "Floating",
    layers: [L(2, 5, 0.08), L(80, 140, 0.3, -40), L(140, 240, 0.18, -60)],
  },
  { id: "ambient", label: "Ambient", layers: [L(0, 30, 0.12), L(0, 90, 0.16), L(0, 180, 0.12)] },
  { id: "glow", label: "Glow", layers: [L(0, 60, 0.45, 10), L(0, 180, 0.4, 30)] },
  { id: "hard", label: "Hard offset", layers: [L(18, 0, 1, 0, 18)] },
];

const byId = new Map(SHADOW_PRESETS.map((p) => [p.id, p]));

export function getShadowPreset(id: string): ShadowPreset | undefined {
  return byId.get(id);
}

/** Resolve a ShadowSpec to concrete layers with strength applied. */
export function resolveShadowLayers(spec: ShadowSpec): ShadowLayer[] {
  const layers =
    spec.preset === "custom" ? (spec.layers ?? []) : (byId.get(spec.preset)?.layers ?? []);
  if (spec.strength <= 0) return [];
  return layers
    .map((l) => ({ ...l, opacity: Math.min(1, l.opacity * spec.strength) }))
    .filter((l) => l.opacity > 0.001);
}
