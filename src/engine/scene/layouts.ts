/**
 * Multi-screen layouts: what each arrangement is called, how many screens it
 * takes and which knobs it has. Pure data, shared by the normalizer, the slot
 * API (scene/slots.ts), the geometry (layout/group.ts) and the editor UI.
 *
 * Knobs are plain numbers. Most run 0..1 (a slider from "less" to "more");
 * `angle` is a direction in degrees (0 = right, 90 = down, -90 = up).
 */
import type {
  ImageContent,
  LayoutId,
  LayoutParamKey,
  LayoutSpec,
  Scene,
  ScreenSlot,
} from "./types";

export interface LayoutParamDef {
  key: LayoutParamKey;
  label: string;
  min: number;
  max: number;
  default: number;
  /** Degrees (a direction) rather than a 0..1 amount. */
  unit?: "deg";
}

export interface LayoutDef {
  id: LayoutId;
  label: string;
  /** One line for tooltips and screen readers. */
  description: string;
  minCount: number;
  maxCount: number;
  defaultCount: number;
  params: readonly LayoutParamDef[];
  /** Whether a style's floor reflection is drawn under each screen. */
  reflection: boolean;
}

const amount = (key: LayoutParamKey, label: string, def: number): LayoutParamDef => ({
  key,
  label,
  min: 0,
  max: 1,
  default: def,
});

export const LAYOUTS: readonly LayoutDef[] = [
  {
    id: "single",
    label: "Single",
    description: "One screenshot.",
    minCount: 1,
    maxCount: 1,
    defaultCount: 1,
    params: [],
    reflection: true,
  },
  {
    id: "side-by-side",
    label: "Side by side",
    description: "Two or three screens in a row.",
    minCount: 2,
    maxCount: 3,
    defaultCount: 2,
    params: [amount("spacing", "Spacing", 0.35), amount("tilt", "Tilt", 0)],
    reflection: true,
  },
  {
    id: "overlap",
    label: "Overlap",
    description: "Two screens, one partly behind the other.",
    minCount: 2,
    maxCount: 2,
    defaultCount: 2,
    params: [
      amount("overlap", "Overlap", 0.38),
      { key: "angle", label: "Direction", min: -180, max: 180, default: -30, unit: "deg" },
    ],
    reflection: false,
  },
  {
    id: "hero",
    label: "Hero",
    description: "One screen up front with two smaller ones behind it.",
    minCount: 3,
    maxCount: 3,
    defaultCount: 3,
    params: [
      amount("size", "Side size", 0.5),
      amount("spacing", "Spacing", 0.4),
      amount("tilt", "Tilt", 0.35),
    ],
    reflection: true,
  },
  {
    id: "cascade",
    label: "Cascade",
    description: "Three to five screens stepping back diagonally.",
    minCount: 3,
    maxCount: 5,
    defaultCount: 3,
    params: [
      amount("step", "Step", 0.4),
      { key: "angle", label: "Direction", min: -180, max: 180, default: -38, unit: "deg" },
    ],
    reflection: false,
  },
  {
    id: "fan",
    label: "Fan",
    description: "Three to five screens fanned out like a hand of cards.",
    minCount: 3,
    maxCount: 5,
    defaultCount: 3,
    params: [amount("spread", "Spread", 0.5)],
    reflection: false,
  },
  {
    id: "grid",
    label: "Grid",
    description: "Four to six screens in tidy rows.",
    minCount: 4,
    maxCount: 6,
    defaultCount: 4,
    params: [amount("gap", "Gap", 0.3)],
    reflection: false,
  },
];

const BY_ID = new Map(LAYOUTS.map((l) => [l.id, l]));

export const LAYOUT_IDS: readonly LayoutId[] = LAYOUTS.map((l) => l.id);

/** Most screens any layout shows. */
export const MAX_SCREENS = Math.max(...LAYOUTS.map((l) => l.maxCount));

export function getLayoutDef(id: string): LayoutDef | undefined {
  return BY_ID.get(id as LayoutId);
}

export function clampCount(def: LayoutDef, n: number): number {
  const v = Number.isFinite(n) ? Math.round(n) : def.defaultCount;
  return Math.min(def.maxCount, Math.max(def.minCount, v));
}

export function clampParam(p: LayoutParamDef, v: number): number {
  if (!Number.isFinite(v)) return p.default;
  return Math.min(p.max, Math.max(p.min, v));
}

/** Every knob of the layout with defaults filled in. */
export function resolveParams(spec: LayoutSpec): Record<LayoutParamKey, number> {
  const def = getLayoutDef(spec.id);
  const out = {} as Record<LayoutParamKey, number>;
  for (const p of def?.params ?? []) {
    const v = spec.params?.[p.key];
    out[p.key] = v === undefined ? p.default : clampParam(p, v);
  }
  return out;
}

/** A layout as the engine draws it: never "single", params resolved. */
export interface ActiveLayout {
  def: LayoutDef;
  id: Exclude<LayoutId, "single">;
  count: number;
  params: Record<LayoutParamKey, number>;
}

/**
 * The multi-screen layout the scene draws, or null for a single screen. Layouts
 * apply to images only: code, posts and screen recordings (content with a
 * clip) always draw as a single screen, whatever `layout` says.
 */
export function activeLayout(scene: Scene): ActiveLayout | null {
  const spec = scene.layout;
  if (!spec || spec.id === "single") return null;
  const c = scene.content;
  if (c.kind !== "image" || c.clip) return null;
  const def = getLayoutDef(spec.id);
  if (!def) return null;
  return {
    def,
    id: def.id as ActiveLayout["id"],
    count: clampCount(def, spec.count),
    params: resolveParams(spec),
  };
}

/** Screen i of a scene as image content (0 = the content itself), or null past the end. */
export function screenContent(scene: Scene, i: number): ImageContent | null {
  if (i === 0) return scene.content.kind === "image" ? scene.content : null;
  const s = scene.slots?.[i - 1];
  return s ? slotToContent(s) : null;
}

export function slotToContent(s: ScreenSlot): ImageContent {
  const out: ImageContent = { kind: "image", assetId: s.assetId };
  if (s.crop) out.crop = s.crop;
  if (s.tall !== undefined) out.tall = s.tall;
  if (s.fade !== undefined) out.fade = s.fade;
  if (s.sampling !== undefined) out.sampling = s.sampling;
  return out;
}
