/**
 * The animation timeline: a pure function from (scene, time) to the scene
 * pose at that instant. Frame n of an export is
 *
 *   renderScene(ctx, evaluateFrame(scene, n, ctx), assets, { scale })
 *
 * so the same scene always yields the same pixels for the same frame, on the
 * main thread, in the export worker and in tests. No clocks, no randomness.
 */
import { contentToCanvas } from "../layout/layout";
import { layoutScene } from "../render/render";
import { setIn } from "../scene/patch";
import type { Annotation, AnimationSpec, Scene } from "../scene/types";
import { isVideoScene, motionTimeInClip } from "../video/clip";
import { getEasing, window01 } from "./easing";
import { getMotionPreset } from "./presets";
import type { MotionContext, MotionFrame, MotionPreset } from "./types";

/**
 * Animation settings for a freshly picked preset: its duration, easing, loop
 * and draw-on defaults, keeping the user's fps, intensity and focus point.
 */
export function createAnimation(presetId: string, prev?: AnimationSpec): AnimationSpec {
  const p = getMotionPreset(presetId);
  return {
    preset: presetId,
    duration: p?.defaults.duration ?? 3,
    fps: prev?.fps ?? 30,
    easing: p?.defaults.easing ?? "smooth",
    loop: p?.defaults.loop ?? "once",
    intensity: prev?.intensity ?? 1,
    annotations: p?.drawsAnnotations ?? true,
    focusX: prev?.focusX ?? 0.5,
    focusY: prev?.focusY ?? 0.5,
  };
}

/** Number of frames in one loop at `fps` (at least 2). */
export function frameCount(duration: number, fps: number): number {
  return Math.max(2, Math.round(duration * fps));
}

/** Time in seconds of frame n. */
export function frameTime(n: number, fps: number): number {
  return n / fps;
}

/**
 * GIF frame delays in centiseconds whose running sum tracks the exact
 * timeline (GIF delays are whole centiseconds, so 30 fps alternates 3/4 cs).
 */
export function gifDelays(frames: number, fps: number): number[] {
  const out: number[] = [];
  for (let n = 0; n < frames; n++) {
    out.push(Math.round(((n + 1) * 100) / fps) - Math.round((n * 100) / fps));
  }
  return out;
}

/** Sample a motion at time t (seconds). */
export function motionFrame(spec: AnimationSpec, preset: MotionPreset, t: number): MotionFrame {
  const D = spec.duration;
  // Wrap into one loop; frame count * (1/fps) == duration for whole-frame loops.
  const tt = ((t % D) + D) % D;
  const phase = tt / D;
  let raw: number;
  if (preset.periodic) raw = phase;
  else if (spec.loop === "boomerang") {
    // there (40 %), hold (20 %), back (40 %): frame N == frame 0, so it loops seamlessly.
    raw = phase < 0.4 ? phase / 0.4 : phase < 0.6 ? 1 : 1 - (phase - 0.6) / 0.4;
  } else {
    const [a, b] = preset.onceWindow ?? [0, 0.72];
    raw = window01(phase, a, b);
  }
  const u = preset.periodic ? phase : getEasing(spec.easing)(raw);
  return { t: tt, phase, raw, u, intensity: spec.intensity, spec };
}

/** Staggered draw-on progress for each annotation (redactions are never hidden). */
export function revealAnnotations(annotations: Annotation[], w: number): Annotation[] {
  const drawable = annotations.filter((a) => a.kind !== "redact");
  const n = drawable.length;
  if (n === 0) return annotations;
  const len = n === 1 ? 1 : Math.min(1, Math.max(0.34, 1.6 / n));
  let i = 0;
  return annotations.map((a) => {
    if (a.kind === "redact") return a;
    const start = n === 1 ? 0 : (i * (1 - len)) / (n - 1);
    i++;
    const reveal = window01(w, start, start + len);
    return reveal >= 1 ? a : { ...a, reveal };
  });
}

/**
 * Keep the canvas and the card's pixels-per-unit fixed across frames: auto
 * and aspect canvases hug the (tilted) card, so without pinning, the output
 * size and the card's scale would breathe as the card moves.
 */
function pinCanvas(reference: Scene, pose: Scene, ctx: MotionContext): Scene {
  const refLayout = layoutScene(reference, ctx.assets);
  let out = pose;
  if (reference.canvas.size.kind !== "fixed") {
    out = setIn(out, ["canvas", "size"], {
      kind: "fixed",
      width: refLayout.canvas.width,
      height: refLayout.canvas.height,
    });
  }
  const refFit = refLayout.k / reference.card.transform.scale;
  const probe = setIn(out, ["card", "transform", "scale"], 1);
  const fit = layoutScene(probe, ctx.assets).k;
  if (fit > 0 && Number.isFinite(refFit / fit)) {
    out = setIn(out, ["card", "transform", "scale"], out.card.transform.scale * (refFit / fit));
  }
  return out;
}

/** The scene every frame is derived from (after the preset's structural prep). */
export function motionReference(scene: Scene, ctx: MotionContext): Scene {
  const spec = scene.animation;
  const preset = spec ? getMotionPreset(spec.preset) : undefined;
  if (!spec || !preset?.prepare) return scene;
  return preset.prepare(scene, ctx);
}

/** The scene pose at time t (seconds). Returns the scene unchanged when it has no motion. */
export function evaluateScene(scene: Scene, t: number, ctx: MotionContext): Scene {
  const spec = scene.animation;
  const preset = spec ? getMotionPreset(spec.preset) : undefined;
  if (!spec || !preset) return scene;
  const reference = motionReference(scene, ctx);
  // A recording runs longer than one motion (see motionTimeInClip).
  const tm = isVideoScene(scene) ? motionTimeInClip(spec, preset.periodic, t) : t;
  const frame = motionFrame(spec, preset, tm);
  let pose = preset.apply(reference, frame, ctx, scene);
  if (spec.annotations && pose.annotations.length) {
    const [a, b] = preset.annotationWindow;
    const w = window01(preset.periodic ? frame.phase : frame.raw, a, b);
    pose = { ...pose, annotations: revealAnnotations(pose.annotations, w) };
  }
  return pinCanvas(reference, pose, ctx);
}

/** The scene pose of frame n. */
export function evaluateFrame(scene: Scene, n: number, ctx: MotionContext): Scene {
  const fps = scene.animation?.fps ?? 30;
  return evaluateScene(scene, frameTime(n, fps), ctx);
}

/** Canvas px of a normalized content point in a scene (helper for focus motions). */
export function contentPointOnCanvas(scene: Scene, ctx: MotionContext, x: number, y: number) {
  return contentToCanvas(layoutScene(scene, ctx.assets), x, y);
}
