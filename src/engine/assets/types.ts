/**
 * Assets are content-addressed images referenced from scenes by id. The
 * renderer never loads anything itself: callers hand it an AssetResolver with
 * already-decoded images, which keeps rendering synchronous and deterministic.
 *
 * An asset may be available at several resolutions (an editing proxy plus the
 * original). The renderer picks the smallest image that is at least as large as
 * what it needs, so previews stay fast while exports use full resolution.
 */
import type { Palette } from "../palette/extract";
import type { ImageLike } from "../render/env";

export interface AssetImage {
  image: ImageLike;
  width: number;
  height: number;
}

export interface AssetSource {
  id: string;
  /** Natural (original) pixel size. */
  width: number;
  height: number;
  /** Decoded images of the same aspect ratio, any resolutions. */
  images: AssetImage[];
  /**
   * Palette computed from the original pixels at import time. Supplying it
   * guarantees auto backgrounds match between preview (proxy) and export
   * (original); without it the renderer derives one from the largest image.
   */
  palette?: Palette;
  /**
   * Screen recordings: the original file. `images` then hold a poster frame
   * (the first frame), used for layout, thumbnails and analysis.
   */
  video?: { blob: Blob };
  /**
   * Set on a single frame of a recording (see withVideoFrame): the recording's
   * own source, so analysis that must not flicker from frame to frame (frame
   * theme, palette) reads the poster instead of the frame.
   */
  still?: AssetSource;
}

export interface AssetResolver {
  get(id: string): AssetSource | undefined;
}

/** Smallest available image covering `neededWidth`, else the largest one. */
export function pickImage(source: AssetSource, neededWidth: number): AssetImage | undefined {
  const sorted = [...source.images].sort((a, b) => a.width - b.width);
  return sorted.find((i) => i.width >= neededWidth - 0.5) ?? sorted[sorted.length - 1];
}

/** Simple Map-backed resolver. */
export class MapAssetResolver implements AssetResolver {
  private readonly map = new Map<string, AssetSource>();

  constructor(sources: Iterable<AssetSource> = []) {
    for (const s of sources) this.map.set(s.id, s);
  }

  set(source: AssetSource): void {
    this.map.set(source.id, source);
  }

  get(id: string): AssetSource | undefined {
    return this.map.get(id);
  }

  delete(id: string): void {
    this.map.delete(id);
  }

  ids(): string[] {
    return [...this.map.keys()];
  }
}

export const EMPTY_ASSETS: AssetResolver = { get: () => undefined };

/**
 * A resolver that shows `frame` in place of asset `assetId`: one frame of a
 * screen recording. The frame gets its own id (`key`), so everything the
 * renderer caches per asset is cached per frame, while `still` keeps
 * per-recording analysis stable.
 */
export function withVideoFrame(
  base: AssetResolver,
  assetId: string,
  frame: AssetImage,
  key: string | number,
): AssetResolver {
  let cached: AssetSource | undefined;
  return {
    get(id: string) {
      if (id !== assetId) return base.get(id);
      if (cached) return cached;
      const src = base.get(id);
      if (!src) return undefined;
      cached = { ...src, id: `${src.id}@${key}`, images: [frame], still: src };
      return cached;
    },
  };
}
