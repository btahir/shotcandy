"use client";
/**
 * EditorApp: the editor's controller. Owns the scene store (undo/redo), the
 * asset library, render cache, exporter, thumbnail service, persistence and
 * the UI store, and exposes every user action as a method so components,
 * keyboard shortcuts and tests all drive the same code paths.
 */
import {
  type Annotation,
  type AnnotationKind,
  type AssetResolver,
  type AssetSource,
  type CanvasSize,
  type DesignRecord,
  type ExportFormat,
  type ExportResult,
  type ImportedImage,
  type PresetRecord,
  type Scene,
  type ShotcandyStore,
  type StylePatch,
  AssetLibrary,
  DEFAULT_FILENAME_PATTERN,
  DEFAULT_STYLE_ID,
  Exporter,
  ImportError,
  RenderCache,
  SCENE_VERSION,
  STYLE_PRESETS,
  addAnnotation,
  applyStylePatch,
  canvasToContent,
  contentToCanvas,
  copyImageToClipboard,
  createAnnotation,
  createProjectFile,
  createScene,
  extractStylePatch,
  fetchBuiltinAsset,
  formatFilename,
  getSizePreset,
  getStylePreset,
  importImage,
  isBuiltinAssetId,
  layoutScene,
  openStore,
  parseProject,
  projectToBlob,
  readClipboardImage,
  removeAnnotation,
  sceneAssetIds,
  setIn,
  updateAnnotation,
} from "@/engine";
import { createExportWorker } from "@/engine/export/worker-factory";
import { createEditorStore, type EditorStore } from "@/state/editor-store";
import { APP_VERSION } from "@/config/site";
import { loadCanvasFonts, registerBrandFonts } from "@/lib/fonts";
import { GHOST_H, GHOST_ID, GHOST_W, loadGhost } from "@/lib/ghost";
import { createStore, type Store } from "@/lib/store";
import { ThumbService } from "@/lib/thumbs/service";
import { sprinkle } from "@/lib/sprinkles";

registerBrandFonts();

export type Tool = "select" | "text" | "arrow" | "rect" | "redact";
export type Popover = null | "size" | "export" | "more";
export type Modal = null | "gallery" | "shortcuts" | "recents";
export type MobileTab = "styles" | "background" | "layout" | "frame" | "draw";

export interface ExportSettings {
  format: ExportFormat;
  scale: number;
  quality: number;
  pattern: string;
}

export interface Toast {
  id: number;
  kind: "wrap" | "info" | "error" | "undo";
  title: string;
  detail?: string;
  prose?: boolean;
  thumb?: string;
  action?: { label: string; run: () => void };
  duration?: number;
}

export interface UiState {
  hasImage: boolean;
  tool: Tool;
  popover: Popover;
  modal: Modal;
  drag: null | "ok" | "bad";
  landing: number;
  xfade: number;
  importing: boolean;
  zoom: number | null;
  fitZoom: number;
  pan: { x: number; y: number };
  toasts: Toast[];
  copyState: "idle" | "busy" | "done";
  exportBusy: boolean;
  exportSettings: ExportSettings;
  editingText: string | null;
  customPresets: PresetRecord[];
  recents: DesignRecord[];
  persistent: boolean;
  dbReady: boolean;
  announce: string;
  mobileTab: MobileTab;
  mobileExpanded: boolean;
  mobileExport: boolean;
  annColor: string;
  fontsReady: number;
  assetsVersion: number;
  stageFocus: number;
}

const SETTINGS_KEY = "shotcandy:export";
const MAX_RECENTS = 12;
export const ANN_COLOURS = [
  "#FF4F7B",
  "#FF9A3C",
  "#FFD84D",
  "#5FD4A8",
  "#4F8BFF",
  "#8B6CFF",
  "#2A1F1A",
  "#FFFFFF",
];

function loadSettings(): ExportSettings {
  const d: ExportSettings = {
    format: "png",
    scale: 2,
    quality: 0.92,
    pattern: DEFAULT_FILENAME_PATTERN,
  };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return d;
    const p = JSON.parse(raw) as Partial<ExportSettings>;
    return {
      format: p.format === "jpeg" || p.format === "webp" ? p.format : "png",
      scale: [1, 2, 3, 4].includes(Number(p.scale)) ? Number(p.scale) : 2,
      quality: typeof p.quality === "number" ? Math.min(1, Math.max(0.3, p.quality)) : 0.92,
      pattern: typeof p.pattern === "string" && p.pattern.trim() ? p.pattern : d.pattern,
    };
  } catch {
    return d;
  }
}

export function initialScene(): Scene {
  return applyStylePatch(createScene(), getStylePreset(DEFAULT_STYLE_ID)!.patch, DEFAULT_STYLE_ID);
}

