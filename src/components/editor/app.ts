"use client";
/**
 * EditorApp: the editor's controller. Owns the scene store (undo/redo), the
 * asset library, render cache, exporter, thumbnail service, persistence and
 * the UI store, and exposes every user action as a method so components,
 * keyboard shortcuts and tests all drive the same code paths.
 */
import {
  type AnimationFormat,
  type AnimationQuality,
  type AnimationSpec,
  type GifColors,
  type MotionContext,
  type Annotation,
  type AnnotationKind,
  type CodeContent,
  type PostContent,
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
  AnimationExporter,
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
  createAnimation,
  createAnnotation,
  createProjectFile,
  evaluateScene,
  getMotionPreset,
  getCodeStyle,
  getPostStyle,
  samplePost,
  clearTextMeasureCache,
  codeTokensKey,
  isAbortError,
  planAnimation,
  renderToCanvas,
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
import { createAnimationWorker } from "@/engine/animation/worker-factory";
import { createEditorStore, type EditorStore } from "@/state/editor-store";
import { APP_VERSION } from "@/config/site";
import { loadCanvasFonts, registerBrandFonts } from "@/lib/fonts";
import { GHOST_H, GHOST_ID, GHOST_W, loadGhost } from "@/lib/ghost";
import { createStore, type Store } from "@/lib/store";
import { ThumbService } from "@/lib/thumbs/service";
import { sprinkle } from "@/lib/sprinkles";
import { prefersReducedMotion } from "@/lib/platform";
import { type Mode, initialCodeScene, initialPostScene, modeForScene } from "./modes";

registerBrandFonts();

export type Tool = "select" | "text" | "arrow" | "rect" | "redact";
export type Popover = null | "size" | "export" | "more" | "mode";
export type Modal = null | "gallery" | "shortcuts" | "recents";
export type MobileTab =
  | "styles"
  | "motion"
  | "background"
  | "layout"
  | "frame"
  | "draw"
  | "code"
  | "theme"
  | "window"
  | "post"
  | "slides";

export interface MotionExportSettings {
  format: AnimationFormat;
  /** Video: short side in px (720, 1080, 1440, 2160). */
  videoRes: number;
  /** GIF: long side in px. */
  gifSize: number;
  quality: AnimationQuality;
  gifFps: number;
  gifColors: GifColors;
  dither: boolean;
}

export interface ExportSettings {
  format: ExportFormat;
  scale: number;
  quality: number;
  pattern: string;
  /** What the Export button produces: a still image or the motion clip. */
  kind: "image" | "motion";
  motion: MotionExportSettings;
}

export const DEFAULT_MOTION_EXPORT: MotionExportSettings = {
  format: "mp4",
  videoRes: 1080,
  gifSize: 800,
  quality: "balanced",
  gifFps: 20,
  gifColors: 128,
  dither: true,
};

export interface MotionExportState {
  format: AnimationFormat;
  stage: "starting" | "palette" | "frames" | "finishing";
  done: number;
  total: number;
}

/** Playback of the motion preview (kept out of UiState: it changes every frame). */
export interface PlaybackState {
  playing: boolean;
  /** Playhead in seconds, or null for the rest pose (the still design). */
  t: number | null;
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
  /** Which kind of design is being edited. */
  mode: Mode;
  /** The design has something to export (a screenshot, code, a post, ...). */
  hasContent: boolean;
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
  motionExport: MotionExportState | null;
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

function loadMotionSettings(raw: unknown): MotionExportSettings {
  const d = DEFAULT_MOTION_EXPORT;
  if (!raw || typeof raw !== "object") return { ...d };
  const p = raw as Partial<MotionExportSettings>;
  return {
    format: p.format === "gif" || p.format === "webm" ? p.format : "mp4",
    videoRes: [720, 1080, 1440, 2160].includes(Number(p.videoRes))
      ? Number(p.videoRes)
      : d.videoRes,
    gifSize: [480, 640, 800, 1080].includes(Number(p.gifSize)) ? Number(p.gifSize) : d.gifSize,
    quality: p.quality === "small" || p.quality === "best" ? p.quality : "balanced",
    gifFps: [10, 15, 20, 25].includes(Number(p.gifFps)) ? Number(p.gifFps) : d.gifFps,
    gifColors: [64, 128, 256].includes(Number(p.gifColors))
      ? (Number(p.gifColors) as GifColors)
      : d.gifColors,
    dither: typeof p.dither === "boolean" ? p.dither : true,
  };
}

function loadSettings(): ExportSettings {
  const d: ExportSettings = {
    format: "png",
    scale: 2,
    quality: 0.92,
    pattern: DEFAULT_FILENAME_PATTERN,
    kind: "image",
    motion: { ...DEFAULT_MOTION_EXPORT },
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
      kind: "image",
      motion: loadMotionSettings(p.motion),
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
  return (
    getStylePreset(id)?.name ??
    getCodeStyle(id)?.name ??
    getPostStyle(id)?.name ??
    custom.find((p) => p.id === id)?.name ??
    "Custom"
  );
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
        return {
          title: "HEIC photos aren't supported yet",
          detail:
            "Save it as PNG or JPEG and try again. On iPhone: Settings › Camera › Formats › Most Compatible.",
        };
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
  readonly animator = new AnimationExporter({ createWorker: createAnimationWorker });
  readonly ui: Store<UiState>;
  readonly playback: Store<PlaybackState> = createStore<PlaybackState>({ playing: false, t: null });
  private motionAbort: AbortController | null = null;
  private tickRaf = 0;
  /** Each mode's design while another mode is shown. */
  private stash: Partial<
    Record<Mode, { scene: Scene; hasContent: boolean; designId: string | null }>
  > = {};
  private highlightTimer: ReturnType<typeof setTimeout> | null = null;
  private highlightJob = 0;
  private lastTick = 0;
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
      mode: "screenshot",
      hasContent: false,
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
        kind: "image",
        motion: { ...DEFAULT_MOTION_EXPORT },
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
      motionExport: null,
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
      clearTextMeasureCache();
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
    this.store.subscribe(() => this.scheduleHighlight());
    const idle = (cb: () => void) =>
      (
        window as unknown as { requestIdleCallback?: (c: () => void, o?: object) => void }
      ).requestIdleCallback?.(cb, { timeout: 2000 }) ?? setTimeout(cb, 600);
    idle(() => this.exporter.prewarm());

    const params = new URLSearchParams(window.location.search);
    const modeParam = params.get("mode");
    if (modeParam === "code" || modeParam === "post" || modeParam === "appstore")
      this.setMode(modeParam);
    if (modeParam === "code") {
      // Code handed over from the code screenshot page.
      try {
        const handoff = sessionStorage.getItem("shotcandy:code-handoff");
        if (handoff) {
          sessionStorage.removeItem("shotcandy:code-handoff");
          this.setCode({ code: handoff, language: "auto", title: "", highlight: [] });
          this.store.reset(this.scene);
        }
      } catch {
        /* storage blocked */
      }
    }
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

    if (params.get("gallery")) this.ui.set({ modal: "gallery" });
    const open = params.get("open");
    const sample = params.get("sample");
    if (open || sample || style || size || modeParam || params.get("gallery")) {
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
    this.motionAbort?.abort();
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
    // Pasting a screenshot in Code or Post mode starts a screenshot design.
    const m = this.ui.get().mode;
    if (m === "code" || m === "post") this.setMode("screenshot");
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
    const first = !this.ui.get().hasContent;
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
      hasContent: true,
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
    if (this.ui.get().hasContent) this.ui.set((s) => ({ xfade: s.xfade + 1 }));
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
    this.stopPreview();
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
    this.store.update((s) =>
      updateAnnotation(s, id, { ...patch, anchor: to } as Partial<Annotation>),
    );
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

  // ------------------------------------------------------------------- modes
  /** Switch editor mode; each mode keeps its own design (and starts fresh once). */
  setMode(mode: Mode): void {
    const ui = this.ui.get();
    if (ui.mode === mode) return;
    this.stopPreview();
    this.stash[ui.mode] = { scene: this.scene, hasContent: ui.hasContent, designId: this.designId };
    const next = this.stash[mode];
    let scene: Scene;
    let has: boolean;
    if (next) {
      scene = next.scene;
      has = next.hasContent;
      this.designId = next.designId;
    } else {
      scene = this.freshScene(mode);
      has = mode === "code" || mode === "post";
      this.designId = has ? newId("d") : null;
      this.designCreated = Date.now();
    }
    this.store.reset(scene);
    this.store.select(null);
    this.ui.set((s) => ({
      mode,
      hasContent: has,
      tool: "select",
      editingText: null,
      popover: null,
      zoom: null,
      pan: { x: 0, y: 0 },
      xfade: s.xfade + 1,
      exportSettings: {
        ...s.exportSettings,
        kind: scene.animation ? s.exportSettings.kind : "image",
      },
    }));
    this.emit("mode", mode);
    this.announce(
      `${mode === "appstore" ? "App Store set" : mode[0]!.toUpperCase() + mode.slice(1)} mode`,
    );
  }

  protected freshScene(mode: Mode): Scene {
    if (mode === "code") return initialCodeScene();
    if (mode === "post") return initialPostScene();
    return initialScene();
  }

  /** Put a loaded design (recent or project) into the mode its content belongs to. */
  private adoptMode(scene: Scene): void {
    const mode = modeForScene(scene);
    const ui = this.ui.get();
    if (ui.mode !== mode) {
      this.stash[ui.mode] = {
        scene: this.scene,
        hasContent: ui.hasContent,
        designId: this.designId,
      };
      delete this.stash[mode];
      this.ui.set({ mode });
    }
  }

  // -------------------------------------------------------------------- code
  get code(): CodeContent | null {
    const c = this.scene.content;
    return c.kind === "code" ? c : null;
  }

  /** Edit the code content (text, language, theme, window options). */
  setCode(patch: Partial<CodeContent>, coalesce?: string): void {
    this.store.update(
      (s) => (s.content.kind === "code" ? { ...s, content: { ...s.content, ...patch } } : s),
      { coalesce: coalesce ?? `code:${Object.keys(patch).join(",")}` },
    );
  }

  /** Apply a code style: the theme on the code plus its matching background. */
  applyCodeStyle(id: string): void {
    const style = getCodeStyle(id);
    if (!style) return;
    this.store.update((s) => {
      const next = applyStylePatch(s, style.patch, id);
      return next.content.kind === "code"
        ? { ...next, content: { ...next.content, theme: style.theme } }
        : next;
    });
    this.ui.set((u) => ({ xfade: u.xfade + 1 }));
    this.announce(`Theme: ${style.name}`);
  }

  /** Re-highlight code whose stored tokens are stale (debounced; Shiki loads lazily). */
  private scheduleHighlight(): void {
    const c = this.code;
    if (!c) return;
    const key = codeTokensKey(c.code, c.language);
    if (c.tokens?.key === key) return;
    if (this.highlightTimer) clearTimeout(this.highlightTimer);
    const job = ++this.highlightJob;
    this.highlightTimer = setTimeout(async () => {
      try {
        const { highlightCode } = await import("@/lib/code/highlight");
        const tokens = await highlightCode(c.code, c.language);
        if (job !== this.highlightJob || this.disposed) return;
        this.store.update(
          (s) =>
            s.content.kind === "code" &&
            codeTokensKey(s.content.code, s.content.language) === tokens.key
              ? { ...s, content: { ...s.content, tokens } }
              : s,
          { transient: true },
        );
        this.emit("highlighted", tokens.language);
      } catch {
        /* keep plain text */
      }
    }, 90);
  }

  // -------------------------------------------------------------------- post
  get post(): PostContent | null {
    const c = this.scene.content;
    return c.kind === "post" ? c : null;
  }

  setPost(patch: Partial<PostContent>, coalesce?: string): void {
    this.store.update(
      (s) => (s.content.kind === "post" ? { ...s, content: { ...s.content, ...patch } } : s),
      { coalesce: coalesce ?? `post:${Object.keys(patch).join(",")}` },
    );
  }

  /** Switch between social post and testimonial, filling sample copy only if untouched. */
  setPostVariant(variant: PostContent["variant"]): void {
    const cur = this.post;
    if (!cur || cur.variant === variant) return;
    const sampleFrom = samplePost(cur.variant);
    const sampleTo = samplePost(variant);
    const untouched = (k: "text" | "handle" | "date") => cur[k] === sampleFrom[k];
    this.setPost({
      variant,
      text: untouched("text") ? sampleTo.text : cur.text,
      handle: untouched("handle") ? sampleTo.handle : cur.handle,
      date: untouched("date") ? sampleTo.date : cur.date,
      rating: variant === "testimonial" && cur.rating === 0 ? 5 : cur.rating,
    });
  }

  applyPostStyle(id: string): void {
    const style = getPostStyle(id);
    if (!style) return;
    this.store.update((s) => {
      const next = applyStylePatch(s, style.patch, id);
      return next.content.kind === "post"
        ? { ...next, content: { ...next.content, theme: style.theme, accent: style.accent } }
        : next;
    });
    this.ui.set((u) => ({ xfade: u.xfade + 1 }));
    this.announce(`Card style: ${style.name}`);
  }

  /** Use an uploaded photo as the post avatar (stays on the device). */
  async setAvatar(blob: Blob): Promise<void> {
    try {
      const img = await importImage(blob);
      this.library.add(img);
      void this.thumbs?.setAsset(img.id, img.proxy, img.width, img.height, img.palette);
      this.setPost({ avatarAssetId: img.id });
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
      this.announce("Avatar added");
    } catch (e) {
      const m = importMessage(e);
      this.toast({ kind: "error", title: m.title, detail: m.detail, prose: true });
    }
  }

  // ------------------------------------------------------------------ motion
  /** Assets and palette the motion timeline needs. */
  motionContext(): MotionContext {
    const c = this.scene.content;
    const palette = c.kind === "image" && c.assetId ? this.library.get(c.assetId)?.palette : null;
    return { assets: this.resolver, palette: palette ?? null };
  }

  /** Where the playhead rests when paused: the end pose, or phase 0 for loops. */
  restTime(spec: AnimationSpec | undefined = this.scene.animation): number {
    if (!spec) return 0;
    const p = getMotionPreset(spec.preset);
    if (!p || p.periodic) return 0;
    if (spec.loop === "boomerang") return spec.duration * 0.5;
    return spec.duration * ((p.onceWindow?.[1] ?? 0.72) + 1) * 0.5;
  }

  /** Pick a motion preset (null turns motion off). */
  setMotion(id: string | null): void {
    const prev = this.scene.animation;
    if (!id) {
      this.store.update((s) => {
        const { animation: _a, ...rest } = s;
        return rest as Scene;
      });
      this.playback.set({ playing: false, t: null });
      if (this.ui.get().exportSettings.kind === "motion") this.setExportSettings({ kind: "image" });
      this.announce("Motion off");
      return;
    }
    const preset = getMotionPreset(id);
    if (!preset) return;
    const spec = createAnimation(id, prev);
    this.store.update((s) => ({ ...s, animation: spec }));
    this.setExportSettings({ kind: "motion" });
    this.announce(`Motion: ${preset.label}. ${preset.description}`);
    if (prefersReducedMotion()) this.playback.set({ playing: false, t: null });
    else this.play(0);
  }

  updateMotion(patch: Partial<AnimationSpec>, coalesce?: string): void {
    if (!this.scene.animation) return;
    this.store.update(
      (s) => (s.animation ? { ...s, animation: { ...s.animation, ...patch } } : s),
      { coalesce: coalesce ?? `motion:${Object.keys(patch).join(",")}` },
    );
    const t = this.playback.get().t;
    const d = this.scene.animation?.duration ?? 1;
    if (t !== null && t > d) this.playback.set({ t: t % d });
  }

  play(from?: number): void {
    if (!this.scene.animation) return;
    const cur = this.playback.get().t;
    const d = this.scene.animation.duration;
    this.playback.set({ playing: true, t: from ?? (cur === null || cur >= d - 1e-3 ? 0 : cur) });
    this.store.select(null);
    this.ui.set({ editingText: null, tool: "select" });
    if (!this.tickRaf) {
      this.lastTick = 0;
      this.tickRaf = requestAnimationFrame(this.tick);
    }
  }

  /** Advances the playhead in real time while playing (the preview, not the export). */
  private tick = (now: number) => {
    const p = this.playback.get();
    const spec = this.scene.animation;
    if (!p.playing || !spec || this.disposed) {
      this.tickRaf = 0;
      return;
    }
    const dt = this.lastTick ? Math.min(0.1, (now - this.lastTick) / 1000) : 0;
    this.lastTick = now;
    this.playback.set({ t: ((p.t ?? 0) + dt) % spec.duration });
    this.tickRaf = requestAnimationFrame(this.tick);
  };

  pause(): void {
    if (this.playback.get().playing) this.playback.set({ playing: false });
  }

  togglePlay(): void {
    if (this.playback.get().playing) this.pause();
    else this.play();
  }

  seek(t: number): void {
    const d = this.scene.animation?.duration ?? 0;
    this.playback.set({ playing: false, t: Math.max(0, Math.min(d, t)) });
  }

  /** Back to the still design (so annotations can be edited in place). */
  stopPreview(): void {
    const p = this.playback.get();
    if (p.playing || p.t !== null) this.playback.set({ playing: false, t: null });
  }

  /** Output size and timing of the motion export with the current settings. */
  motionPlan(settings: MotionExportSettings = this.ui.get().exportSettings.motion) {
    const scene = this.scene;
    if (!scene.animation) return null;
    const ctx = this.motionContext();
    const base = layoutScene(evaluateScene(scene, 0, ctx), this.resolver).canvas;
    const scale =
      settings.format === "gif"
        ? settings.gifSize / Math.max(base.width, base.height)
        : Math.min(
            settings.videoRes / Math.min(base.width, base.height),
            4096 / Math.max(base.width, base.height),
          );
    const opts = {
      format: settings.format,
      scale,
      ...(settings.format === "gif" ? { fps: settings.gifFps } : {}),
    };
    return { ...planAnimation(scene, this.resolver, opts, ctx.palette), scale };
  }

  /** Render and download the motion clip (MP4, WebM or GIF). */
  async exportMotion(anchor?: Element | null): Promise<void> {
    const scene = this.scene;
    if (!scene.animation || !this.ui.get().hasContent || this.ui.get().motionExport) return;
    const settings = this.ui.get().exportSettings.motion;
    const plan = this.motionPlan(settings);
    if (!plan) return;
    const ac = new AbortController();
    this.motionAbort = ac;
    this.pause();
    this.ui.set({
      motionExport: { format: settings.format, stage: "starting", done: 0, total: plan.frames },
    });
    this.announce(`Rendering ${settings.format.toUpperCase()}, ${plan.frames} frames`);
    let last = 0;
    try {
      const r = await this.animator.export(
        scene,
        this.exportAssets(scene),
        {
          format: settings.format,
          scale: plan.scale,
          quality: settings.quality,
          ...(settings.format === "gif"
            ? { fps: settings.gifFps, gifColors: settings.gifColors, dither: settings.dither }
            : {}),
        },
        {
          signal: ac.signal,
          onProgress: (p) => {
            const now = performance.now();
            if (now - last < 50 && p.done < p.total) return;
            last = now;
            this.ui.set({ motionExport: { format: settings.format, ...p } });
          },
        },
      );
      const name = formatFilename("{name}-{style}-{w}x{h}", {
        name: scene.meta.name,
        style: scene.animation.preset,
        width: r.width,
        height: r.height,
        scale: 1,
        format: settings.format,
        now: new Date(),
      });
      downloadBlob(r.blob, name);
      sprinkle(anchor ?? null);
      this.emit("motion-exported", r);
      this.toast({
        kind: "wrap",
        title: `Saved ${name}`,
        detail: `${r.duration.toFixed(1)} s · ${r.width} × ${r.height} · ${r.fps} fps · ${formatBytes(r.blob.size)}`,
        thumb: await this.posterUrl(scene),
        duration: 4200,
      });
      this.announce(`Saved ${name}`);
    } catch (e) {
      if (isAbortError(e)) {
        this.toast({ kind: "info", title: "Export cancelled", detail: "Nothing was saved." });
      } else {
        this.toast({
          kind: "error",
          title: "Couldn't render the clip",
          detail: e instanceof Error ? e.message : String(e),
          prose: true,
          duration: 6000,
        });
      }
    } finally {
      this.motionAbort = null;
      this.ui.set({ motionExport: null });
    }
  }

  cancelMotionExport(): void {
    this.motionAbort?.abort();
  }

  /** A small still of the design for the export toast. */
  private async posterUrl(scene: Scene): Promise<string | undefined> {
    try {
      const layout = layoutScene(scene, this.resolver);
      const scale = 124 / Math.max(layout.canvas.width, layout.canvas.height);
      const { canvas } = renderToCanvas(scene, this.resolver, { scale, cache: this.cache });
      const blob = await (canvas as OffscreenCanvas).convertToBlob?.({ type: "image/png" });
      return blob ? URL.createObjectURL(blob) : undefined;
    } catch {
      return undefined;
    }
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
    if (!this.ui.get().hasContent || this.ui.get().copyState === "busy") return;
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
          action: { label: "Download", run: () => void this.downloadImage() },
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

  /** The Export button: the motion clip when motion export is chosen, else the image. */
  async download(anchor?: Element | null): Promise<void> {
    if (this.ui.get().exportSettings.kind === "motion" && this.scene.animation)
      return this.exportMotion(anchor);
    return this.downloadImage(anchor);
  }

  /** Download a still image with the current export settings. */
  async downloadImage(anchor?: Element | null, override?: Partial<ExportSettings>): Promise<void> {
    if (!this.ui.get().hasContent || this.ui.get().exportBusy) return;
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
    if (!this.ui.get().hasContent) return;
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
      this.adoptMode(p.scene);
      this.store.reset(p.scene);
      this.ensureBuiltins(p.scene);
      const has = p.scene.content.kind !== "image" || !!p.scene.content.assetId;
      this.designId = newId("d");
      this.designCreated = Date.now();
      this.ui.set((s) => ({
        hasContent: has,
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
    if (!this.ui.get().hasContent || !this.db) return;
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = setTimeout(() => void this.autosave(), 900);
  }

  /** Save the current design into "Recent designs" (debounced after edits). */
  async autosave(): Promise<void> {
    if (!this.db || !this.ui.get().hasContent) return;
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
    this.adoptMode(d.scene);
    this.store.reset(d.scene);
    this.ensureBuiltins(d.scene);
    this.designId = d.id;
    this.designCreated = d.createdAt;
    const has = d.scene.content.kind !== "image" || !!d.scene.content.assetId;
    this.ui.set((s) => ({
      hasContent: has,
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
