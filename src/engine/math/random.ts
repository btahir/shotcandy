/**
 * Deterministic randomness and hashing.
 *
 * The engine never calls Math.random(): every "random" value (grain, dithering,
 * k-means seeding) comes from a PRNG seeded from scene data, so the same scene
 * always produces the same pixels.
 */

/** Mulberry32: tiny, fast, good-quality 32-bit PRNG. Returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 32-bit FNV-1a hash of a string. */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * 128-bit non-cryptographic content hash of a byte array (four interleaved
 * murmur-style lanes). Used for content-addressed asset ids. Synchronous and
 * available everywhere (no SubtleCrypto / secure-context requirement).
 */
export function hashBytes(bytes: Uint8Array): string {
  let h1 = 0x9e3779b1 ^ bytes.length;
  let h2 = 0x85ebca77 ^ bytes.length;
  let h3 = 0xc2b2ae3d ^ bytes.length;
  let h4 = 0x27d4eb2f ^ bytes.length;
  const n = bytes.length;
  let i = 0;
  // Process 16 bytes per round.
  for (; i + 16 <= n; i += 16) {
    const k1 = bytes[i]! | (bytes[i + 1]! << 8) | (bytes[i + 2]! << 16) | (bytes[i + 3]! << 24);
    const k2 = bytes[i + 4]! | (bytes[i + 5]! << 8) | (bytes[i + 6]! << 16) | (bytes[i + 7]! << 24);
    const k3 =
      bytes[i + 8]! | (bytes[i + 9]! << 8) | (bytes[i + 10]! << 16) | (bytes[i + 11]! << 24);
    const k4 =
      bytes[i + 12]! | (bytes[i + 13]! << 8) | (bytes[i + 14]! << 16) | (bytes[i + 15]! << 24);
    h1 = Math.imul(rotl(h1 ^ Math.imul(k1, 0xcc9e2d51), 13), 5) + 0xe6546b64;
    h2 = Math.imul(rotl(h2 ^ Math.imul(k2, 0x1b873593), 15), 5) + 0x561ccd1b;
    h3 = Math.imul(rotl(h3 ^ Math.imul(k3, 0xcc9e2d51), 17), 5) + 0x0bcaa747;
    h4 = Math.imul(rotl(h4 ^ Math.imul(k4, 0x1b873593), 19), 5) + 0x96cd1c35;
  }
  for (; i < n; i++) {
    const b = bytes[i]!;
    h1 = Math.imul(h1 ^ b, 0x01000193);
    h2 = Math.imul(h2 ^ b, 0x5bd1e995);
    h3 = Math.imul(h3 ^ b, 0x27d4eb2d);
    h4 = Math.imul(h4 ^ b, 0x165667b1);
  }
  h1 = fmix(h1 ^ h2);
  h2 = fmix(h2 ^ h3);
  h3 = fmix(h3 ^ h4);
  h4 = fmix(h4 ^ h1);
  return [h1, h2, h3, h4].map((h) => (h >>> 0).toString(16).padStart(8, "0")).join("");
}

function rotl(x: number, r: number): number {
  return (x << r) | (x >>> (32 - r));
}

function fmix(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Stable JSON stringify (sorted keys) for cache keys and hashing of plain data. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}