export function styleName(id: string | undefined, custom: PresetRecord[] = []): string {
  if (!id) return "Custom";
  return getStylePreset(id)?.name ?? custom.find((p) => p.id === id)?.name ?? "Custom";
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function importMessage(e: unknown): { title: string; detail: string } {
  if (e instanceof ImportError) {
    switch (e.code) {
      case "heic":
        return { title: "HEIC photos aren't supported yet", detail: e.message };
      case "too-large":
        return { title: "That image is too big to edit", detail: e.message };
      case "empty":
        return { title: "That file is empty", detail: "Try exporting the screenshot again." };
      case "decode-failed":
        return {
          title: "Couldn't read that image",
          detail: "It may be corrupt. Try PNG, JPEG or WebP.",
        };
      default:
        return {
          title: "Couldn't read that file",
          detail: "Try PNG, JPEG or WebP.",
        };
    }
  }
  return { title: "Couldn't read that file", detail: "Try PNG, JPEG or WebP." };
}

let annSeq = 0;
const newId = (p: string) => `${p}_${Date.now().toString(36)}${(annSeq++).toString(36)}`;

export class EditorApp {
  readonly store: EditorStore;
  readonly library = new AssetLibrary();
  readonly cache = new RenderCache();
  readonly exporter = new Exporter({ createWorker: createExportWorker });
  readonly ui: Store<UiState>;
  thumbs: ThumbService | null = null;
  db: ShotcandyStore | null = null;
  ghost: AssetSource | null = null;
  /** Resolver for previews/thumbnails: the library plus the ghost screenshot. */
  readonly resolver: AssetResolver;
  private designId: string | null = null;
  private designCreated = 0;
  private autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  private toastSeq = 0;
  private userPickedStyle = false;
  private disposed = false;
  private listeners = new Map<string, Set<(arg?: unknown) => void>>();
  private builtinLoads = new Map<string, Promise<void>>();
  private initDone = false;

  constructor() {
    this.store = createEditorStore(initialScene());
    this.ui = createStore<UiState>({
      hasImage: false,
      tool: "select",
      popover: null,
      modal: null,
      drag: null,
      landing: 0,
      xfade: 0,
      importing: false,
      zoom: null,
      fitZoom: 1,
      pan: { x: 0, y: 0 },
      toasts: [],
      copyState: "idle",
      exportBusy: false,
      exportSettings: {
        format: "png",
        scale: 2,
        quality: 0.92,
        pattern: DEFAULT_FILENAME_PATTERN,
      },
      editingText: null,
      customPresets: [],
      recents: [],
      persistent: true,
      dbReady: false,
      announce: "",
      mobileTab: "styles",
      mobileExpanded: false,
      mobileExport: false,
      annColor: ANN_COLOURS[0]!,
      fontsReady: 0,
      assetsVersion: 0,
      stageFocus: 0,
    });
    this.resolver = {
      get: (id: string) => (id === GHOST_ID ? (this.ghost ?? undefined) : this.library.get(id)),
    };
  }

  // ------------------------------------------------------------------ events
  on(evt: string, fn: (arg?: unknown) => void): () => void {
    let set = this.listeners.get(evt);
    if (!set) this.listeners.set(evt, (set = new Set()));
    set.add(fn);
    return () => set!.delete(fn);
  }
  emit(evt: string, arg?: unknown): void {
    for (const fn of this.listeners.get(evt) ?? []) fn(arg);
  }

  get scene(): Scene {
    return this.store.getState().scene;
  }

  // -------------------------------------------------------------------- init
  async init(): Promise<void> {
    if (this.initDone) return;
    this.initDone = true;
    this.ui.set({ exportSettings: loadSettings() });
    this.thumbs = new ThumbService(this.resolver);
    void loadCanvasFonts().then(() => {
      if (this.disposed) return;
      this.cache.clear();
      this.thumbs?.syncFonts();
      this.ui.set((s) => ({ fontsReady: s.fontsReady + 1 }));
    });
    void loadGhost().then((bmp) => {
      if (!bmp || this.disposed) return;
      this.ghost = {
        id: GHOST_ID,
        width: GHOST_W,
        height: GHOST_H,
        images: [{ image: bmp, width: bmp.width, height: bmp.height }],
      };
      void this.thumbs?.setAsset(GHOST_ID, bmp, GHOST_W, GHOST_H);
      this.bumpAssets();
    });
    this.store.subscribe(() => this.onSceneChange());
    const idle = (cb: () => void) =>
      (
        window as unknown as { requestIdleCallback?: (c: () => void, o?: object) => void }
      ).requestIdleCallback?.(cb, { timeout: 2000 }) ?? setTimeout(cb, 600);
    idle(() => this.exporter.prewarm());

    const params = new URLSearchParams(window.location.search);
    const style = params.get("style");
    if (style && getStylePreset(style)) {
      this.applyStyle(style, { history: false });
      this.store.reset(this.scene);
    }
    const size = params.get("size");
    const sp = size ? getSizePreset(size) : undefined;
    if (sp) {
      this.store.update((s) => setIn(s, ["canvas", "size"], sp.size));
      this.store.reset(this.scene);
    }

    try {
      this.db = await openStore();
    } catch {
      this.db = null;
    }
    if (this.disposed) return;
    this.ui.set({ persistent: this.db?.persistent ?? false, dbReady: true });
    void this.refreshPresets();
    void this.refreshRecents();

    const open = params.get("open");
    const sample = params.get("sample");
    if (open || sample || style || size) {
      const url = new URL(window.location.href);
      url.search = "";
      window.history.replaceState(null, "", url.toString());
    }
    if (open && this.db) {
      const rec = await this.db.assets.get(open).catch(() => undefined);
      if (rec) await this.loadBlob(rec.blob, { source: "handoff" });
    } else if (sample) {
      await this.loadSample(sample);
    }
  }

  dispose(): void {
    this.disposed = true;
    this.exporter.dispose();
    this.thumbs?.dispose();
    this.db?.close();
  }

  private bumpAssets() {
    this.ui.set((s) => ({ assetsVersion: s.assetsVersion + 1 }));
  }

  announce(msg: string): void {
    this.ui.set({ announce: "" });
    requestAnimationFrame(() => this.ui.set({ announce: msg }));
  }

  // ------------------------------------------------------------------ toasts
  toast(t: Omit<Toast, "id">): number {
    const id = ++this.toastSeq;
    const toast = { ...t, id };
    this.ui.set((s) => {
      // One toast at a time keeps the stage calm; revoke the old thumbnail.
      for (const old of s.toasts) if (old.thumb) URL.revokeObjectURL(old.thumb);
      return { toasts: [toast] };
    });
    if (t.kind === "error" || t.kind === "info") this.announce(`${t.title}. ${t.detail ?? ""}`);
    return id;
  }

  dismissToast(id: number): void {
    this.ui.set((s) => {
      const t = s.toasts.find((x) => x.id === id);
      if (t?.thumb) setTimeout(() => URL.revokeObjectURL(t.thumb!), 500);
      return { toasts: s.toasts.filter((x) => x.id !== id) };
    });
  }

  // ------------------------------------------------------------------- input
  async loadBlob(blob: Blob, opts: { source?: string } = {}): Promise<boolean> {
    if (blob.type && !/^image\//.test(blob.type) && blob.type !== "application/octet-stream") {
      this.toast({
        kind: "error",
        title: "Couldn't read that file",
        detail: "Shotcandy opens PNG, JPEG or WebP images.",
        prose: true,
      });
      return false;
    }
    this.ui.set({ importing: true });
    let img: ImportedImage;
    try {
      img = await importImage(blob);
    } catch (e) {
      this.ui.set({ importing: false });
      const m = importMessage(e);
      this.toast({ kind: "error", title: m.title, detail: m.detail, prose: true, duration: 6000 });
      return false;
    }
    if (this.disposed) return false;
    this.library.add(img);
    void this.thumbs?.setAsset(img.id, img.proxy, img.width, img.height, img.palette);
    const first = !this.ui.get().hasImage;
    const portrait = img.height / img.width >= 1.6;
    this.store.update((s) => {
      let next: Scene = { ...s, content: { kind: "image", assetId: img.id } };
      if (first && !this.userPickedStyle) {
        const id = portrait ? "phone-sorbet" : DEFAULT_STYLE_ID;
        const p = getStylePreset(id);
        if (p) next = applyStylePatch(next, p.patch, id);
      }
      return next;
    });
    // A new screenshot starts a new recent design.
    this.designId = newId("d");
    this.designCreated = Date.now();
    this.ui.set((s) => ({
      hasImage: true,
      importing: false,
      landing: first ? s.landing + 1 : s.landing,
      xfade: first ? s.xfade : s.xfade + 1,
      zoom: null,
      pan: { x: 0, y: 0 },
      stageFocus: s.stageFocus + 1,
    }));
    this.bumpAssets();
    if (this.db) {
      void this.db.assets
        .put({
          id: img.id,
          blob: img.blob,
          mime: img.mime,
          width: img.width,
          height: img.height,
          role: "content",
          createdAt: Date.now(),
        })
        .catch(() => undefined);
    }
    const mod = /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent) ? "⌘" : "Ctrl+";
    this.emit("loaded", opts.source ?? "unknown");
    this.announce(
      `Screenshot added (${img.width} × ${img.height}). Style: ${styleName(this.scene.meta.stylePresetId, this.ui.get().customPresets)}. Press ${mod}C to copy.`,
    );
    return true;
  }

  async loadSample(name: string): Promise<void> {
    const safe = name.replace(/[^a-z0-9-]/gi, "");
    try {
      const res = await fetch(`/samples/${safe}.webp`);
      if (!res.ok) throw new Error("missing");
      await this.loadBlob(await res.blob(), { source: "sample" });
    } catch {
      this.toast({ kind: "error", title: "Couldn't load that sample", detail: "Try another one." });
    }
  }

  /** "Paste from clipboard" button (async Clipboard API; needs permission). */
  async pasteFromClipboard(): Promise<void> {
    try {
      const blob = await readClipboardImage();
      if (!blob) {
        let text = "";
        try {
          text = (await navigator.clipboard.readText?.()) ?? "";
        } catch {
          /* ignore */
        }
        if (/^https?:\/\/\S+$/i.test(text.trim())) {
          this.toast({
            kind: "info",
            title: "We can't fetch URLs yet",
            detail: "Copy the image itself, then paste.",
            prose: true,
          });
        } else {
          this.toast({
            kind: "info",
            title: "No image on the clipboard",
            detail: "Copy a screenshot first, then try again.",
            prose: true,
          });
        }
        return;
      }
      await this.loadBlob(blob, { source: "clipboard" });
    } catch {
      this.toast({
        kind: "error",
        title: "Clipboard access was blocked",
        detail: "Press ⌘V / Ctrl+V instead, or allow clipboard access for this site.",
        prose: true,
        duration: 6000,
      });
    }
  }

  /** Paste event carrying text (no image). */
  pastedText(text: string): void {
    if (/^https?:\/\/\S+\.(png|jpe?g|webp|gif)(\?\S*)?$/i.test(text.trim())) {
      this.toast({
        kind: "info",
        title: "We can't fetch URLs yet",
        detail: "Paste the image itself.",
        prose: true,
      });
    }
  }

  // ----------------------------------------------------------------- builtin
  /** Load built-in wallpapers referenced by the scene (on demand). */
  ensureBuiltins(scene: Scene = this.scene): void {
    for (const id of sceneAssetIds(scene)) {
      if (!isBuiltinAssetId(id) || this.library.has(id) || this.builtinLoads.has(id)) continue;
      const job = fetchBuiltinAsset(id)
        .then((b) => importImage(b))
        .then((img) => {
          this.library.add({ ...img, id });
          this.bumpAssets();
        })
        .catch(() => {
          this.builtinLoads.delete(id);
        });
      this.builtinLoads.set(id, job);
    }
  }

  // ------------------------------------------------------------------ styles
  applyStyle(id: string, opts: { history?: boolean } = {}): void {
    const builtin = getStylePreset(id);
    const custom = this.ui.get().customPresets.find((p) => p.id === id);
    const patch: StylePatch | undefined = builtin?.patch ?? custom?.patch;
    if (!patch) return;
    this.userPickedStyle = true;
    this.store.update((s) => applyStylePatch(s, patch, id), {
      ...(opts.history === false ? { transient: true } : {}),
    });
    if (this.ui.get().hasImage) this.ui.set((s) => ({ xfade: s.xfade + 1 }));
  }

  /** Styles in gallery order, portrait shots float device styles up. */
  orderedStyles() {
    return STYLE_PRESETS;
  }

  stepStyle(dir: 1 | -1): void {
    const list = STYLE_PRESETS;
    const cur = list.findIndex((p) => p.id === this.scene.meta.stylePresetId);
    const next = list[(cur + dir + list.length) % list.length]!;
    this.applyStyle(next.id);
    this.announce(`Style: ${next.name}`);
  }

  surprise(): void {
    const cur = this.scene.meta.stylePresetId;
    const img = this.contentSize();
    const portrait = img ? img.height / img.width >= 1.6 : false;
    const pool = STYLE_PRESETS.filter(
      (p) =>
        p.id !== cur &&
        (portrait ? p.suits !== "landscape" : p.suits !== "portrait" && p.suits !== "tablet"),
    );
    const pick = pool[Math.floor(Math.random() * pool.length)]!;
    this.applyStyle(pick.id);
    this.announce(`Style: ${pick.name}`);
  }

  contentSize(): { width: number; height: number } | null {
    const c = this.scene.content;
    if (c.kind !== "image" || !c.assetId) return null;
    const a = this.library.get(c.assetId);
    return a ? { width: a.width, height: a.height } : null;
  }

  isTweaked(): boolean {
    const s = this.scene;
    const id = s.meta.stylePresetId;
    const patch = id
      ? (getStylePreset(id)?.patch ?? this.ui.get().customPresets.find((p) => p.id === id)?.patch)
      : undefined;
    if (!patch) return true;
    const applied = applyStylePatch(s, patch);
    return JSON.stringify(extractStylePatch(applied)) !== JSON.stringify(extractStylePatch(s));
  }

  // ------------------------------------------------------------------ update
  set(path: (string | number)[], value: unknown, coalesce?: string): void {
    this.store.update((s) => setIn(s, path, value), { coalesce: coalesce ?? path.join(".") });
  }

  setSize(size: CanvasSize): void {
    this.store.update((s) => setIn(s, ["canvas", "size"], size));
    this.ui.set({ zoom: null, pan: { x: 0, y: 0 } });
  }

  // ------------------------------------------------------------- annotations
  setTool(tool: Tool): void {
    this.ui.set({ tool, editingText: null });
    if (tool !== "select") this.store.select(null);
  }

  addAnnotation(
    kind: AnnotationKind,
    props: Partial<Annotation> = {},
    opts: { coalesce?: string } = {},
  ): string {
    const id = newId(kind[0]!);
    const color = this.ui.get().annColor;
    const base = createAnnotation(kind, id);
    let a: Annotation;
    switch (base.kind) {
      case "text":
        a = {
          ...base,
          font: "display",
          size: 34,
          weight: 800,
          color: color === "#FFFFFF" ? "#2A1F1A" : "#FFFFFF",
          background: color,
          text: "Your text",
        };
        break;
      case "arrow":
        a = { ...base, color, width: 6, curve: 0.25 };
        break;
      case "rect":
        a = { ...base, color, width: 6, radius: 16 };
        break;
      default:
        a = base;
    }
    a = { ...a, ...props } as Annotation;
    this.store.update((s) => addAnnotation(s, a), opts.coalesce ? { coalesce: opts.coalesce } : {});
    this.store.select(id);
    return id;
  }

  updateAnnotation(id: string, patch: Partial<Annotation>, coalesce?: string): void {
    this.store.update((s) => updateAnnotation(s, id, patch), {
      coalesce: coalesce ?? `ann:${id}:${Object.keys(patch).join(",")}`,
    });
  }

  deleteAnnotation(id: string): void {
    const a = this.scene.annotations.find((x) => x.id === id);
    if (!a) return;
    this.store.update((s) => removeAnnotation(s, id));
    this.ui.set({ editingText: null });
    this.toast({
      kind: "undo",
      title: "Annotation deleted",
      action: { label: "Undo", run: () => this.store.undo() },
    });
  }

  duplicateAnnotation(id: string): void {
    const a = this.scene.annotations.find((x) => x.id === id);
    if (!a) return;
    const nid = newId(a.kind[0]!);
    const d = 0.03;
    let copy: Annotation;
    if (a.kind === "arrow")
      copy = { ...a, id: nid, x1: a.x1 + d, y1: a.y1 + d, x2: a.x2 + d, y2: a.y2 + d };
    else copy = { ...a, id: nid, x: a.x + d, y: a.y + d } as Annotation;
    this.store.update((s) => addAnnotation(s, copy));
    this.store.select(nid);
  }

  /** Switch an annotation between content and canvas anchors without moving it. */
  reanchor(id: string, to: "content" | "canvas"): void {
    const a = this.scene.annotations.find((x) => x.id === id);
    if (!a || a.anchor === to || a.kind === "redact") return;
    const layout = layoutScene(this.scene, this.resolver);
    const W = layout.canvas.width;
    const H = layout.canvas.height;
    const conv = (u: number, v: number) => {
      if (to === "canvas") {
        const p = contentToCanvas(layout, u, v);
        return { x: p.x / W, y: p.y / H };
      }
      return canvasToContent(layout, u * W, v * H) ?? { x: u, y: v };
    };
    let patch: Partial<Annotation>;
    if (a.kind === "arrow") {
      const p1 = conv(a.x1, a.y1);
      const p2 = conv(a.x2, a.y2);
      patch = { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y } as Partial<Annotation>;
    } else if (a.kind === "rect") {
      const p1 = conv(a.x, a.y);
      const p2 = conv(a.x + a.w, a.y + a.h);
      patch = {
        x: Math.min(p1.x, p2.x),
        y: Math.min(p1.y, p2.y),
        w: Math.abs(p2.x - p1.x),
        h: Math.abs(p2.y - p1.y),
      } as Partial<Annotation>;
    } else {
      const p = conv(a.x, a.y);
      patch = { x: p.x, y: p.y } as Partial<Annotation>;
    }
    this.store.update((s) => updateAnnotation(s, id, { ...patch, anchor: to } as Partial<Annotation>));
  }

  moveAnnotation(id: string, to: number): void {
    this.store.update((s) => {
      const list = s.annotations.slice();
      const from = list.findIndex((a) => a.id === id);
      if (from < 0 || to < 0 || to >= list.length || from === to) return s;
      const [item] = list.splice(from, 1);
      list.splice(to, 0, item!);
      return { ...s, annotations: list };
    });
  }

  // ------------------------------------------------------------------ export
  exportAssets(scene: Scene = this.scene) {
    return this.library.exportAssets(sceneAssetIds(scene));
  }

  maxScale(): number {
    return 4;
  }

  filenameFor(r: { width: number; height: number }, settings: ExportSettings): string {
    const s = this.scene;
    const size = s.canvas.size;
    return formatFilename(settings.pattern, {
      name: s.meta.name,
      style: s.meta.stylePresetId ?? "custom",
      preset: size.kind === "auto" ? "auto" : (size.presetId ?? "custom"),
      width: r.width,
      height: r.height,
      scale: settings.scale,
      format: settings.format,
      now: new Date(),
    });
  }

  runExport(format: ExportFormat, scale: number, quality?: number): Promise<ExportResult> {
    const scene = this.scene;
    return this.exporter.export(scene, this.exportAssets(scene), {
      format,
      scale,
      ...(quality !== undefined ? { quality } : {}),
    });
  }

  setExportSettings(patch: Partial<ExportSettings>): void {
    const next = { ...this.ui.get().exportSettings, ...patch };
    this.ui.set({ exportSettings: next });
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  /** Copy PNG to the clipboard. Call synchronously from the user gesture. */
  copy(anchor?: Element | null): void {
    if (!this.ui.get().hasImage || this.ui.get().copyState === "busy") return;
    const { scale } = this.ui.get().exportSettings;
    const job = this.runExport("png", scale);
    this.ui.set({ copyState: "busy" });
    let write: Promise<void>;
    try {
      write = copyImageToClipboard(job.then((r) => r.blob));
    } catch (e) {
      write = Promise.reject(e);
    }
    Promise.all([write, job]).then(
      async ([, r]) => {
        this.ui.set({ copyState: "done" });
        setTimeout(() => {
          if (this.ui.get().copyState === "done") this.ui.set({ copyState: "idle" });
        }, 1600);
        sprinkle(anchor ?? null);
        this.emit("copied", r);
        this.toast({
          kind: "wrap",
          title: "Copied to clipboard",
          detail: `${r.width} × ${r.height} PNG · paste anywhere`,
          thumb: await thumbUrl(r.blob),
          action: { label: "Download", run: () => this.download() },
        });
        this.announce(`Copied ${r.width} by ${r.height} PNG to the clipboard.`);
      },
      async () => {
        this.ui.set({ copyState: "idle" });
        try {
          const r = await job;
          const settings = { ...this.ui.get().exportSettings, format: "png" as const };
          downloadBlob(r.blob, this.filenameFor(r, settings));
          this.toast({
            kind: "error",
            title: "Your browser blocked clipboard access",
            detail: "Downloading instead.",
            prose: true,
          });
        } catch (e) {
          this.toast({
            kind: "error",
            title: "Export failed",
            detail: e instanceof Error ? e.message : String(e),
            prose: true,
          });
        }
      },
    );
  }

  /** Download with the current export settings. */
  async download(anchor?: Element | null, override?: Partial<ExportSettings>): Promise<void> {
    if (!this.ui.get().hasImage || this.ui.get().exportBusy) return;
    const settings = { ...this.ui.get().exportSettings, ...override };
    this.ui.set({ exportBusy: true });
    try {
      const r = await this.runExport(settings.format, settings.scale, settings.quality);
      const actual = r.mime.includes("png")
        ? "png"
        : r.mime.includes("jpeg")
          ? "jpeg"
          : r.mime.includes("webp")
            ? "webp"
            : settings.format;
      const name = this.filenameFor(r, { ...settings, format: actual as ExportFormat });
      downloadBlob(r.blob, name);
      sprinkle(anchor ?? null);
      const fallback = actual !== settings.format;
      this.toast({
        kind: "wrap",
        title: `Saved ${name}`,
        detail: `${r.width} × ${r.height} ${actual.toUpperCase()} · ${formatBytes(r.blob.size)}${fallback ? ` (${settings.format.toUpperCase()} isn't supported here)` : ""}`,
        thumb: await thumbUrl(r.blob),
        action: { label: "Copy too", run: () => this.copy() },
      });
      this.announce(`Saved ${name}`);
    } catch (e) {
      this.toast({
        kind: "error",
        title: "Export failed",
        detail: e instanceof Error ? e.message : String(e),
        prose: true,
      });
    } finally {
      this.ui.set({ exportBusy: false });
    }
  }

  /** Mobile: share sheet with the file (Save to Photos), falling back to download. */
  async share(mode: "save" | "share" = "save"): Promise<void> {
    const settings = this.ui.get().exportSettings;
    this.ui.set({ exportBusy: true });
    try {
      const r = await this.runExport(settings.format, settings.scale, settings.quality);
      const name = this.filenameFor(r, settings);
      const file = new File([r.blob], name, { type: r.mime });
      const nav = navigator as Navigator & {
        canShare?: (d: ShareData) => boolean;
        share?: (d: ShareData) => Promise<void>;
      };
      if (typeof nav.share === "function" && nav.canShare?.({ files: [file] })) {
        try {
          await nav.share({ files: [file], title: "Shotcandy image" });
          this.ui.set({ mobileExport: false });
          return;
        } catch (e) {
          if ((e as Error).name === "AbortError") return;
        }
      }
      if (mode === "share" && typeof nav.share === "function") {
        this.toast({
          kind: "info",
          title: "Sharing files isn't supported here",
          detail: "Downloading instead.",
          prose: true,
        });
      }
      downloadBlob(r.blob, name);
      this.ui.set({ mobileExport: false });
      this.toast({
        kind: "wrap",
        title: `Saved ${name}`,
        detail: `${r.width} × ${r.height} · ${formatBytes(r.blob.size)}`,
        thumb: await thumbUrl(r.blob),
      });
    } catch (e) {
      this.toast({
        kind: "error",
        title: "Export failed",
        detail: e instanceof Error ? e.message : String(e),
        prose: true,
      });
    } finally {
      this.ui.set({ exportBusy: false });
    }
  }

  // ----------------------------------------------------------------- project
  async saveProject(): Promise<void> {
    if (!this.ui.get().hasImage) return;
    const scene = this.scene;
    const file = await createProjectFile(
      scene,
      this.exportAssets(scene)
        .filter((a) => !isBuiltinAssetId(a.id))
        .map((a) => ({ id: a.id, blob: a.blob, width: a.width, height: a.height })),
      { appVersion: APP_VERSION, now: new Date() },
    );
    const name = `${scene.meta.name || "shotcandy"}-${scene.meta.stylePresetId ?? "design"}.shotcandy`;
    downloadBlob(await projectToBlob(file), name);
    this.toast({ kind: "info", title: "Project saved", detail: name });
  }

  async openProject(file: Blob): Promise<void> {
    try {
      const p = await parseProject(file);
      for (const a of p.assets) {
        const img = await importImage(a.blob);
        this.library.add(img);
        void this.thumbs?.setAsset(img.id, img.proxy, img.width, img.height, img.palette);
      }
      this.store.reset(p.scene);
      this.ensureBuiltins(p.scene);
      const has = p.scene.content.kind === "image" && !!p.scene.content.assetId;
      this.designId = newId("d");
      this.designCreated = Date.now();
      this.ui.set((s) => ({
        hasImage: has,
        xfade: s.xfade + 1,
        zoom: null,
        pan: { x: 0, y: 0 },
        tool: "select",
      }));
      this.bumpAssets();
      this.toast({
        kind: "info",
        title: "Project opened",
        detail: p.issues.length ? `With notes: ${p.issues.join("; ")}` : "Everything restored.",
        prose: true,
      });
    } catch (e) {
      this.toast({
        kind: "error",
        title: "Couldn't open that project",
        detail: e instanceof Error ? e.message : String(e),
        prose: true,
      });
    }
  }

  // ----------------------------------------------------------------- presets
  async refreshPresets(): Promise<void> {
    if (!this.db) return;
    try {
      this.ui.set({ customPresets: await this.db.presets.list() });
    } catch {
      /* ignore */
    }
  }

  async savePreset(name?: string): Promise<PresetRecord | null> {
    const s = this.scene;
    const now = Date.now();
    const base = styleName(s.meta.stylePresetId, this.ui.get().customPresets);
    const rec: PresetRecord = {
      id: newId("u"),
      name: name?.trim() || `${base} tweak`,
      patch: extractStylePatch(s),
      schemaVersion: SCENE_VERSION,
      createdAt: now,
      updatedAt: now,
    };
    // Keep the list reactive even without IndexedDB.
    this.ui.set((u) => ({ customPresets: [rec, ...u.customPresets] }));
    if (this.db) await this.db.presets.put(rec).catch(() => undefined);
    this.store.update((sc) => ({ ...sc, meta: { ...sc.meta, stylePresetId: rec.id } }), {
      transient: true,
    });
    this.announce(`Saved style ${rec.name}`);
    return rec;
  }

  async renamePreset(id: string, name: string): Promise<void> {
    const rec = this.ui.get().customPresets.find((p) => p.id === id);
    if (!rec || !name.trim()) return;
    const next = { ...rec, name: name.trim(), updatedAt: Date.now() };
    this.ui.set((u) => ({ customPresets: u.customPresets.map((p) => (p.id === id ? next : p)) }));
    if (this.db) await this.db.presets.put(next).catch(() => undefined);
  }

  async deletePreset(id: string): Promise<void> {
    const rec = this.ui.get().customPresets.find((p) => p.id === id);
    if (!rec) return;
    this.ui.set((u) => ({ customPresets: u.customPresets.filter((p) => p.id !== id) }));
    if (this.db) await this.db.presets.delete(id).catch(() => undefined);
    this.toast({
      kind: "undo",
      title: `Deleted “${rec.name}”`,
      action: {
        label: "Undo",
        run: () => {
          this.ui.set((u) => ({ customPresets: [rec, ...u.customPresets] }));
          void this.db?.presets.put(rec);
        },
      },
    });
  }

  // ----------------------------------------------------------------- recents
  async refreshRecents(): Promise<void> {
    if (!this.db) return;
    try {
      const list = await this.db.designs.list();
      this.ui.set({ recents: list });
    } catch {
      /* ignore */
    }
  }

  private onSceneChange() {
    if (!this.ui.get().hasImage || !this.db) return;
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = setTimeout(() => void this.autosave(), 900);
  }

  /** Save the current design into "Recent designs" (debounced after edits). */
  async autosave(): Promise<void> {
    if (!this.db || !this.ui.get().hasImage) return;
    const scene = this.scene;
    if (!this.designId) {
      this.designId = newId("d");
      this.designCreated = Date.now();
    }
    let thumbnail: Blob | undefined;
    try {
      thumbnail = await this.designThumbnail(scene);
    } catch {
      thumbnail = undefined;
    }
    const rec: DesignRecord = {
      id: this.designId,
      name: styleName(scene.meta.stylePresetId, this.ui.get().customPresets),
      scene,
      ...(thumbnail ? { thumbnail } : {}),
      createdAt: this.designCreated,
      updatedAt: Date.now(),
    };
    try {
      await this.db.designs.put(rec);
      const all = await this.db.designs.list();
      const extra = all.slice(MAX_RECENTS);
      for (const d of extra) await this.db.designs.delete(d.id);
      const kept = all.slice(0, MAX_RECENTS);
      this.ui.set({ recents: kept });
      if (extra.length) {
        const keep = new Set<string>();
        for (const d of kept) for (const id of sceneAssetIds(d.scene)) keep.add(id);
        await this.db.assets.gc(keep);
      }
      this.emit("autosaved", rec.id);
    } catch {
      /* storage full or blocked: editing continues */
    }
  }

  private async designThumbnail(scene: Scene): Promise<Blob | undefined> {
    const thumbs = this.thumbs;
    if (!thumbs) return undefined;
    const s: Scene = {
      ...scene,
      canvas: { ...scene.canvas, size: { kind: "aspect", ratioW: 16, ratioH: 10 } },
    };
    const layout = layoutScene(s, this.resolver);
    const scale = Math.min(1, 480 / Math.max(layout.canvas.width, layout.canvas.height));
    const bmp = await thumbs.request(`design:${this.designId}:${Date.now()}`, s, scale, 1);
    const c = document.createElement("canvas");
    c.width = bmp.width;
    c.height = bmp.height;
    c.getContext("2d")!.drawImage(bmp, 0, 0);
    return new Promise((res) => c.toBlob((b) => res(b ?? undefined), "image/webp", 0.8));
  }

  async openRecent(id: string): Promise<void> {
    if (!this.db) return;
    const d = await this.db.designs.get(id);
    if (!d) return;
    for (const assetId of sceneAssetIds(d.scene)) {
      if (this.library.has(assetId) || isBuiltinAssetId(assetId)) continue;
      const rec = await this.db.assets.get(assetId);
      if (rec) {
        const img = await importImage(rec.blob);
        this.library.add(img);
        void this.thumbs?.setAsset(img.id, img.proxy, img.width, img.height, img.palette);
      }
    }
    this.store.reset(d.scene);
    this.ensureBuiltins(d.scene);
    this.designId = d.id;
    this.designCreated = d.createdAt;
    const has = d.scene.content.kind === "image" && !!d.scene.content.assetId;
    this.ui.set((s) => ({
      hasImage: has,
      modal: null,
      xfade: s.xfade + 1,
      zoom: null,
      pan: { x: 0, y: 0 },
      tool: "select",
    }));
    this.bumpAssets();
    this.announce(`Opened recent design ${d.name}`);
  }

  async deleteRecent(id: string): Promise<void> {
    if (!this.db) return;
    await this.db.designs.delete(id).catch(() => undefined);
    if (this.designId === id) this.designId = null;
    await this.refreshRecents();
  }
}

/** A small object URL for toast thumbnails (decodes and downsizes off the main thread). */
async function thumbUrl(blob: Blob): Promise<string | undefined> {
  try {
    const bmp = await createImageBitmap(blob, { resizeWidth: 124, resizeQuality: "medium" });
    const c = document.createElement("canvas");
    c.width = bmp.width;
    c.height = bmp.height;
    c.getContext("2d")!.drawImage(bmp, 0, 0);
    bmp.close();
    const out = await new Promise<Blob | null>((r) => c.toBlob(r, "image/png"));
    return out ? URL.createObjectURL(out) : undefined;
  } catch {
    return undefined;
  }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
