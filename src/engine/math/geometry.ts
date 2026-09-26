/** Basic 2D geometry primitives shared by layout, frames and rendering. */

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Per-corner radii, clockwise from top-left: [tl, tr, br, bl]. */
export type Radii = readonly [number, number, number, number];

export const rect = (x: number, y: number, width: number, height: number): Rect => ({
  x,
  y,
  width,
  height,
});

export function uniformRadii(r: number): Radii {
  return [r, r, r, r];
}

export function insetRect(r: Rect, d: number): Rect {
  return { x: r.x + d, y: r.y + d, width: r.width - 2 * d, height: r.height - 2 * d };
}

export function expandRadii(radii: Radii, d: number): Radii {
  return radii.map((r) => (r > 0 ? Math.max(0, r + d) : 0)) as unknown as Radii;
}

export function translateRect(r: Rect, dx: number, dy: number): Rect {
  return { ...r, x: r.x + dx, y: r.y + dy };
}

export function scaleRect(r: Rect, s: number): Rect {
  return { x: r.x * s, y: r.y * s, width: r.width * s, height: r.height * s };
}

export function unionRect(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const r = Math.max(a.x + a.width, b.x + b.width);
  const bt = Math.max(a.y + a.height, b.y + b.height);
  return { x, y, width: r - x, height: bt - y };
}

export function boundsOfPoints(points: readonly Point[]): Rect {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function rectCorners(r: Rect): [Point, Point, Point, Point] {
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.width, y: r.y },
    { x: r.x + r.width, y: r.y + r.height },
    { x: r.x, y: r.y + r.height },
  ];
}

/** Largest size with the aspect ratio of `inner` that fits inside `outer` ("contain"). */
export function containSize(inner: Size, outer: Size): Size {
  const s = Math.min(outer.width / inner.width, outer.height / inner.height);
  return { width: inner.width * s, height: inner.height * s };
}

/** Smallest size with the aspect ratio of `inner` that covers `outer` ("cover"). */
export function coverSize(inner: Size, outer: Size): Size {
  const s = Math.max(outer.width / inner.width, outer.height / inner.height);
  return { width: inner.width * s, height: inner.height * s };
}

/** Rect of `inner` placed with cover semantics inside `outer`, aligned by `focus` (0..1). */
export function coverRect(inner: Size, outer: Rect, focus: Point = { x: 0.5, y: 0.5 }): Rect {
  const s = coverSize(inner, outer);
  return {
    x: outer.x + (outer.width - s.width) * focus.x,
    y: outer.y + (outer.height - s.height) * focus.y,
    width: s.width,
    height: s.height,
  };
}

export function containRect(inner: Size, outer: Rect): Rect {
  const s = containSize(inner, outer);
  return {
    x: outer.x + (outer.width - s.width) / 2,
    y: outer.y + (outer.height - s.height) / 2,
    width: s.width,
    height: s.height,
  };
}

export function clamp(n: number, min: number, max: number): number {
  return n < min ? min : n > max ? max : n;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function degToRad(d: number): number {
  return (d * Math.PI) / 180;
}

/** Greatest common divisor, for simplifying aspect ratios. */
export function gcd(a: number, b: number): number {
  a = Math.abs(Math.round(a));
  b = Math.abs(Math.round(b));
  while (b) [a, b] = [b, a % b];
  return a || 1;
}
