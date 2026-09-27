/** Types shared by the animation timeline, motion presets and encoders. */
import type { AssetResolver } from "../assets/types";
import type { Palette } from "../palette/extract";
import type { AnimationSpec, MotionEasing, MotionLoop, Scene } from "../scene/types";

/** Everything a motion needs besides the scene: resolved assets and palette. */
export interface MotionContext {
  assets: AssetResolver;
  /** Palette of the content (resolves `auto` backgrounds for drift). */
  palette?: Palette | null;
}

/** One sampled instant of a motion. */
export interface MotionFrame {
  /** Seconds from the start of the loop. */
  t: number;
  /** t / duration in [0, 1): the phase of periodic motions. */
  phase: number;
  /** Un-eased progress of non-periodic motions, 0 (start pose) .. 1 (end pose). */
  raw: number;
  /** Eased progress (may overshoot 1 with the bouncy easing). */
  u: number;
  /** Movement scale (spec.intensity). */
  intensity: number;
  spec: AnimationSpec;
}

export interface MotionPreset {
  id: string;
  label: string;
  /** One line for tooltips and screen readers. */
  description: string;
  /** Periodic motions loop seamlessly and ignore `spec.loop`. */
  periodic: boolean;
  /**
   * Part of the loop a non-periodic "once" motion plays in (fractions of the
   * duration); the rest holds. Default [0, 0.72].
   */
  onceWindow?: [number, number];
  /** Where annotation draw-on happens, in `raw` (non-periodic) or `phase` (periodic) units. */
  annotationWindow: [number, number];
  /** Whether annotations draw on by default when the preset is picked. */
  drawsAnnotations: boolean;
  /** Defaults applied when the user picks the preset. */
  defaults: { duration: number; easing: MotionEasing; loop: MotionLoop };
  /**
   * Structural changes shared by every frame (e.g. the viewport crop of the
   * scroll motion). The canvas size is pinned to this reference scene.
   */
  prepare?(scene: Scene, ctx: MotionContext): Scene;
  /**
   * The pose at one instant, from the prepared reference scene (`original` is
   * the scene before `prepare`). Must be pure.
   */
  apply(scene: Scene, frame: MotionFrame, ctx: MotionContext, original: Scene): Scene;
}
