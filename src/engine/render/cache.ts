/**
 * Memoization for expensive, deterministic intermediate results (scaled
 * sources, processed content, mesh gradients, grain tiles, blurred background
 * images, palettes). Pure memoization: a cache hit returns exactly what a miss
 * would compute, so caching never changes output pixels.
 *
 * LRU with an approximate byte budget; canvases are counted as w * h * 4.
 */

interface Entry {
  value: unknown;
  bytes: number;
}

export class RenderCache {
  private readonly map = new Map<string, Entry>();
  private bytes = 0;
  hits = 0;
  misses = 0;

  constructor(private readonly budgetBytes = 256 * 1024 * 1024) {}

  get<T>(key: string, compute: () => { value: T; bytes: number }): T {
    const hit = this.map.get(key);
    if (hit) {
      this.hits++;
      // Refresh recency.
      this.map.delete(key);
      this.map.set(key, hit);
      return hit.value as T;
    }
    this.misses++;
    const { value, bytes } = compute();
    this.map.set(key, { value, bytes });
    this.bytes += bytes;
    return value;
  }

  /**
   * Evict least-recently-used entries over budget. Called by the renderer after
   * a frame completes, never mid-frame, so values obtained during a render stay
   * valid until it finishes.
   */
  trim(): void {
    while (this.bytes > this.budgetBytes && this.map.size > 1) {
      const oldest = this.map.keys().next().value as string;
      const e = this.map.get(oldest)!;
      this.map.delete(oldest);
      this.bytes -= e.bytes;
      releaseValue(e.value);
    }
  }

  /** Drop entries whose key contains `fragment` (e.g. an asset id). */
  invalidate(fragment: string): void {
    for (const [k, e] of this.map) {
      if (k.includes(fragment)) {
        this.map.delete(k);
        this.bytes -= e.bytes;
        releaseValue(e.value);
      }
    }
  }

  clear(): void {
    for (const e of this.map.values()) releaseValue(e.value);
    this.map.clear();
    this.bytes = 0;
  }

  get size(): number {
    return this.map.size;
  }

  get byteSize(): number {
    return this.bytes;
  }
}

/** Shrink evicted canvases so browsers can reclaim their backing store promptly. */
function releaseValue(v: unknown): void {
  if (v && typeof v === "object" && "width" in v && "height" in v && "getContext" in v) {
    try {
      (v as { width: number; height: number }).width = 0;
      (v as { width: number; height: number }).height = 0;
    } catch {
      /* ignore */
    }
  }
}
