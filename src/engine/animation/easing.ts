/**
 * Easing curves for the animation timeline. Pure functions of t in [0, 1];
 * the cubic-bézier solver runs a fixed number of iterations so the result is
 * bit-identical on every run and in every JS engine.
 */
import type { MotionEasing } from "../scene/types";

export type Ease = (t: number) => number;

const clamp01 = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t);

/** CSS-style cubic-bézier(x1, y1, x2, y2). */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): Ease {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sx = (u: number) => ((ax * u + bx) * u + cx) * u;
  const sy = (u: number) => ((ay * u + by) * u + cy) * u;
  const dx = (u: number) => (3 * ax * u + 2 * bx) * u + cx;
  return (t: number) => {
    const x = clamp01(t);
    if (x === 0 || x === 1) return x;
    // Newton-Raphson (fixed 8 steps), then 24 bisection steps as a safety net.
    let u = x;
    for (let i = 0; i < 8; i++) {
      const err = sx(u) - x;
      const d = dx(u);
      if (Math.abs(d) < 1e-7) break;
      u -= err / d;
    }
    if (!(u >= 0 && u <= 1) || Math.abs(sx(u) - x) > 1e-7) {
      let lo = 0;
      let hi = 1;
      u = x;
      for (let i = 0; i < 24; i++) {
        if (sx(u) < x) lo = u;
        else hi = u;
        u = (lo + hi) / 2;
      }
    }
    return sy(u);
  };
}

export const linear: Ease = (t) => clamp01(t);
/** Motion tokens from the design system (docs/design/system/motion.md). */
export const easeInOut = cubicBezier(0.65, 0, 0.35, 1);
export const easeOut = cubicBezier(0.22, 1, 0.36, 1);
export const easeIn = cubicBezier(0.55, 0, 1, 0.45);
export const easePop = cubicBezier(0.34, 1.56, 0.64, 1);
export const easeSine: Ease = (t) => (1 - Math.cos(Math.PI * clamp01(t))) / 2;

/** Overshooting ease-out with a gentle settle, like the design system's drop spring. */
export const easeBack: Ease = (t) => {
  const x = clamp01(t);
  const s = 1.70158;
  const u = x - 1;
  return 1 + (s + 1) * u * u * u + s * u * u;
};

export const EASINGS: Record<MotionEasing, Ease> = {
  smooth: easeInOut,
  snappy: easeOut,
  gentle: easeSine,
  bounce: easePop,
  linear,
};

export const EASING_LABELS: Record<MotionEasing, string> = {
  smooth: "Smooth",
  snappy: "Snappy",
  gentle: "Gentle",
  bounce: "Bouncy",
  linear: "Linear",
};

export function getEasing(id: MotionEasing): Ease {
  return EASINGS[id] ?? easeInOut;
}

/** Map t from [a, b] to [0, 1], clamped. */
export function window01(t: number, a: number, b: number): number {
  if (b <= a) return t >= b ? 1 : 0;
  return clamp01((t - a) / (b - a));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
