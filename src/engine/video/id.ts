/**
 * Content ids for screen recordings. Screenshots hash every byte; recordings
 * can be hundreds of megabytes, so they hash a sample instead.
 */
import { hashBytes } from "../math/random";

// Hash the first and last 4 MB, the middle 1 MB and the length: stable ids for
// recordings of any size without reading hundreds of megabytes.
const EDGE = 4 * 1024 * 1024;
const MID = 1024 * 1024;

function sampleRanges(n: number): [number, number][] {
  if (n <= 2 * EDGE + MID) return [[0, n]];
  const m = Math.floor(n / 2 - MID / 2);
  return [
    [0, EDGE],
    [m, m + MID],
    [n - EDGE, n],
  ];
}

function idFromParts(parts: Uint8Array[], n: number): string {
  const total = parts.reduce((a, p) => a + p.length, 0);
  const buf = new Uint8Array(total + 8);
  let o = 0;
  for (const p of parts) {
    buf.set(p, o);
    o += p.length;
  }
  new DataView(buf.buffer).setFloat64(total, n);
  return `vid_${hashBytes(buf)}`;
}

/** Content id of a recording's bytes (the same value videoAssetId gives its Blob). */
export function videoIdForBytes(bytes: Uint8Array): string {
  return idFromParts(
    sampleRanges(bytes.length).map(([a, b]) => bytes.subarray(a, b)),
    bytes.length,
  );
}

/** Content id of a recording, reading only the sampled ranges. */
export async function videoAssetId(blob: Blob): Promise<string> {
  const parts = await Promise.all(
    sampleRanges(blob.size).map(
      async ([a, b]) => new Uint8Array(await blob.slice(a, b).arrayBuffer()),
    ),
  );
  return idFromParts(parts, blob.size);
}
