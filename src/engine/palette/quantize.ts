/**
 * Perceptual colour quantization.
 *
 * 1. Histogram: pixels are bucketed at 5 bits per channel (32k bins), keeping
 *    the mean colour of each bin. This is exact, fast and order-independent.
 * 2. The occupied bins are clustered with weighted k-means in OKLab, where
 *    Euclidean distance tracks perceived difference.
 * 3. Seeding is deterministic "weighted farthest point" (a k-means++ variant
 *    without randomness), so the same image always yields the same palette.
 * 4. Clusters closer than a just-noticeable difference are merged.
 */
import { type OKLab, deltaE, oklabToRgb, rgbToOklab, toHex } from "../math/color";

export interface Cluster {
  lab: OKLab;
  /** Share of the counted pixels, 0..1 */
  weight: number;
  hex: string;
}

export interface QuantizeOptions {
  /** Max colours before merging (default 10). */
  k?: number;
  /** Ignore pixels with alpha below this (0..255, default 128). */
  alphaThreshold?: number;
  maxIterations?: number;
  /** Merge clusters closer than this OKLab distance (default 0.035). */
  mergeDistance?: number;
}

interface Bin {
  lab: OKLab;
  w: number;
}

export function histogramBins(data: Uint8ClampedArray, alphaThreshold = 128): Bin[] {
  const count = new Uint32Array(32768);
  const sr = new Float64Array(32768);
  const sg = new Float64Array(32768);
  const sb = new Float64Array(32768);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3]! < alphaThreshold) continue;
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const idx = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    count[idx]!++;
    sr[idx] = sr[idx]! + r;
    sg[idx] = sg[idx]! + g;
    sb[idx] = sb[idx]! + b;
  }
  const bins: Bin[] = [];
  for (let i = 0; i < 32768; i++) {
    const n = count[i]!;
    if (!n) continue;
    bins.push({ lab: rgbToOklab(sr[i]! / n, sg[i]! / n, sb[i]! / n), w: n });
  }
  return bins;
}

function dist2(a: OKLab, b: OKLab): number {
  const dL = a.L - b.L;
  const da = a.a - b.a;
  const db = a.b - b.b;
  return dL * dL + da * da + db * db;
}

export function quantize(data: Uint8ClampedArray, opts: QuantizeOptions = {}): Cluster[] {
  const k = opts.k ?? 10;
  const bins = histogramBins(data, opts.alphaThreshold ?? 128);
  if (bins.length === 0) return [];
  const total = bins.reduce((s, b) => s + b.w, 0);

  // Deterministic seeding: heaviest bin first, then maximise weight * distance².
  const centroids: OKLab[] = [];
  let heaviest = bins[0]!;
  for (const b of bins) if (b.w > heaviest.w) heaviest = b;
  centroids.push({ ...heaviest.lab });
  const minD = bins.map((b) => dist2(b.lab, heaviest.lab));
  while (centroids.length < Math.min(k, bins.length)) {
    let best = -1;
    let bestScore = 0;
    for (let i = 0; i < bins.length; i++) {
      // sqrt(weight) keeps small-but-distinct accents in play without letting
      // one huge flat background dominate every choice.
      const score = Math.sqrt(bins[i]!.w) * minD[i]!;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    if (best < 0 || bestScore < 1e-9) break;
    const c = bins[best]!.lab;
    centroids.push({ ...c });
    for (let i = 0; i < bins.length; i++) minD[i] = Math.min(minD[i]!, dist2(bins[i]!.lab, c));
  }

  // Weighted Lloyd iterations.
  const assign = new Int32Array(bins.length);
  const maxIt = opts.maxIterations ?? 24;
  for (let it = 0; it < maxIt; it++) {
    let changed = 0;
    for (let i = 0; i < bins.length; i++) {
      let bestJ = 0;
      let bestD = Infinity;
      for (let j = 0; j < centroids.length; j++) {
        const d = dist2(bins[i]!.lab, centroids[j]!);
        if (d < bestD) {
          bestD = d;
          bestJ = j;
        }
      }
      if (assign[i] !== bestJ || it === 0) {
        if (assign[i] !== bestJ) changed++;
        assign[i] = bestJ;
      }
    }
    const acc = centroids.map(() => ({ L: 0, a: 0, b: 0, w: 0 }));
    for (let i = 0; i < bins.length; i++) {
      const a = acc[assign[i]!]!;
      const b = bins[i]!;
      a.L += b.lab.L * b.w;
      a.a += b.lab.a * b.w;
      a.b += b.lab.b * b.w;
      a.w += b.w;
    }
    for (let j = 0; j < centroids.length; j++) {
      const a = acc[j]!;
      if (a.w > 0) centroids[j] = { L: a.L / a.w, a: a.a / a.w, b: a.b / a.w };
    }
    if (it > 0 && changed === 0) break;
  }

  const weights = new Float64Array(centroids.length);
  for (let i = 0; i < bins.length; i++) weights[assign[i]!]! += bins[i]!.w;

  let clusters = centroids
    .map((lab, j) => ({ lab, weight: weights[j]! / total }))
    .filter((c) => c.weight > 0);

  // Merge near-duplicates (weighted average), heaviest first.
  const mergeD = opts.mergeDistance ?? 0.035;
  clusters.sort((a, b) => b.weight - a.weight);
  const merged: { lab: OKLab; weight: number }[] = [];
  for (const c of clusters) {
    const target = merged.find((m) => deltaE(m.lab, c.lab) < mergeD);
    if (target) {
      const w = target.weight + c.weight;
      target.lab = {
        L: (target.lab.L * target.weight + c.lab.L * c.weight) / w,
        a: (target.lab.a * target.weight + c.lab.a * c.weight) / w,
        b: (target.lab.b * target.weight + c.lab.b * c.weight) / w,
      };
      target.weight = w;
    } else {
      merged.push({ lab: { ...c.lab }, weight: c.weight });
    }
  }
  clusters = merged.sort((a, b) => b.weight - a.weight || a.lab.L - b.lab.L);
  return clusters.map((c) => ({ ...c, hex: toHex(oklabToRgb(c.lab)) }));
}
