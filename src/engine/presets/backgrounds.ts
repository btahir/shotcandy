/**
 * Background library (data from the design team: presets/data/backgrounds.json).
 * Image backgrounds reference built-in wallpapers as `builtin:<name>` assets.
 */
import type { BackgroundFill, GrainSpec } from "../scene/types";
import data from "./data/backgrounds.json";

export type BackgroundGroup = "auto" | "solid" | "gradient" | "mesh" | "image";

export interface BackgroundPreset {
  id: string;
  label: string;
  group: BackgroundGroup;
  tone: string;
  fill: BackgroundFill;
  grain: GrainSpec;
}

export const BACKGROUND_GROUPS: readonly { id: BackgroundGroup; label: string }[] = data.groups as {
  id: BackgroundGroup;
  label: string;
}[];

export const BACKGROUND_PRESETS: readonly BackgroundPreset[] = data.backgrounds.map((b) => ({
  id: b.id,
  label: b.name,
  group: b.group as BackgroundGroup,
  tone: b.tone,
  fill: b.fill as BackgroundFill,
  grain: b.grain,
}));

const byId = new Map(BACKGROUND_PRESETS.map((b) => [b.id, b]));

export function getBackgroundPreset(id: string): BackgroundPreset | undefined {
  return byId.get(id);
}

const inGroup = (...groups: BackgroundGroup[]) =>
  BACKGROUND_PRESETS.filter((b) => groups.includes(b.group));

export const GRADIENT_PRESETS = inGroup("gradient");
export const MESH_PRESETS = inGroup("mesh");
export const WALLPAPER_PRESETS = inGroup("image");
export const SOLID_PRESETS: readonly string[] = inGroup("solid").map((b) =>
  b.fill.kind === "solid" ? b.fill.color : "#ffffff",
);
