/**
 * Shadow presets (data from the design team: presets/data/shadows.json).
 * Realistic shadows stack several layers with growing offset and blur and
 * shrinking opacity. Lengths are card units; opacity is scaled by strength.
 */
import type { ShadowLayer, ShadowSpec } from "../scene/types";
import data from "./data/shadows.json";

export interface ShadowPreset {
  id: string;
  label: string;
  description?: string;
  layers: ShadowLayer[];
}

export const SHADOW_PRESETS: readonly ShadowPreset[] = data.shadows.map((s) => ({
  id: s.id,
  label: s.name,
  ...(s.description ? { description: s.description } : {}),
  layers: s.layers,
}));

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
