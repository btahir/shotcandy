/**
 * Deterministic Gaussian blur on RGBA pixel buffers.
 *
 * Canvas `ctx.filter = "blur()"` is not available in every browser (and not in
 * workers everywhere), and its output differs between engines. This pure-JS
 * version (three successive box blurs, which converge on a Gaussian) gives
 * identical output everywhere and runs in O(pixels) regardless of radius.
 */

/** Box sizes whose successive application approximates a Gaussian of `sigma`. */
export function boxesForGauss(sigma: number, n = 3): number[] {
  const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(wIdeal);
  if (wl % 2 === 0) wl--;
  const wu = wl + 2;
  const mIdeal = (12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4);
  const m = Math.round(mIdeal);
  const sizes: number[] = [];
  for (let i = 0; i < n; i++) sizes.push(i < m ? wl : wu);
  return sizes;
}

/**
 * Blur an RGBA buffer in place. Alpha is premultiplied during the blur so
 * transparent pixels do not bleed dark fringes into their neighbours.
 */
export function gaussianBlurRGBA(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  sigma: number,
): void {
  if (sigma < 0.5 || width === 0 || height === 0) return;
  const n = width * height;
  // Planar premultiplied float channels.
  const ch = [new Float32Array(n), new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  const [R, G, B, A] = ch as [Float32Array, Float32Array, Float32Array, Float32Array];
  let opaque = true;
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const a = data[j + 3]! / 255;
    if (a < 1) opaque = false;
    R[i] = data[j]! * a;
    G[i] = data[j + 1]! * a;
    B[i] = data[j + 2]! * a;
    A[i] = a;
  }
  const tmp = new Float32Array(n);
  const boxes = boxesForGauss(sigma, 3);
  const planes = opaque ? [R, G, B] : [R, G, B, A];
  for (const plane of planes) {
    for (const size of boxes) {
      const r = (size - 1) / 2;
      boxBlurH(plane, tmp, width, height, r);
      boxBlurV(tmp, plane, width, height, r);
    }
  }
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const a = opaque ? 1 : A[i]!;
    if (a <= 1e-6) {
      data[j] = data[j + 1] = data[j + 2] = data[j + 3] = 0;
      continue;
    }
    data[j] = R[i]! / a;
    data[j + 1] = G[i]! / a;
    data[j + 2] = B[i]! / a;
    data[j + 3] = a * 255;
  }
}

/** Horizontal running-sum box blur with edge clamping. */
function boxBlurH(src: Float32Array, dst: Float32Array, w: number, h: number, r: number): void {
  const iarr = 1 / (r + r + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    const first = src[row]!;
    const last = src[row + w - 1]!;
    let acc = (r + 1) * first;
    for (let j = 0; j < r; j++) acc += src[row + Math.min(j, w - 1)]!;
    for (let x = 0; x < w; x++) {
      const addIdx = x + r;
      const subIdx = x - r - 1;
      acc += (addIdx < w ? src[row + addIdx]! : last) - (subIdx >= 0 ? src[row + subIdx]! : first);
      dst[row + x] = acc * iarr;
    }
  }
}

/** Vertical running-sum box blur with edge clamping. */
function boxBlurV(src: Float32Array, dst: Float32Array, w: number, h: number, r: number): void {
  const iarr = 1 / (r + r + 1);
  for (let x = 0; x < w; x++) {
    const first = src[x]!;
    const last = src[x + (h - 1) * w]!;
    let acc = (r + 1) * first;
    for (let j = 0; j < r; j++) acc += src[x + Math.min(j, h - 1) * w]!;
    for (let y = 0; y < h; y++) {
      const addIdx = y + r;
      const subIdx = y - r - 1;
      acc +=
        (addIdx < h ? src[x + addIdx * w]! : last) - (subIdx >= 0 ? src[x + subIdx * w]! : first);
      dst[x + y * w] = acc * iarr;
    }
  }
}

/** Replace each `block`-sized cell with its average colour (pixelation). */
export function pixelateRGBA(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  block: number,
): void {
  const b = Math.max(1, Math.round(block));
  if (b <= 1) return;
  for (let by = 0; by < height; by += b) {
    for (let bx = 0; bx < width; bx += b) {
      const x1 = Math.min(bx + b, width);
      const y1 = Math.min(by + b, height);
      let r = 0;
      let g = 0;
      let bl = 0;
      let a = 0;
      let count = 0;
      for (let y = by; y < y1; y++) {
        for (let x = bx; x < x1; x++) {
          const i = (y * width + x) * 4;
          const al = data[i + 3]!;
          r += data[i]! * al;
          g += data[i + 1]! * al;
          bl += data[i + 2]! * al;
          a += al;
          count++;
        }
      }
      const outA = a / count;
      const inv = a > 0 ? 1 / a : 0;
      const outR = r * inv;
      const outG = g * inv;
      const outB = bl * inv;
      for (let y = by; y < y1; y++) {
        for (let x = bx; x < x1; x++) {
          const i = (y * width + x) * 4;
          data[i] = outR;
          data[i + 1] = outG;
          data[i + 2] = outB;
          data[i + 3] = outA;
        }
      }
    }
  }
}
