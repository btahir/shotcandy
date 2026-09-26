/**
 * Resolution needed to render a card flat before a perspective warp: the
 * largest local scale (max singular value of the Jacobian) of the card->device
 * map over the card, so the most magnified region is still sampled ~1:1.
 */
import { type Mat3, applyMat3 } from "../math/matrix";

/** Largest side of the offscreen flat card, in pixels. */
export const MAX_FLAT_SIDE = 8192;

function maxSingularValue(m: Mat3, x: number, y: number): number {
  const h = 1e-3;
  const p = applyMat3(m, { x, y });
  const px = applyMat3(m, { x: x + h, y });
  const py = applyMat3(m, { x, y: y + h });
  const a = (px.x - p.x) / h;
  const c = (px.y - p.y) / h;
  const b = (py.x - p.x) / h;
  const d = (py.y - p.y) / h;
  // Singular values of [[a, b], [c, d]].
  const s1 = a * a + b * b + c * c + d * d;
  const det = a * d - b * c;
  const disc = Math.sqrt(Math.max(0, s1 * s1 - 4 * det * det));
  return Math.sqrt((s1 + disc) / 2);
}

export function perspectiveMagnification(m: Mat3, w: number, h: number): number {
  let best = 0;
  for (let j = 0; j <= 4; j++) {
    for (let i = 0; i <= 4; i++) {
      best = Math.max(best, maxSingularValue(m, (w * i) / 4, (h * j) / 4));
    }
  }
  const cap = MAX_FLAT_SIDE / Math.max(w, h, 1);
  return Math.max(1e-3, Math.min(best, cap));
}
