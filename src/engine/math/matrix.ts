/**
 * Projective (3x3) and 3D maths for tilt/perspective.
 *
 * A Mat3 is row-major [a, b, c, d, e, f, g, h, i] mapping (x, y, 1) to
 * (a x + b y + c, d x + e y + f, g x + h y + i) followed by the perspective divide.
 * An affine map has g = h = 0 and i = 1.
 */
import { type Point, type Rect, degToRad } from "./geometry";

export type Mat3 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export function multiply(m: Mat3, n: Mat3): Mat3 {
  return [
    m[0] * n[0] + m[1] * n[3] + m[2] * n[6],
    m[0] * n[1] + m[1] * n[4] + m[2] * n[7],
    m[0] * n[2] + m[1] * n[5] + m[2] * n[8],
    m[3] * n[0] + m[4] * n[3] + m[5] * n[6],
    m[3] * n[1] + m[4] * n[4] + m[5] * n[7],
    m[3] * n[2] + m[4] * n[5] + m[5] * n[8],
    m[6] * n[0] + m[7] * n[3] + m[8] * n[6],
    m[6] * n[1] + m[7] * n[4] + m[8] * n[7],
    m[6] * n[2] + m[7] * n[5] + m[8] * n[8],
  ];
}

export function translation(tx: number, ty: number): Mat3 {
  return [1, 0, tx, 0, 1, ty, 0, 0, 1];
}

export function scaling(sx: number, sy = sx): Mat3 {
  return [sx, 0, 0, 0, sy, 0, 0, 0, 1];
}

export function rotation(rad: number): Mat3 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [c, -s, 0, s, c, 0, 0, 0, 1];
}

export function applyMat3(m: Mat3, p: Point): Point {
  const w = m[6] * p.x + m[7] * p.y + m[8];
  return {
    x: (m[0] * p.x + m[1] * p.y + m[2]) / w,
    y: (m[3] * p.x + m[4] * p.y + m[5]) / w,
  };
}

export function invert(m: Mat3): Mat3 | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;
  const inv = 1 / det;
  return [
    A * inv,
    -(b * i - c * h) * inv,
    (b * f - c * e) * inv,
    B * inv,
    (a * i - c * g) * inv,
    -(a * f - c * d) * inv,
    C * inv,
    -(a * h - b * g) * inv,
    (a * e - b * d) * inv,
  ];
}

export function isAffine(m: Mat3, eps = 1e-9): boolean {
  return Math.abs(m[6]) < eps && Math.abs(m[7]) < eps && Math.abs(m[8] - 1) < eps;
}

/**
 * Homography mapping the unit square (0,0),(1,0),(1,1),(0,1) onto the quad
 * p0..p3 (Heckbert, "Fundamentals of Texture Mapping", 1989).
 */
export function squareToQuad(p0: Point, p1: Point, p2: Point, p3: Point): Mat3 {
  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;
  const sx = p0.x - p1.x + p2.x - p3.x;
  const sy = p0.y - p1.y + p2.y - p3.y;
  if (Math.abs(sx) < 1e-12 && Math.abs(sy) < 1e-12) {
    return [p1.x - p0.x, p3.x - p0.x, p0.x, p1.y - p0.y, p3.y - p0.y, p0.y, 0, 0, 1];
  }
  const det = dx1 * dy2 - dx2 * dy1;
  const g = (sx * dy2 - dx2 * sy) / det;
  const h = (dx1 * sy - sx * dy1) / det;
  return [
    p1.x - p0.x + g * p1.x,
    p3.x - p0.x + h * p3.x,
    p0.x,
    p1.y - p0.y + g * p1.y,
    p3.y - p0.y + h * p3.y,
    p0.y,
    g,
    h,
    1,
  ];
}

/** Homography mapping the rectangle `src` onto the quad `dst` (tl, tr, br, bl). */
export function rectToQuad(src: Rect, dst: readonly [Point, Point, Point, Point]): Mat3 {
  const sq = squareToQuad(dst[0], dst[1], dst[2], dst[3]);
  const norm: Mat3 = [
    1 / src.width,
    0,
    -src.x / src.width,
    0,
    1 / src.height,
    -src.y / src.height,
    0,
    0,
    1,
  ];
  return multiply(sq, norm);
}

// ---------------------------------------------------------------------------
// 3D tilt
// ---------------------------------------------------------------------------

export interface Tilt3D {
  /** Rotation around the horizontal axis, degrees. Positive tips the top away. */
  rotateX: number;
  /** Rotation around the vertical axis, degrees. Positive turns the right side away. */
  rotateY: number;
  /** In-plane rotation, degrees, clockwise. */
  rotateZ: number;
  /** Camera distance as a multiple of the card's larger side. Larger = flatter. */
  perspective: number;
}

export function isFlatTilt(t: Tilt3D): boolean {
  return Math.abs(t.rotateX) < 1e-6 && Math.abs(t.rotateY) < 1e-6;
}

/**
 * Project a point on the card plane (card-local coordinates, centred on the
 * card centre) through rotateZ -> rotateX -> rotateY and a pinhole camera at
 * distance `d`. Mirrors CSS `perspective(d) rotateY() rotateX() rotateZ()`.
 */
export function projectTiltPoint(p: Point, t: Tilt3D, d: number): Point {
  const rz = degToRad(t.rotateZ);
  const rx = degToRad(t.rotateX);
  const ry = degToRad(t.rotateY);
  // rotateZ (in-plane)
  let x = p.x * Math.cos(rz) - p.y * Math.sin(rz);
  let y = p.x * Math.sin(rz) + p.y * Math.cos(rz);
  let z = 0;
  // rotateX: y/z plane
  const y1 = y * Math.cos(rx) - z * Math.sin(rx);
  const z1 = y * Math.sin(rx) + z * Math.cos(rx);
  y = y1;
  z = z1;
  // rotateY: x/z plane (positive turns the right edge away from the viewer)
  const x2 = x * Math.cos(ry) + z * Math.sin(ry);
  const z2 = -x * Math.sin(ry) + z * Math.cos(ry);
  x = x2;
  z = z2;
  // Perspective: the viewer sits at z = +d looking down -z.
  const f = d / (d - z);
  return { x: x * f, y: y * f };
}

/**
 * Homography mapping card-local coordinates (origin at the card's top-left,
 * size w x h) to projected coordinates centred on the card centre.
 */
export function tiltHomography(width: number, height: number, t: Tilt3D): Mat3 {
  const d = Math.max(0.5, t.perspective) * Math.max(width, height);
  const hw = width / 2;
  const hh = height / 2;
  const q = [
    projectTiltPoint({ x: -hw, y: -hh }, t, d),
    projectTiltPoint({ x: hw, y: -hh }, t, d),
    projectTiltPoint({ x: hw, y: hh }, t, d),
    projectTiltPoint({ x: -hw, y: hh }, t, d),
  ] as const;
  return rectToQuad({ x: 0, y: 0, width, height }, q);
}
