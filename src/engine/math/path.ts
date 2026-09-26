/**
 * Path model: a small command list that can be replayed on any Canvas 2D
 * context, transformed, or flattened into polygons (needed to project shapes
 * through a perspective homography for tilted shadows).
 *
 * Continuous ("squircle") corners follow Figma's corner-smoothing construction
 * (https://www.figma.com/blog/desperately-seeking-squircles/): each corner is a
 * cubic lead-in, a circular arc and a cubic lead-out. smoothing = 0 gives a
 * plain circular corner; ~0.6 matches iOS.
 */
import { type Point, type Radii, type Rect, degToRad } from "./geometry";
import { type Mat3, applyMat3 } from "./matrix";

export type PathCommand =
  | { op: "M"; x: number; y: number }
  | { op: "L"; x: number; y: number }
  | { op: "C"; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { op: "A"; cx: number; cy: number; r: number; a0: number; a1: number }
  | { op: "Z" };

export type Path = PathCommand[];

/** Minimal subset of CanvasRenderingContext2D / Path2D used to replay paths. */
export interface PathSink {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  bezierCurveTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number): void;
  arc(x: number, y: number, r: number, a0: number, a1: number, ccw?: boolean): void;
  closePath(): void;
}

export function tracePath(sink: PathSink, path: Path): void {
  for (const c of path) {
    switch (c.op) {
      case "M":
        sink.moveTo(c.x, c.y);
        break;
      case "L":
        sink.lineTo(c.x, c.y);
        break;
      case "C":
        sink.bezierCurveTo(c.x1, c.y1, c.x2, c.y2, c.x, c.y);
        break;
      case "A":
        sink.arc(c.cx, c.cy, c.r, c.a0, c.a1, c.a1 < c.a0);
        break;
      case "Z":
        sink.closePath();
        break;
    }
  }
}

interface CornerParams {
  a: number;
  b: number;
  c: number;
  d: number;
  p: number;
  arcLen: number;
  radius: number;
}

function cornerParams(radius: number, smoothing: number, budget: number): CornerParams {
  const r = Math.min(radius, budget);
  let s = smoothing;
  let p = (1 + s) * r;
  // Never let the smoothed corner exceed half of the shorter side.
  const maxSmoothing = r > 0 ? budget / r - 1 : 0;
  s = Math.max(0, Math.min(s, maxSmoothing));
  p = Math.min(p, budget);
  const arcMeasure = 90 * (1 - s);
  const arcLen = Math.sin(degToRad(arcMeasure / 2)) * r * Math.SQRT2;
  const angleAlpha = (90 - arcMeasure) / 2;
  const p3ToP4 = r * Math.tan(degToRad(angleAlpha / 2));
  const angleBeta = 45 * s;
  const c = p3ToP4 * Math.cos(degToRad(angleBeta));
  const d = c * Math.tan(degToRad(angleBeta));
  const b = Math.max(0, (p - arcLen - c - d) / 3);
  const a = 2 * b;
  return { a, b, c, d, p, arcLen, radius: r };
}

/**
 * Canonical top-right corner, with the corner point at the origin, the top edge
 * along -x and the right edge along +y. Returns the commands after the initial
 * point (-p, 0), ending at (0, p).
 */
function canonicalCorner(k: CornerParams): PathCommand[] {
  if (k.radius <= 0) return [{ op: "L", x: 0, y: 0 }];
  const { a, b, c, d, p, arcLen: L, radius: R } = k;
  const p1 = { x: -p + a + b + c, y: d };
  const p2 = { x: p1.x + L, y: p1.y + L };
  // The arc's centre lies on the diagonal y = -x at distance R from p1.
  const tangent = Math.hypot(c, d) > 1e-9 ? { x: c, y: d } : { x: 1, y: 0 };
  const tl = Math.hypot(tangent.x, tangent.y);
  const cx = p1.x + (-tangent.y / tl) * R;
  const cy = p1.y + (tangent.x / tl) * R;
  const a0 = Math.atan2(p1.y - cy, p1.x - cx);
  const a1 = Math.atan2(p2.y - cy, p2.x - cx);
  return [
    { op: "C", x1: -p + a, y1: 0, x2: -p + a + b, y2: 0, x: p1.x, y: p1.y },
    { op: "A", cx, cy, r: R, a0, a1 },
    { op: "C", x1: p2.x + d, y1: p2.y + c, x2: p2.x + d, y2: p2.y + b + c, x: 0, y: p },
  ];
}

/** Rotate canonical corner commands by quarter turns and translate to `origin`. */
function placeCorner(cmds: PathCommand[], quarter: number, origin: Point): PathCommand[] {
  const cos = [1, 0, -1, 0][quarter]!;
  const sin = [0, 1, 0, -1][quarter]!;
  const tx = (x: number, y: number) => ({
    x: origin.x + x * cos - y * sin,
    y: origin.y + x * sin + y * cos,
  });
  const angle = (quarter * Math.PI) / 2;
  return cmds.map((c): PathCommand => {
    switch (c.op) {
      case "L":
      case "M": {
        const q = tx(c.x, c.y);
        return { op: c.op, x: q.x, y: q.y };
      }
      case "C": {
        const q1 = tx(c.x1, c.y1);
        const q2 = tx(c.x2, c.y2);
        const q = tx(c.x, c.y);
        return { op: "C", x1: q1.x, y1: q1.y, x2: q2.x, y2: q2.y, x: q.x, y: q.y };
      }
      case "A": {
        const q = tx(c.cx, c.cy);
        return { op: "A", cx: q.x, cy: q.y, r: c.r, a0: c.a0 + angle, a1: c.a1 + angle };
      }
      default:
        return c;
    }
  });
}

