/**
 * Motion presets: a registry of pure pose functions over the scene model.
 *
 * Each preset moves existing scene fields (card transform and tilt, shadow
 * strength, background fill geometry, content crop, annotation reveal), so
 * every frame goes through the unchanged renderer. Register more with
 * `registerMotionPreset`.
 */
import { resolveAutoFill } from "../palette/suggest";
import { setIn } from "../scene/patch";
import type { BackgroundFill, Scene } from "../scene/types";
import { layoutScene } from "../render/render";
import { contentToCanvas } from "../layout/layout";
import { STILL_MOTION_ID } from "../video/clip";
import { lerp } from "./easing";
import type { MotionContext, MotionFrame, MotionPreset } from "./types";

const TAU = Math.PI * 2;
const registry = new Map<string, MotionPreset>();

export function registerMotionPreset(p: MotionPreset): void {
  registry.set(p.id, p);
}

export function getMotionPreset(id: string): MotionPreset | undefined {
  return registry.get(id);
}

export function listMotionPresets(): MotionPreset[] {
  return [...registry.values()];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function withCard(scene: Scene, patch: (c: Scene["card"]) => Partial<Scene["card"]>): Scene {
  return { ...scene, card: { ...scene.card, ...patch(scene.card) } };
}

/** Background fill drifted along a seamless loop (phase 0 == the fill itself). */
export function driftFill(
  fill: BackgroundFill,
  phase: number,
  amount: number,
  ctx: MotionContext,
): BackgroundFill {
  const s = Math.sin(TAU * phase);
  const c = Math.cos(TAU * phase);
  switch (fill.kind) {
    case "auto":
      return driftFill(resolveAutoFill(fill, ctx.palette ?? null), phase, amount, ctx);
    case "linear":
      return { ...fill, angle: fill.angle + 38 * amount * s };
    case "radial":
      return {
        ...fill,
        cx: fill.cx + 0.14 * amount * s,
        cy: fill.cy + 0.1 * amount * (1 - c),
      };
    case "conic":
      return { ...fill, angle: fill.angle + 360 * phase * Math.sign(amount || 1) };
    case "mesh":
      return {
        ...fill,
        points: fill.points.map((p, i) => {
          // Each point orbits its home on a circle; phase 0 is the home position.
          const phi = i * 2.39996; // golden angle keeps neighbours out of step
          const dir = i % 2 ? 1 : -1;
          const r = 0.085 * amount;
          const a = TAU * phase * dir + phi;
          return {
            ...p,
            x: p.x + r * (Math.cos(a) - Math.cos(phi)),
            y: p.y + r * (Math.sin(a) - Math.sin(phi)),
          };
        }),
      };
    case "image":
      return {
        ...fill,
        focusX: Math.min(1, Math.max(0, fill.focusX + 0.08 * amount * s)),
        focusY: Math.min(1, Math.max(0, fill.focusY + 0.05 * amount * (1 - c))),
      };
    default:
      return fill;
  }
}

function drift(scene: Scene, phase: number, amount: number, ctx: MotionContext): Scene {
  const fill = driftFill(scene.background.fill, phase, amount, ctx);
  return fill === scene.background.fill ? scene : setIn(scene, ["background", "fill"], fill);
}

/** Natural pixel size of the content, if known. */
function contentSize(scene: Scene, ctx: MotionContext): { width: number; height: number } | null {
  const c = scene.content;
  if (c.kind === "image") {
    if (!c.assetId) return null;
    const a = ctx.assets.get(c.assetId);
    return a ? { width: a.width, height: a.height } : null;
  }
  return layoutScene(scene, ctx.assets).contentPixels;
}

/** Visible height / width of the scroll viewport for the scene's frame. */
function viewportAspect(scene: Scene): number {
  switch (scene.card.frame.id) {
    case "phone":
      return 19.5 / 9;
    case "tablet":
      return 4 / 3;
    default:
      return 10 / 16;
  }
}

/** Fraction of the (cropped) content height visible in the scroll viewport. */
export function scrollViewport(scene: Scene, ctx: MotionContext): number {
  const size = contentSize(scene, ctx);
  if (!size || scene.content.kind !== "image") return 1;
  const crop = scene.content.crop ?? { x: 0, y: 0, width: 1, height: 1 };
  const w = size.width * crop.width;
  const h = size.height * crop.height;
  return Math.min(1, (w * viewportAspect(scene)) / h);
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

/** Camera push-in: the card rises and straightens from a tilted, distant start. */
registerMotionPreset({
  id: "reveal",
  label: "Zoom in",
  description: "The card rises towards the camera and settles flat.",
  periodic: false,
  annotationWindow: [0.55, 1],
  drawsAnnotations: true,
  defaults: { duration: 3.5, easing: "snappy", loop: "once" },
  apply(scene, f) {
    const k = f.intensity;
    const u = f.u;
    return withCard(scene, (c) => ({
      transform: {
        ...c.transform,
        scale: c.transform.scale * lerp(1 - 0.26 * k, 1, u),
        offsetY: c.transform.offsetY + lerp(0.08 * k, 0, u),
      },
      tilt: { ...c.tilt, rotateX: c.tilt.rotateX + lerp(24 * k, 0, u) },
      shadow: { ...c.shadow, strength: c.shadow.strength * lerp(0.35, 1, Math.min(1, u)) },
    }));
  },
});

/** Zoom into a point of the content (like a screen recording's zoom-in). */
registerMotionPreset({
  id: "focus",
  label: "Focus",
  description: "Zooms into a detail, then holds.",
  periodic: false,
  onceWindow: [0.14, 0.64],
  annotationWindow: [0.6, 1],
  drawsAnnotations: false,
  defaults: { duration: 4, easing: "smooth", loop: "boomerang" },
  apply(scene, f, ctx) {
    const Z = 1 + 0.9 * f.intensity;
    const z = lerp(1, Z, f.u);
    const layout = layoutScene(scene, ctx.assets);
    const W = layout.canvas.width;
    const H = layout.canvas.height;
    const { spec } = f;
    const fp = contentToCanvas(layout, spec.focusX, spec.focusY);
    const t = scene.card.transform;
    const C = { x: W / 2 + t.offsetX * W, y: H / 2 + t.offsetY * H };
    // Glide the focus point towards the canvas centre while zooming around it.
    const target = { x: lerp(fp.x, W / 2, f.u), y: lerp(fp.y, H / 2, f.u) };
    const nc = { x: target.x - z * (fp.x - C.x), y: target.y - z * (fp.y - C.y) };
    return withCard(scene, (c) => ({
      transform: {
        scale: c.transform.scale * z,
        offsetX: (nc.x - W / 2) / W,
        offsetY: (nc.y - H / 2) / H,
      },
    }));
  },
});

/** Scroll a tall screenshot through a viewport (a Ken Burns pan). */
registerMotionPreset({
  id: "scroll",
  label: "Scroll",
  description: "Pans down a tall screenshot, like scrolling the page.",
  periodic: false,
  onceWindow: [0.12, 0.84],
  annotationWindow: [0.7, 1],
  drawsAnnotations: false,
  defaults: { duration: 6, easing: "smooth", loop: "boomerang" },
  prepare(scene, ctx) {
    const v = scrollViewport(scene, ctx);
    if (v >= 0.98 || scene.content.kind !== "image") return scene;
    const crop = scene.content.crop ?? { x: 0, y: 0, width: 1, height: 1 };
    return {
      ...scene,
      content: { ...scene.content, crop: { ...crop, height: crop.height * v } },
      // Annotations are placed on the whole screenshot; they would not line up.
      annotations: scene.annotations.filter((a) => a.anchor === "canvas"),
    };
  },
  apply(scene, f, _ctx, original) {
    const c = scene.content;
    const oc = original.content;
    if (c.kind !== "image" || oc.kind !== "image" || !c.crop || c.crop === oc.crop) {
      // Not tall enough to scroll: a slow Ken Burns push instead.
      const k = f.intensity;
      return withCard(scene, (card) => ({
        transform: {
          scale: card.transform.scale * lerp(1, 1 + 0.14 * k, f.u),
          offsetX: card.transform.offsetX + lerp(0.02 * k, -0.02 * k, f.u),
          offsetY: card.transform.offsetY + lerp(0.015 * k, -0.01 * k, f.u),
        },
      }));
    }
    const full = oc.crop ?? { x: 0, y: 0, width: 1, height: 1 };
    const travel = Math.max(0, full.height - c.crop.height);
    const y = full.y + travel * Math.min(1, Math.max(0, f.u));
    return { ...scene, content: { ...c, crop: { ...c.crop, y } } };
  },
});

/** Gentle 3D sway around the vertical axis. */
registerMotionPreset({
  id: "sweep",
  label: "3D sweep",
  description: "Swings gently in 3D and back, looping forever.",
  periodic: true,
  annotationWindow: [0.06, 0.5],
  drawsAnnotations: false,
  defaults: { duration: 5, easing: "gentle", loop: "once" },
  apply(scene, f) {
    const k = f.intensity;
    const s = Math.sin(TAU * f.phase);
    const c = Math.cos(TAU * f.phase);
    return withCard(scene, (card) => ({
      tilt: {
        ...card.tilt,
        rotateY: card.tilt.rotateY + 20 * k * s,
        rotateX: card.tilt.rotateX + 9 * k * ((1 - c) / 2),
      },
    }));
  },
});

/** Bob up and down with a softening shadow, over a drifting background. */
registerMotionPreset({
  id: "float",
  label: "Float",
  description: "Bobs softly while the background drifts.",
  periodic: true,
  annotationWindow: [0.06, 0.5],
  drawsAnnotations: false,
  defaults: { duration: 4, easing: "gentle", loop: "once" },
  apply(scene, f, ctx) {
    const k = f.intensity;
    const s = Math.sin(TAU * f.phase);
    const moved = withCard(scene, (card) => ({
      transform: { ...card.transform, offsetY: card.transform.offsetY - 0.022 * k * s },
      tilt: { ...card.tilt, rotateZ: card.tilt.rotateZ + 0.9 * k * Math.sin(2 * TAU * f.phase) },
      shadow: { ...card.shadow, strength: card.shadow.strength * (1 - 0.22 * k * s) },
    }));
    return drift(moved, f.phase, 0.45 * k, ctx);
  },
});

/** Only the background moves. */
registerMotionPreset({
  id: "drift",
  label: "Drift",
  description: "The background colours drift in a seamless loop.",
  periodic: true,
  annotationWindow: [0.06, 0.5],
  drawsAnnotations: false,
  defaults: { duration: 6, easing: "gentle", loop: "once" },
  apply: (scene, f, ctx) => drift(scene, f.phase, f.intensity, ctx),
});

/** Annotations draw themselves on; the card stays put. */
registerMotionPreset({
  id: "draw",
  label: "Draw on",
  description: "Arrows draw, highlights pop and text types, one after another.",
  periodic: false,
  onceWindow: [0.04, 0.78],
  annotationWindow: [0, 1],
  drawsAnnotations: true,
  defaults: { duration: 3, easing: "linear", loop: "once" },
  apply: (scene) => scene,
});

/** Flip in from edge-on. */
registerMotionPreset({
  id: "flip",
  label: "Flip in",
  description: "Turns in from the side with a little bounce.",
  periodic: false,
  annotationWindow: [0.6, 1],
  drawsAnnotations: true,
  defaults: { duration: 3, easing: "bounce", loop: "once" },
  apply(scene, f) {
    const k = f.intensity;
    return withCard(scene, (c) => ({
      transform: { ...c.transform, scale: c.transform.scale * lerp(0.86, 1, Math.min(1, f.u)) },
      tilt: {
        ...c.tilt,
        rotateY: c.tilt.rotateY + lerp(-62 * Math.min(1.2, k), 0, f.u),
        rotateX: c.tilt.rotateX + lerp(8 * k, 0, f.u),
      },
      shadow: { ...c.shadow, strength: c.shadow.strength * lerp(0.2, 1, Math.min(1, f.u)) },
    }));
  },
});

/**
 * No motion, for screen recordings: the card holds still while the recording
 * plays (see video/clip.ts). Not offered as a tile; "None" maps to it.
 */
registerMotionPreset({
  id: STILL_MOTION_ID,
  label: "None",
  description: "The recording plays; the design holds still.",
  periodic: true,
  annotationWindow: [0, 0.0001],
  drawsAnnotations: false,
  defaults: { duration: 3, easing: "smooth", loop: "once" },
  apply: (scene) => scene,
});

export type { MotionFrame };
