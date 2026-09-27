"use client";
/**
 * App Store set controller: the slides (headline, subhead, screenshot), text
 * settings and set options live here; the shared style (background, frame,
 * shadow) is the editor store's scene while App Store mode is active, so the
 * usual trays and undo apply to it. Everything is saved to IndexedDB.
 */
import {
  type AppStoreSet,
  type AppStoreSlide,
  type Scene,
  SET_MAX_SLIDES,
  SET_MIN_SLIDES,
  applyStylePatch,
  createSet,
  getSetStyle,
  importImage,
  newSlideId,
  normalizeScene,
  normalizeSet,
  sanitizeFilename,
  sceneAssetIds,
  setCanvasSize,
  slideScene,
} from "@/engine";
import { createStore, type Store } from "@/lib/store";
import type { EditorApp } from "./app";

export interface SetState {
  set: AppStoreSet;
  selected: number;
  /** Packing progress while exporting the ZIP. */
  packing: { done: number; total: number } | null;
  loaded: boolean;
}

const KEY = "appstore-set";

export class SetController {
  readonly state: Store<SetState>;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly app: EditorApp) {
    this.state = createStore<SetState>({
      set: createSet(),
      selected: 0,
      packing: null,
      loaded: false,
    });
  }

  get set(): AppStoreSet {
    return this.state.get().set;
  }

  get selected(): number {
    return this.state.get().selected;
  }

  /** Restore the saved set (once), returning its template scene if there was one. */
  async restore(): Promise<Scene | null> {
    if (this.state.get().loaded) return null;
    this.state.set({ loaded: true });
    const db = this.app.db;
    if (!db) return null;
    try {
      const saved = await db.settings.get<{ set: unknown; template: unknown }>(KEY);
      if (!saved) return null;
      const set = normalizeSet(saved.set);
      for (const id of set.slides.map((s) => s.assetId)) if (id) await this.app.loadStoredAsset(id);
      this.state.set({ set, selected: 0 });
      return saved.template ? normalizeScene(saved.template).scene : null;
    } catch {
      return null;
    }
  }

  private commit(set: AppStoreSet, selected = this.selected): void {
    const sel = Math.max(0, Math.min(set.slides.length - 1, selected));
    this.state.set({ set, selected: sel });
    this.syncTemplateContent();
    this.scheduleSave();
  }

  scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      const db = this.app.db;
      if (!db || this.app.ui.get().mode !== "appstore") return;
      void db.settings.set(KEY, { set: this.set, template: this.app.scene }).catch(() => undefined);
    }, 500);
  }

  /** The style scene's content follows the selected slide (for auto backgrounds). */
  syncTemplateContent(): void {
    if (this.app.ui.get().mode !== "appstore") return;
    const slide = this.set.slides[this.selected];
    const assetId = slide?.assetId ?? null;
    const c = this.app.scene.content;
    if (c.kind === "image" && c.assetId === assetId) return;
    this.app.store.update((s) => ({ ...s, content: { kind: "image", assetId } }), {
      transient: true,
    });
  }

  select(i: number): void {
    this.state.set({ selected: Math.max(0, Math.min(this.set.slides.length - 1, i)) });
    this.syncTemplateContent();
  }

  update(patch: Partial<AppStoreSet>): void {
    this.commit({ ...this.set, ...patch });
  }

  updateText(patch: Partial<AppStoreSet["text"]>): void {
    this.commit({ ...this.set, text: { ...this.set.text, ...patch } });
  }

  updateSlide(i: number, patch: Partial<AppStoreSlide>): void {
    const slides = this.set.slides.map((s, j) => (j === i ? { ...s, ...patch } : s));
    this.commit({ ...this.set, slides }, i);
  }

  addSlide(): void {
    if (this.set.slides.length >= SET_MAX_SLIDES) return;
    const slides = [
      ...this.set.slides,
      {
        id: newSlideId("a"),
        headline: "Another reason to love it",
        subhead: "Say it in a few words",
        assetId: null,
      },
    ];
    this.commit({ ...this.set, slides }, slides.length - 1);
    this.app.announce(`Slide ${slides.length} added`);
  }

  duplicateSlide(i: number): void {
    if (this.set.slides.length >= SET_MAX_SLIDES) return;
    const slides = this.set.slides.slice();
    slides.splice(i + 1, 0, { ...slides[i]!, id: newSlideId("d") });
    this.commit({ ...this.set, slides }, i + 1);
  }

  removeSlide(i: number): void {
    if (this.set.slides.length <= SET_MIN_SLIDES) return;
    const before = this.set;
    const slides = this.set.slides.filter((_, j) => j !== i);
    this.commit({ ...this.set, slides }, Math.min(i, slides.length - 1));
    this.app.toast({
      kind: "undo",
      title: `Slide ${i + 1} removed`,
      action: { label: "Undo", run: () => this.commit(before, i) },
    });
  }

  moveSlide(i: number, dir: -1 | 1): void {
    const j = i + dir;
    if (j < 0 || j >= this.set.slides.length) return;
    const slides = this.set.slides.slice();
    [slides[i], slides[j]] = [slides[j]!, slides[i]!];
    this.commit({ ...this.set, slides }, j);
    this.app.announce(`Slide moved to position ${j + 1}`);
  }

  async setSlideImage(i: number, blob: Blob): Promise<void> {
    try {
      const img = await importImage(blob);
      this.app.adoptImportedAsset(img);
      this.updateSlide(i, { assetId: img.id });
      this.app.announce(`Screenshot added to slide ${i + 1}`);
    } catch (e) {
      this.app.importFailed(e);
    }
  }

  /** Several files at once fill slides from `start` onwards. */
  async setSlideImages(start: number, blobs: Blob[]): Promise<void> {
    for (let k = 0; k < blobs.length; k++) {
      let i = start + k;
      if (i >= this.set.slides.length) {
        if (this.set.slides.length >= SET_MAX_SLIDES) break;
        this.addSlide();
        i = this.set.slides.length - 1;
      }
      await this.setSlideImage(i, blobs[k]!);
    }
  }

  applyStyle(id: string): void {
    const st = getSetStyle(id);
    if (!st) return;
    this.app.store.update((s) => applyStylePatch(s, st.patch, id));
    this.commit({ ...this.set, text: { ...this.set.text, ...st.text }, styleId: id });
    this.app.announce(`Set style: ${st.name}`);
  }

  /** The scene for one slide, from the current style. */
  slideScene(i: number, template: Scene = this.app.scene): Scene {
    return slideScene(this.set, template, i, this.app.resolver);
  }

  /** Download all slides as opaque PNGs (or JPEGs) in a ZIP. */
  async exportZip(format: "png" | "jpeg" = "png"): Promise<void> {
    if (this.state.get().packing) return;
    const set = this.set;
    const total = set.slides.length;
    this.state.set({ packing: { done: 0, total } });
    try {
      const pack = await import("@/engine/appstore/pack");
      const size = setCanvasSize(set);
      const folder = sanitizeFilename(
        `shotcandy-${set.sizePresetId}${set.landscape ? "-landscape" : ""}`,
      );
      const files: { name: string; data: Uint8Array }[] = [];
      for (let i = 0; i < total; i++) {
        const scene = this.slideScene(i);
        const r = await this.app.exporter.export(
          scene,
          this.app.library.exportAssets(sceneAssetIds(scene)),
          {
            format: format === "jpeg" ? "jpeg" : "png",
            scale: 1,
            quality: 0.95,
          },
        );
        let data: Uint8Array;
        if (format === "png") {
          // Re-encode without an alpha channel (App Store requirement).
          const bmp = await createImageBitmap(r.blob);
          const c = new OffscreenCanvas(bmp.width, bmp.height);
          const g = c.getContext("2d", { willReadFrequently: true })!;
          g.drawImage(bmp, 0, 0);
          bmp.close();
          data = pack.encodePngRgb(g.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
        } else {
          data = new Uint8Array(await r.blob.arrayBuffer());
        }
        const slug = sanitizeFilename(
          set.slides[i]!.headline.toLowerCase().replace(/\s+/g, "-"),
        ).slice(0, 40);
        files.push({
          name: `${folder}/${String(i + 1).padStart(2, "0")}${slug ? `-${slug}` : ""}.${format === "jpeg" ? "jpg" : "png"}`,
          data,
        });
        this.state.set({ packing: { done: i + 1, total } });
        await new Promise((res) => setTimeout(res, 0));
      }
      const zip = pack.zipFiles(files);
      const blob = new Blob([zip as Uint8Array<ArrayBuffer>], { type: "application/zip" });
      this.app.downloadFile(blob, `${folder}.zip`);
      this.app.toast({
        kind: "info",
        title: `Saved ${folder}.zip`,
        detail: `${total} slides · ${size.width} × ${size.height} ${format.toUpperCase()}${format === "png" ? " (no alpha)" : ""}`,
        duration: 4200,
      });
      this.app.announce(`Saved ${total} slides as a ZIP`);
    } catch (e) {
      this.app.toast({
        kind: "error",
        title: "Couldn't export the set",
        detail: e instanceof Error ? e.message : String(e),
        prose: true,
      });
    } finally {
      this.state.set({ packing: null });
    }
  }
}