/**
 * Rounded rectangle path with per-corner radii and optional continuous-corner
 * smoothing (0..1). Traced clockwise starting on the top edge.
 */
export function roundedRectPath(r: Rect, radii: Radii | number, smoothing = 0): Path {
  const rs: Radii = typeof radii === "number" ? [radii, radii, radii, radii] : radii;
  const { x, y, width: w, height: h } = r;
  if (w <= 0 || h <= 0) return [];
  const budget = Math.min(w, h) / 2;
  const s = Math.max(0, Math.min(1, smoothing));
  const [tl, tr, br, bl] = rs.map((v) => cornerParams(Math.max(0, v), s, budget)) as [
    CornerParams,
    CornerParams,
    CornerParams,
    CornerParams,
  ];
  const path: Path = [{ op: "M", x: x + tl.p, y }];
  path.push({ op: "L", x: x + w - tr.p, y });
  path.push(...placeCorner(canonicalCorner(tr), 0, { x: x + w, y }));
  path.push({ op: "L", x: x + w, y: y + h - br.p });
  path.push(...placeCorner(canonicalCorner(br), 1, { x: x + w, y: y + h }));
  path.push({ op: "L", x: x + bl.p, y: y + h });
  path.push(...placeCorner(canonicalCorner(bl), 2, { x, y: y + h }));
  path.push({ op: "L", x, y: y + tl.p });
  path.push(...placeCorner(canonicalCorner(tl), 3, { x, y }));
  path.push({ op: "Z" });
  return path;
}

export function rectPath(r: Rect): Path {
  return [
    { op: "M", x: r.x, y: r.y },
    { op: "L", x: r.x + r.width, y: r.y },
    { op: "L", x: r.x + r.width, y: r.y + r.height },
    { op: "L", x: r.x, y: r.y + r.height },
    { op: "Z" },
  ];
}

export function polygonPath(points: readonly Point[]): Path {
  if (points.length === 0) return [];
  const [first, ...rest] = points;
  return [
    { op: "M", x: first!.x, y: first!.y },
    ...rest.map((p): PathCommand => ({ op: "L", x: p.x, y: p.y })),
    { op: "Z" },
  ];
}

/**
 * Flatten a path into closed polygons (one per sub-path). Curves use a fixed
 * number of segments so the output is deterministic.
 */
export function flattenPath(path: Path, segments = 12): Point[][] {
  const polys: Point[][] = [];
  let cur: Point[] = [];
  let pen: Point = { x: 0, y: 0 };
  for (const c of path) {
    switch (c.op) {
      case "M":
        if (cur.length) polys.push(cur);
        cur = [{ x: c.x, y: c.y }];
        pen = { x: c.x, y: c.y };
        break;
      case "L":
        cur.push({ x: c.x, y: c.y });
        pen = { x: c.x, y: c.y };
        break;
      case "C": {
        const p0 = pen;
        for (let i = 1; i <= segments; i++) {
          const t = i / segments;
          const mt = 1 - t;
          cur.push({
            x:
              mt * mt * mt * p0.x +
              3 * mt * mt * t * c.x1 +
              3 * mt * t * t * c.x2 +
              t * t * t * c.x,
            y:
              mt * mt * mt * p0.y +
              3 * mt * mt * t * c.y1 +
              3 * mt * t * t * c.y2 +
              t * t * t * c.y,
          });
        }
        pen = { x: c.x, y: c.y };
        break;
      }
      case "A": {
        const start = { x: c.cx + c.r * Math.cos(c.a0), y: c.cy + c.r * Math.sin(c.a0) };
        cur.push(start);
        for (let i = 1; i <= segments; i++) {
          const a = c.a0 + ((c.a1 - c.a0) * i) / segments;
          cur.push({ x: c.cx + c.r * Math.cos(a), y: c.cy + c.r * Math.sin(a) });
        }
        pen = cur[cur.length - 1]!;
        break;
      }
      case "Z":
        if (cur.length) polys.push(cur);
        cur = [];
        break;
    }
  }
  if (cur.length) polys.push(cur);
  return polys;
}

/** Map every point of a path through a homography (curves are flattened first). */
export function projectPath(path: Path, m: Mat3, segments = 12): Path {
  return flattenPath(path, segments).flatMap((poly) =>
    polygonPath(poly.map((p) => applyMat3(m, p))),
  );
}

/** Signed area of a polygon (positive = clockwise in y-down screen space). */
export function polygonArea(points: readonly Point[]): number {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const q = points[(i + 1) % points.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}
