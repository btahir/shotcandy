/**
 * Reference multi-screen designs for visual regression: every layout with a
 * plain style (soft-grey), a window-frame style (sherbet) and a dark one
 * (midnight), on phone-shaped and desktop-shaped screenshots, plus empty-slot
 * placeholders. Phone screens are the phone sample plus portrait crops of the
 * tablet (its reading list) and settings (its shortcuts panel) samples.
 */
import {
  applyStylePatch,
  createScene,
  getSizePreset,
  getStylePreset,
  setIn,
  type CanvasSize,
  type CropRect,
  type LayoutId,
  type LayoutSpec,
  type Scene,
} from "../../src/engine";

interface Shot {
  id: string | null;
  crop?: CropRect;
}

export const PHONES: Shot[] = [
  { id: "mobile" },
  { id: "tablet", crop: { x: 0, y: 0, width: 0.285, height: 1 } },
  { id: "settings", crop: { x: 0.7, y: 0.13, width: 0.265, height: 0.82 } },
];
export const DESKTOPS: Shot[] = [
  { id: "dashboard" },
  { id: "kanban" },
  { id: "editor" },
  { id: "landing" },
  { id: "settings" },
  { id: "terminal" },
];
const phones = (n: number) => Array.from({ length: n }, (_, i) => PHONES[i % PHONES.length]!);

export interface LayoutReference {
  name: string;
  scene: Scene;
  placeholders?: boolean;
}

const size = (id: string): CanvasSize => getSizePreset(id)!.size;

export function layoutScene(
  styleId: string,
  canvas: CanvasSize,
  id: LayoutId,
  shots: Shot[],
  params: LayoutSpec["params"] = {},
): Scene {
  const [first, ...rest] = shots;
  let s = createScene({
    content: { kind: "image", assetId: first!.id, ...(first!.crop ? { crop: first!.crop } : {}) },
    meta: { name: styleId },
  });
  const style = getStylePreset(styleId)!;
  s = applyStylePatch(s, style.patch, style.id);
  s = setIn(s, ["canvas", "size"], canvas);
  return {
    ...s,
    layout: { id, count: shots.length, ...(Object.keys(params).length ? { params } : {}) },
    slots: rest.map((x) => ({ assetId: x.id, ...(x.crop ? { crop: x.crop } : {}) })),
  };
}

/** Rendered with the long side at 720 px (auto canvases have no size up front). */
const ref = (
  name: string,
  styleId: string,
  canvas: CanvasSize,
  id: LayoutId,
  shots: Shot[],
  params?: LayoutSpec["params"],
  placeholders = false,
): LayoutReference => ({
  name,
  scene: layoutScene(styleId, canvas, id, shots, params),
  ...(placeholders ? { placeholders } : {}),
});

const auto = size("auto");
const wide = size("16x9");
const square = size("1x1");

export const LAYOUT_SCENES: LayoutReference[] = [
  ref("L01-side-by-side-phones-soft-grey", "soft-grey", auto, "side-by-side", phones(2)),
  ref("L02-side-by-side-desktops-sherbet", "sherbet", auto, "side-by-side", DESKTOPS.slice(0, 3)),
  ref("L03-side-by-side-tilt-midnight", "midnight", wide, "side-by-side", DESKTOPS.slice(1, 3), {
    tilt: 0.5,
  }),
  ref("L04-overlap-phones-phone-sorbet", "phone-sorbet", square, "overlap", phones(2)),
  ref("L05-overlap-desktops-sherbet", "sherbet", auto, "overlap", DESKTOPS.slice(0, 2)),
  ref("L06-overlap-mixed-midnight", "midnight", wide, "overlap", [DESKTOPS[2]!, PHONES[0]!]),
  ref("L07-hero-phones-soft-grey", "soft-grey", auto, "hero", phones(3)),
  ref("L08-hero-desktops-sherbet", "sherbet", wide, "hero", DESKTOPS.slice(0, 3)),
  ref("L09-hero-phones-midnight", "midnight", square, "hero", phones(3)),
  ref("L10-cascade-desktops-sherbet", "sherbet", auto, "cascade", DESKTOPS.slice(0, 3)),
  ref("L11-cascade-desktops-midnight", "midnight", wide, "cascade", DESKTOPS.slice(0, 5)),
  ref("L12-cascade-phones-soft-grey", "soft-grey", auto, "cascade", phones(4)),
  ref("L13-fan-phones-soft-grey", "soft-grey", auto, "fan", phones(3)),
  ref("L14-fan-phones-midnight", "midnight", square, "fan", phones(5)),
  ref("L15-fan-desktops-sherbet", "sherbet", wide, "fan", DESKTOPS.slice(0, 3)),
  ref("L16-grid-desktops-sherbet", "sherbet", auto, "grid", DESKTOPS.slice(0, 4)),
  ref("L17-grid-phones-soft-grey", "soft-grey", auto, "grid", phones(6)),
  ref("L18-grid-mixed-midnight", "midnight", wide, "grid", [
    DESKTOPS[0]!,
    PHONES[0]!,
    DESKTOPS[1]!,
    PHONES[1]!,
    DESKTOPS[2]!,
  ]),
  // Styles that change the whole group: a tilted plane and floor reflections.
  ref("L19-grid-isometric-grape-soda", "grape-soda", wide, "grid", DESKTOPS.slice(0, 6)),
  ref(
    "L20-side-by-side-reflection-bubblegum",
    "bubblegum",
    auto,
    "side-by-side",
    DESKTOPS.slice(0, 2),
  ),
  // Empty slots as the editor shows them.
  ref(
    "L21-placeholder-side-by-side-soft-grey",
    "soft-grey",
    auto,
    "side-by-side",
    [PHONES[0]!, PHONES[1]!, { id: null }],
    {},
    true,
  ),
  ref(
    "L22-placeholder-cascade-midnight",
    "midnight",
    wide,
    "cascade",
    [DESKTOPS[0]!, { id: null }, DESKTOPS[2]!],
    {},
    true,
  ),
];
