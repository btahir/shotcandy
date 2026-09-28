/**
 * Runtime asset library for the editor: holds each imported image's original
 * file, editing proxy and palette, and exposes them to the renderer (as an
 * AssetResolver) and to exports (as original blobs).
 */
import type { ExportAsset } from "../export/export";
import type { ImportedImage } from "../input/import";
import type { AssetResolver, AssetSource } from "./types";

type Listener = () => void;

export class AssetLibrary implements AssetResolver {
  private readonly items = new Map<string, ImportedImage>();
  private readonly listeners = new Set<Listener>();

  add(image: ImportedImage): string {
    if (!this.items.has(image.id)) {
      this.items.set(image.id, image);
      this.emit();
    }
    return image.id;
  }

  has(id: string): boolean {
    return this.items.has(id);
  }

  entry(id: string): ImportedImage | undefined {
    return this.items.get(id);
  }

  get(id: string): AssetSource | undefined {
    const it = this.items.get(id);
    if (!it) return undefined;
    const images = [{ image: it.proxy, width: it.proxyWidth, height: it.proxyHeight }];
    if (it.original && it.original !== it.proxy)
      images.push({ image: it.original, width: it.width, height: it.height });
    return {
      id,
      width: it.width,
      height: it.height,
      images,
      palette: it.palette,
      ...(it.video ? { video: { blob: it.blob } } : {}),
    };
  }

  /** Assets needed to export (original files), for the given ids. */
  exportAssets(ids: string[]): ExportAsset[] {
    return ids
      .map((id) => this.items.get(id))
      .filter((it): it is ImportedImage => !!it)
      .map((it) => ({
        id: it.id,
        width: it.width,
        height: it.height,
        blob: it.blob,
        palette: it.palette,
        ...(it.video ? { poster: it.video.poster } : {}),
      }));
  }

  remove(id: string): void {
    const it = this.items.get(id);
    if (!it) return;
    (it.proxy as { close?: () => void }).close?.();
    this.items.delete(id);
    this.emit();
  }

  ids(): string[] {
    return [...this.items.keys()];
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }
}
