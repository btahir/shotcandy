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
  type CaptionSpec,
  type DesignRecord,
  type ExportFormat,
  type ExportResult,
  type ImportedImage,
  type PresetRecord,
  type Scene,
  type ShotcandyStore,
  type StylePatch,
  type StylePreset,
  AnimationExporter,
  AssetLibrary,
  DEFAULT_FILENAME_PATTERN,
  DEFAULT_STYLE_ID,
  DEFAULT_CAPTION,
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
  createSetTemplate,
  createProjectFile,
  evaluateScene,
  extrapolateGifBytes,
  extrapolateVideoBytes,
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
  importVideo,
  isBuiltinAssetId,
  isVideoFile,
  isVideoScene,
  sceneClip,
  sniffVideoKind,
  sourceTime,
  timelineDuration,
  trimClip,
  createClip,
  clipLength,
  formatClipTime,
  roughAnimationBytes,
  withVideoFrame,
  STILL_MOTION_ID,
  MAX_STORED_VIDEO_BYTES,
  type VideoClip,
  layoutScene,
  setCanvasSize,
  maxExportScale,
  openStore,
  parseProject,
  projectToBlob,
  readClipboardImage,
  removeAnnotation,
  sceneAssetIds,
  setIn,
  updateAnnotation,
  collectKeepIds,
} from "@/engine";
import { createExportWorker } from "@/engine/export/worker-factory";
import { createAnimationWorker } from "@/engine/animation/worker-factory";
import { createEditorStore, type EditorHistory, type EditorStore } from "@/state/editor-store";
import {
  type EditorDoc,
  batchLens,
  docScene,
  hasImage,
  isBatch,
  itemScene,
  mapItems,
  routeEdit,
} from "@/engine/batch/batch";
import { type PickedFile, fileKind } from "@/engine/input/files";
import { planImport } from "@/engine/batch/plan";
import { APP_VERSION } from "@/config/site";
import { loadCanvasFonts, registerBrandFonts } from "@/lib/fonts";
import { GHOST_H, GHOST_ID, GHOST_W, loadGhost } from "@/lib/ghost";
import { createStore, type Store } from "@/lib/store";
import { ThumbService } from "@/lib/thumbs/service";
import { sprinkle } from "@/lib/sprinkles";
import { prefersReducedMotion } from "@/lib/platform";
import { VideoPreview } from "./video-preview";
import { type Mode, initialCodeScene, initialPostScene, modeForScene } from "./modes";
import { APPSTORE_SET_KEY, SetController } from "./appstore";
import { BATCH_KEY, BatchController } from "./batch";
import { ScreensController } from "./screens";
import { orientationOf, shuffleComposition, suitedStyles } from "./shuffle";
import {
  COPY_MAX_LONG,
  type DestinationId,
  type ExportPlan,
  type ScaleChoice,
  DESTINATIONS,
  drawRatio,
  getDestination,
  nextAttempt,
  planExport,
} from "./export-plan";

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
  /** 0 = Auto (1x when the screenshot is already at native pixels). */
  scale: ScaleChoice;
  /** Where the image is going: picks format, scale and limits. */
  destination: DestinationId;
  /** Copy at full size instead of capping the long side at 4096 px. */
  copyFull: boolean;
  quality: number;
  pattern: string;
  /** What the Export button produces: a still image or the motion clip. */
  kind: "image" | "motion";
  motion: MotionExportSettings;
}

/** GIF defaults (640 px, 15 fps) keep typical 3-4 s loops under 5 MB (REVIEW r2 N7). */
export const DEFAULT_MOTION_EXPORT: MotionExportSettings = {
  format: "mp4",
  videoRes: 1080,
  gifSize: 640,
  quality: "balanced",
  gifFps: 15,
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
  /** Bumped when a recording's preview frame changes without the playhead moving. */
  frame: number;
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

const SETTINGS_VERSION = 3;

export function defaultExportSettings(): ExportSettings {
  return {
    format: "png",
    scale: 0,
    destination: "original",
    copyFull: false,
    quality: 0.92,
    pattern: DEFAULT_FILENAME_PATTERN,
    kind: "image",
    motion: { ...DEFAULT_MOTION_EXPORT },
  };
}

function loadSettings(): ExportSettings {
  const d: ExportSettings = defaultExportSettings();
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return d;
    const p = JSON.parse(raw) as Partial<ExportSettings> & { v?: number };
    // Settings from before smart scale kept the old 2x default: start them on Auto.
    const scale =
      (p.v ?? 0) >= 2 && [0, 1, 2, 3, 4].includes(Number(p.scale)) ? Number(p.scale) : 0;
    return {
      format: p.format === "jpeg" || p.format === "webp" ? p.format : "png",
      scale: scale as ScaleChoice,
      destination: DESTINATIONS.some((x) => x.id === p.destination)
        ? (p.destination as DestinationId)
        : "original",
      copyFull: p.copyFull === true,
      quality: typeof p.quality === "number" ? Math.min(1, Math.max(0.3, p.quality)) : 0.92,
      pattern: typeof p.pattern === "string" && p.pattern.trim() ? p.pattern : d.pattern,
      kind: "image",
      // Before v3 the GIF defaults made 6-9 MB files: start those on the new defaults.
      motion:
        (p.v ?? 0) < 3
          ? { ...loadMotionSettings(p.motion), gifSize: 640, gifFps: 15 }
          : loadMotionSettings(p.motion),
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

/** Whether a dropped, pasted or stored file is a screen recording. */
async function isVideoBlob(blob: Blob): Promise<boolean> {
  if (isVideoFile({ type: blob.type, name: (blob as File).name })) return true;
  if (blob.type && blob.type.startsWith("image/")) return false;
  const head = new Uint8Array(await blob.slice(0, 64).arrayBuffer());
  return sniffVideoKind(head) !== null;
}

/** Open a stored or project asset: a screenshot or a screen recording. */
async function importMedia(blob: Blob): Promise<ImportedImage> {
  return (await isVideoBlob(blob)) ? importVideo(blob) : importImage(blob);
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
        return { title: "That file is too big to edit", detail: e.message };
      case "too-long":
        return { title: "That recording is too long", detail: e.message };
      case "video-codec":
        return { title: "Your browser can't play that recording", detail: e.message };
      case "empty":
        return { title: "That file is empty", detail: "Try exporting the screenshot again." };
      case "decode-failed":
        return e.message.includes("recording") || e.message.includes("video")
          ? { title: "Couldn't read that recording", detail: e.message }
          : {
              title: "Couldn't read that image",
              detail: "It may be corrupt. Try PNG, JPEG or WebP.",
            };
      default:
        return {
          title: "Couldn't read that file",
          detail: e.message,
        };
    }
  }
  return { title: "Couldn't read that file", detail: "Try PNG, JPEG or WebP." };
}

/**
 * Tall canvases (9:16, 4:5 and taller) holding a landscape screenshot get the
 * caption card on by default, once: a caption the user turned off stays off.
 */
export function withAutoCaption(
  s: Scene,
  content: { width: number; height: number } | null,
): Scene {
  if (s.caption || !content || s.content.kind !== "image") return s;
  const size = s.canvas.size;
  const ratio =
    size.kind === "fixed"
      ? size.height / size.width
      : size.kind === "aspect"
        ? size.ratioH / size.ratioW
        : 0;
  const landscape = content.width / content.height >= 1.15;
  return ratio >= 1.2 && landscape ? { ...s, caption: { ...DEFAULT_CAPTION } } : s;
}

let annSeq = 0;
const newId = (p: string) => `${p}_${Date.now().toString(36)}${(annSeq++).toString(36)}`;

export class EditorApp {
  /** The document: one design, or a batch of images sharing a style (screenshot mode). */
  readonly store: EditorStore<EditorDoc>;
  readonly library = new AssetLibrary();
  readonly cache = new RenderCache();
  readonly exporter = new Exporter({ createWorker: createExportWorker });
  readonly animator = new AnimationExporter({ createWorker: createAnimationWorker });
  readonly ui: Store<UiState>;
  readonly playback: Store<PlaybackState> = createStore<PlaybackState>({
    playing: false,
    t: null,
    frame: 0,
  });
  /** Live preview of a screen recording (the export decodes frames itself). */
  readonly video = new VideoPreview(() => this.playback.set((s) => ({ frame: s.frame + 1 })));
  /** Hover-to-preview: a scene shown on the stage instead of the real one (never in history). */
  readonly preview: Store<{ scene: Scene | null; label: string | null }> = createStore<{
    scene: Scene | null;
    label: string | null;
  }>({ scene: null, label: null });
  private previewTimer: ReturnType<typeof setTimeout> | null = null;
  /** App Store set slides and options (App Store mode). */
  readonly sets: SetController;
  /** Batches: import, sidebar, memory, persistence and "Export all". */
  readonly batch: BatchController;
  /** Multi-screen designs: layouts, and filling, swapping and emptying screens. */
  readonly screens: ScreensController;
  private motionAbort: AbortController | null = null;
  private tickRaf = 0;
  /** Each mode's design while another mode is shown. */
  private stash: Partial<
    Record<
      Mode,
      {
        doc: EditorDoc;
        hasContent: boolean;
        designId: string | null;
        history?: EditorHistory<EditorDoc>;
      }
    >
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
  disposed = false;
  /** File name of the screenshot on stage (it names the image when a batch starts). */
  sourceName = "";
  /** Document changes caused by switching modes or designs (not batch edits). */
  private docSync = 0;
  private lastDoc: EditorDoc | null = null;
  /** The single design a batch grew from (undoing back to it restores its recent). */
  private preBatch: { scene: Scene; designId: string | null; created: number } | null = null;
  private listeners = new Map<string, Set<(arg?: unknown) => void>>();
  private builtinLoads = new Map<string, Promise<void>>();
  private lastFrameKey: string | null = null;
  /** Recordings too big to store: designs using them aren't autosaved. */
  private readonly unstored = new Set<string>();
  private initDone = false;

  constructor() {
    this.store = createEditorStore<EditorDoc>(initialScene(), {
      lens: batchLens(() => this.batch?.editScope() ?? "all"),
    });
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
      exportSettings: defaultExportSettings(),
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
    this.sets = new SetController(this);
    this.batch = new BatchController(this);
    this.screens = new ScreensController(this);
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
    // A hover preview is built from the scene at hover time; any edit ends it.
    this.store.subscribe(() => {
      if (this.preview.get().scene) this.clearPreview(true);
    });
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
    await this.restoreBatch();
    if (this.disposed) return;

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
    this.video.detach();
    this.motionAbort?.abort();
    this.exporter.dispose();
    this.batch.dispose();
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
    // A batch never replaces an image: a pasted, dropped or opened file joins it.
    if (this.ui.get().mode === "screenshot" && isBatch(this.store.getState().doc)) {
      const file =
        blob instanceof File
          ? blob
          : new File(
              [blob],
              `Pasted image.${(blob.type.split("/")[1] ?? "png").replace("jpeg", "jpg")}`,
              {
                type: blob.type,
              },
            );
      return (await this.batch.add([{ file, path: file.name }], opts)) > 0;
    }
    if (await isVideoBlob(blob)) return this.loadVideo(blob, opts);
    if (blob.type && !/^image\//.test(blob.type) && blob.type !== "application/octet-stream") {
      this.toast({
        kind: "error",
        title: "Couldn't read that file",
        detail: "Shotcandy opens PNG, JPEG or WebP screenshots and MP4, MOV or WebM recordings.",
        prose: true,
      });
      return false;
    }
    // In App Store mode a pasted or dropped screenshot fills the selected slide.
    if (this.ui.get().mode === "appstore") {
      await this.sets.setSlideImage(this.sets.selected, blob);
      return true;
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
    const wasRecording = isVideoScene(this.scene);
    this.store.update((s) => {
      // A recording's "no motion" timeline doesn't carry over to a screenshot.
      const { animation, ...rest } = s;
      const base: Scene =
        animation?.preset === STILL_MOTION_ID ? (rest as Scene) : ({ ...rest, animation } as Scene);
      let next: Scene = withAutoCaption(
        { ...base, content: { kind: "image", assetId: img.id } },
        { width: img.width, height: img.height },
      );
      if (first && !this.userPickedStyle) {
        const id = portrait ? "phone-sorbet" : DEFAULT_STYLE_ID;
        const p = getStylePreset(id);
        if (p) next = applyStylePatch(next, p.patch, id);
      }
      return next;
    });
    if (wasRecording) {
      this.stopPreview();
      if (!this.scene.animation) this.setExportSettings({ kind: "image" });
    }
    // A new screenshot starts a new recent design.
    this.designId = newId("d");
    this.designCreated = Date.now();
    this.sourceName = blob instanceof File ? blob.name : "";
    if (this.sourceName) this.screens.names.set(img.id, this.sourceName);
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

  /** Open a screen recording: it lands styled, with a timeline, ready to export as video. */
  async loadVideo(blob: Blob, opts: { source?: string } = {}): Promise<boolean> {
    if (this.ui.get().mode === "appstore") {
      this.toast({
        kind: "info",
        title: "App Store slides take screenshots",
        detail: "Switch to Screenshot to style a screen recording.",
        prose: true,
      });
      return false;
    }
    const m = this.ui.get().mode;
    if (m === "code" || m === "post") this.setMode("screenshot");
    this.ui.set({ importing: true });
    let img: ImportedImage;
    try {
      img = await importVideo(blob);
    } catch (e) {
      this.ui.set({ importing: false });
      const msg = importMessage(e);
      this.toast({
        kind: "error",
        title: msg.title,
        detail: msg.detail,
        prose: true,
        duration: 8000,
      });
      return false;
    }
    if (this.disposed || !img.video) return false;
    this.stopPreview();
    this.library.add(img);
    void this.thumbs?.setAsset(img.id, img.proxy, img.width, img.height, img.palette);
    const info = img.video.info;
    const first = !this.ui.get().hasContent;
    const portrait = img.height / img.width >= 1.6;
    const clip = createClip(info.duration, !!info.audioCodec);
    this.store.update((s) => {
      let next: Scene = withAutoCaption(
        { ...s, content: { kind: "image", assetId: img.id, clip } },
        { width: img.width, height: img.height },
      );
      if (first && !this.userPickedStyle) {
        const id = portrait ? "phone-sorbet" : DEFAULT_STYLE_ID;
        const p = getStylePreset(id);
        if (p) next = applyStylePatch(next, p.patch, id);
      }
      // Recordings always have a timeline; keep a motion the design already has.
      const prev = next.animation;
      const keep = prev && getMotionPreset(prev.preset) ? prev.preset : STILL_MOTION_ID;
      const animation = createAnimation(keep, prev);
      animation.fps = info.fps && info.fps > 45 ? 60 : 30;
      return { ...next, animation };
    });
    this.setExportSettings({ kind: "motion" });
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
    this.syncVideo();
    const storable = img.blob.size <= MAX_STORED_VIDEO_BYTES;
    if (!storable) {
      this.unstored.add(img.id);
      this.toast({
        kind: "info",
        title: "This recording won't be kept in Recent designs",
        detail: `Recordings over ${MAX_STORED_VIDEO_BYTES / 1024 / 1024} MB are too big to store in the browser. Export your video before you close the tab.`,
        prose: true,
        duration: 7000,
      });
    }
    if (this.db && storable) {
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
    this.emit("loaded", opts.source ?? "unknown");
    this.announce(
      `Recording added (${img.width} × ${img.height}, ${formatClipTime(info.duration)}). Press M to play it.`,
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
    } else if (text.trim() && this.ui.get().mode !== "code") {
      this.toast({
        kind: "info",
        title: "That’s text",
        detail: "Copy an image or take a screenshot, then paste it here.",
        prose: true,
        ...(this.ui.get().hasContent
          ? {}
          : {
              action: {
                label: "Make it a code image",
                run: () => {
                  this.setMode("code");
                  this.setCode({ code: text, language: "auto", highlight: [] });
                },
              },
            }),
      });
    }
  }

  /** Put an imported image into the library, thumbnails and storage. */
  adoptImportedAsset(img: ImportedImage): void {
    this.library.add(img);
    void this.thumbs?.setAsset(img.id, img.proxy, img.width, img.height, img.palette);
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
  }

  /** Load a previously stored asset into the library (restoring saved designs). */
  async loadStoredAsset(id: string): Promise<boolean> {
    if (this.library.has(id)) return true;
    const rec = await this.db?.assets.get(id).catch(() => undefined);
    if (!rec) return false;
    try {
      const img = await importMedia(rec.blob);
      this.library.add(img);
      void this.thumbs?.setAsset(img.id, img.proxy, img.width, img.height, img.palette);
      this.bumpAssets();
      return true;
    } catch {
      return false;
    }
  }

  importFailed(e: unknown): void {
    const m = importMessage(e);
    this.toast({ kind: "error", title: m.title, detail: m.detail, prose: true, duration: 6000 });
  }

  // ------------------------------------------------------------------- batch
  /**
   * Files from a drop, a paste or a picker. One file with nothing else going
   * on opens exactly as it always has (replacing the image); several files, a
   * folder or "Add images…" add them, turning the design into a batch.
   */
  async importFiles(
    files: readonly (File | PickedFile)[],
    opts: { source?: string; folder?: boolean; add?: boolean; note?: string } = {},
  ): Promise<void> {
    const picked: PickedFile[] = files.map((f) =>
      f instanceof File ? { file: f, path: f.name } : f,
    );
    if (!picked.length) return;
    const mode = this.ui.get().mode;
    if (mode === "appstore") {
      if (picked.length === 1) {
        await this.loadBlob(picked[0]!.file, opts);
        return;
      }
      const images = picked.filter((p) => fileKind(p.file) === "image");
      const sorted = images
        .map((p) => ({ ...p, name: p.file.name }))
        .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
      if (sorted.length)
        await this.sets.setSlideImages(
          this.sets.selected,
          sorted.map((p) => p.file),
        );
      return;
    }
    const doc = this.store.getState().doc;
    const route = planImport(
      picked,
      { batch: isBatch(doc) ? doc.items.length : 0, single: hasImage(docScene(doc)), max: 1 },
      opts,
    ).route;
    if (route === "single") {
      await this.loadBlob(picked[0]!.file, opts);
      return;
    }
    if (mode === "code" || mode === "post") this.setMode("screenshot");
    await this.batch.add(picked, opts);
  }

  /** The first image of an empty editor gets the default style (like a first paste). */
  prepareFirstImage(s: Scene, size: { width: number; height: number }): Scene {
    const { animation, ...rest } = s;
    let next: Scene =
      animation?.preset === STILL_MOTION_ID ? (rest as Scene) : ({ ...rest, animation } as Scene);
    next = withAutoCaption(next, size);
    if (!this.userPickedStyle) {
      const id = size.height / size.width >= 1.6 ? "phone-sorbet" : DEFAULT_STYLE_ID;
      const p = getStylePreset(id);
      if (p) next = applyStylePatch(next, p.patch, id);
    }
    return next;
  }

  /** The caption a tall canvas gives a landscape screenshot, if it would get one. */
  captionFor(s: Scene, size: { width: number; height: number }): CaptionSpec | undefined {
    const next = withAutoCaption(s, size);
    return next === s ? undefined : next.caption;
  }

  /** An image landed on an empty editor (through a batch import). */
  markLoaded(first: boolean, source: string): void {
    if (isVideoScene(this.scene)) this.stopPreview();
    if (this.ui.get().exportSettings.kind === "motion" && !this.scene.animation)
      this.setExportSettings({ kind: "image" });
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
    this.emit("loaded", source);
  }

  bumpAssetsVersion(): void {
    this.bumpAssets();
  }

  /** A batch import ended on a single design: save it to Recent designs as usual. */
  afterImport(): void {
    if (!isBatch(this.store.getState().doc)) this.onSceneChange();
  }

  /** Another image came on stage: fit it, cross-fade, leave any hover preview. */
  onBatchSelect(): void {
    this.clearPreview(true);
    this.ui.set((s) => ({
      zoom: null,
      pan: { x: 0, y: 0 },
      xfade: s.xfade + 1,
      editingText: null,
    }));
  }

  /** A small poster of the image on stage (export toasts). */
  batchPoster(): Promise<string | undefined> {
    return this.posterUrl(this.scene);
  }

  /** Bring back the batch saved before a reload. */
  private async restoreBatch(): Promise<void> {
    let doc: EditorDoc | null = null;
    try {
      doc = await this.batch.restore();
    } catch {
      doc = null;
    }
    if (!doc || this.disposed) return;
    const cur = this.store.getState().doc;
    // Something was opened meanwhile: keep it (the batch stays saved).
    if (isBatch(cur) || hasImage(docScene(cur))) return;
    if (this.ui.get().mode === "screenshot") {
      this.setDoc(doc);
      this.designId = isBatch(doc) ? null : newId("d");
      this.designCreated = Date.now();
      this.ui.set((s) => ({
        hasContent: true,
        landing: s.landing + 1,
        zoom: null,
        pan: { x: 0, y: 0 },
      }));
      this.bumpAssets();
      this.batch.scheduleMemory();
    } else {
      this.stash.screenshot = {
        doc,
        hasContent: true,
        designId: isBatch(doc) ? null : newId("d"),
      };
    }
    this.emit("batch-restored", isBatch(doc) ? doc.items.length : 1);
  }

  /** Replace the document without an undo step (mode switches, loading designs). */
  private setDoc(doc: EditorDoc, history?: EditorHistory<EditorDoc>): void {
    this.docSync++;
    try {
      this.store.reset(doc, history);
    } finally {
      this.docSync--;
    }
  }

  /**
   * Open another design in place of the current one. Over a batch it is one
   * undo step (so the batch is never lost); otherwise history starts afresh.
   */
  private replaceDoc(doc: EditorDoc, label: string): boolean {
    const cur = this.store.getState().doc;
    if (isBatch(cur) && this.ui.get().mode === "screenshot") {
      this.store.updateDoc(() => doc, { label });
      return true;
    }
    this.setDoc(doc);
    return false;
  }

  /** Keep UI state in step when the document turns into a batch or back into one design. */
  private onDocChange(): void {
    const doc = this.store.getState().doc;
    const prev = this.lastDoc;
    this.lastDoc = doc;
    if (prev === doc) return;
    const was = isBatch(prev);
    const now = isBatch(doc);
    if (now) this.batch.scheduleMemory();
    if (was === now || this.docSync || this.ui.get().mode !== "screenshot") return;
    if (now) {
      if (prev && !isBatch(prev) && hasImage(prev))
        this.preBatch = { scene: prev, designId: this.designId, created: this.designCreated };
      if (!this.ui.get().hasContent) this.ui.set({ hasContent: true });
      return;
    }
    // Back to one design (the last image removed, or undone to before the batch).
    const scene = doc as Scene;
    this.batch.clearSaved();
    this.batch.ui.set({ scope: "all", selecting: false });
    const has = hasImage(scene);
    if (this.preBatch && this.preBatch.scene === scene) {
      this.designId = this.preBatch.designId;
      this.designCreated = this.preBatch.created;
    } else {
      this.designId = has ? newId("d") : null;
      this.designCreated = Date.now();
    }
    this.ui.set((s) => ({ hasContent: has, zoom: null, pan: { x: 0, y: 0 }, xfade: s.xfade + 1 }));
  }

  downloadFile(blob: Blob, name: string): void {
    downloadBlob(blob, name);
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
    this.clearPreview(true);
    this.store.update((s) => applyStylePatch(s, patch, id), {
      ...(opts.history === false ? { transient: true } : {}),
    });
    if (this.ui.get().hasContent) this.ui.set((s) => ({ xfade: s.xfade + 1 }));
  }

  /** Styles in gallery order: the ones that suit the screenshot's shape first, the rest after. */
  orderedStyles(): StylePreset[] {
    const suited = suitedStyles(orientationOf(this.contentSize()));
    const ids = new Set(suited.map((p) => p.id));
    return [...suited, ...STYLE_PRESETS.filter((p) => !ids.has(p.id))];
  }

  stepStyle(dir: 1 | -1): void {
    const list = this.orderedStyles();
    const cur = list.findIndex((p) => p.id === this.scene.meta.stylePresetId);
    const next = list[(cur + dir + list.length) % list.length]!;
    this.applyStyle(next.id);
    this.announce(`Style: ${next.name}`);
  }

  surprise(): void {
    const cur = this.scene.meta.stylePresetId;
    const pool = suitedStyles(orientationOf(this.contentSize())).filter((p) => p.id !== cur);
    const pick = pool[Math.floor(Math.random() * pool.length)]!;
    this.applyStyle(pick.id);
    this.announce(`Style: ${pick.name}`);
  }

  private shuffleSeed = 0;

  /**
   * Candy Shuffle: re-roll the whole composition (style, background, tilt or
   * bleed, frame, shadow) from curated rules. One undo step.
   */
  shuffle(): void {
    if (this.ui.get().mode !== "screenshot") return this.surprise();
    this.clearPreview(true);
    const c = this.scene.content;
    const palette =
      c.kind === "image" && c.assetId ? (this.library.get(c.assetId)?.palette ?? null) : null;
    this.shuffleSeed = (this.shuffleSeed + 1 + Math.floor(Math.random() * 1e6)) >>> 0;
    const r = shuffleComposition(this.scene, {
      seed: this.shuffleSeed,
      size: this.contentSize(),
      palette,
      current: this.scene.meta.stylePresetId,
      isImage: c.kind === "image",
    });
    this.userPickedStyle = true;
    // Rolls keep the canvas size: an auto canvas is held at its current pixels
    // so every roll exports at the same size (REVIEW r2 N21).
    let next = r.scene;
    // (Not in a batch: its images differ in size, and each keeps its own.)
    if (this.scene.canvas.size.kind === "auto" && !isBatch(this.store.getState().doc)) {
      const cur = layoutScene(this.scene, this.resolver).canvas;
      next = {
        ...next,
        canvas: { ...next.canvas, size: { kind: "fixed", width: cur.width, height: cur.height } },
      };
    }
    this.store.update(() => next);
    if (this.ui.get().hasContent) this.ui.set((s) => ({ xfade: s.xfade + 1 }));
    this.emit("shuffled", r.summary);
    this.announce(`Shuffled: ${r.summary}`);
    if (this.ui.get().hasContent)
      this.toast({
        kind: "undo",
        title: "Shuffled",
        detail: r.summary,
        prose: true,
        action: { label: "Undo", run: () => this.store.undo() },
      });
  }

  // ----------------------------------------------------------------- preview
  /** Show a scene on the stage without committing it (hover to preview). */
  previewScene(make: (s: Scene) => Scene, label: string): void {
    if (this.previewTimer) clearTimeout(this.previewTimer);
    if (!this.ui.get().hasContent || this.playback.get().playing) return;
    this.previewTimer = setTimeout(() => {
      this.previewTimer = null;
      const next = make(this.scene);
      this.ensureBuiltins(next);
      this.preview.set({ scene: next, label });
    }, 90);
  }

  /** Back to the real scene (after a short grace so moving between tiles doesn't flash). */
  clearPreview(now = false): void {
    if (this.previewTimer) clearTimeout(this.previewTimer);
    this.previewTimer = null;
    if (!this.preview.get().scene) return;
    if (now) {
      this.preview.set({ scene: null, label: null });
      return;
    }
    this.previewTimer = setTimeout(() => {
      this.previewTimer = null;
      this.preview.set({ scene: null, label: null });
    }, 60);
  }

  /** Preview a style from its tile. */
  previewStyle(id: string): void {
    const builtin = getStylePreset(id);
    const custom = this.ui.get().customPresets.find((p) => p.id === id);
    const patch = builtin?.patch ?? custom?.patch;
    if (!patch || id === this.scene.meta.stylePresetId) return this.clearPreview();
    this.previewScene((s) => applyStylePatch(s, patch, id), builtin?.name ?? custom?.name ?? id);
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
    if (isBatch(this.store.getState().doc)) {
      const scope = this.batch.editScope();
      this.store.updateDoc((d) => {
        if (!isBatch(d)) return d;
        const prev = docScene(d);
        const routed = routeEdit(d, setIn(prev, ["canvas", "size"], size), prev, scope);
        // Images whose canvas changed get the tall-canvas caption, like a single design.
        return mapItems(routed, (item, scene) => {
          const before = d.items.find((x) => x.id === item.id);
          if (!before || item.caption) return item;
          if (
            JSON.stringify(itemScene(d, before).canvas.size) === JSON.stringify(scene.canvas.size)
          )
            return item;
          const cap = this.captionFor(scene, this.contentSizeOf(scene) ?? { width: 1, height: 1 });
          return cap ? { ...item, caption: cap } : item;
        });
      });
      this.ui.set({ zoom: null, pan: { x: 0, y: 0 } });
      return;
    }
    this.store.update((s) =>
      withAutoCaption(setIn(s, ["canvas", "size"], size), this.contentSizeOf(s)),
    );
    this.ui.set({ zoom: null, pan: { x: 0, y: 0 } });
  }

  private contentSizeOf(s: Scene): { width: number; height: number } | null {
    const c = s.content;
    if (c.kind !== "image" || !c.assetId) return null;
    const a = this.library.get(c.assetId);
    return a ? { width: a.width, height: a.height } : null;
  }

  /** Edit the caption card (creating it from the defaults when needed). */
  setCaption(patch: Partial<CaptionSpec>, coalesce?: string): void {
    this.store.update((s) => ({ ...s, caption: { ...DEFAULT_CAPTION, ...s.caption, ...patch } }), {
      coalesce: coalesce ?? `caption:${Object.keys(patch).join(",")}`,
    });
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
    this.stash[ui.mode] = {
      doc: this.store.getState().doc,
      hasContent: ui.hasContent,
      designId: this.designId,
      history: this.store.history(),
    };
    const next = this.stash[mode];
    let doc: EditorDoc;
    let has: boolean;
    if (next) {
      doc = next.doc;
      has = next.hasContent;
      this.designId = next.designId;
    } else {
      doc = this.freshScene(mode);
      has = mode !== "screenshot";
      this.designId = has ? newId("d") : null;
      this.designCreated = Date.now();
    }
    const scene = docScene(doc);
    // Each mode keeps its own undo history across switches.
    this.setDoc(doc, next?.history);
    this.store.select(null);
    const firstTab: Record<Mode, MobileTab> = {
      screenshot: "styles",
      code: "code",
      post: "post",
      appstore: "slides",
    };
    this.ui.set((s) => ({
      mode,
      mobileTab: firstTab[mode],
      mobileExport: false,
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
    if (mode === "appstore") {
      this.sets.syncTemplateContent();
      if (!next)
        void this.sets.restore().then((tpl) => {
          if (tpl && this.ui.get().mode === "appstore") this.setDoc(tpl);
          this.sets.syncTemplateContent();
        });
    }
    this.announce(
      `${mode === "appstore" ? "App Store set" : mode[0]!.toUpperCase() + mode.slice(1)} mode`,
    );
  }

  protected freshScene(mode: Mode): Scene {
    if (mode === "code") return initialCodeScene();
    if (mode === "post") return initialPostScene();
    if (mode === "appstore") return createSetTemplate();
    return initialScene();
  }

  /** Put a loaded design (recent or project) into the mode its content belongs to. */
  private adoptMode(scene: Scene): void {
    const mode = modeForScene(scene);
    const ui = this.ui.get();
    if (ui.mode !== mode) {
      this.stash[ui.mode] = {
        doc: this.store.getState().doc,
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

  /**
   * Assets for drawing the stage right now: for a screen recording, the
   * library with the recording's current preview frame in place of its poster.
   */
  frameAssets(): AssetResolver {
    const c = this.scene.content;
    if (c.kind !== "image" || !c.clip || !c.assetId || this.video.current !== c.assetId)
      return this.resolver;
    const f = this.video.frame();
    if (!f) return this.resolver;
    // Live frames are shown once: drop the previous frame's cached canvases.
    if (this.lastFrameKey && this.lastFrameKey !== f.key)
      this.cache.invalidate(`${c.assetId}@${this.lastFrameKey}:`);
    this.lastFrameKey = f.key;
    return withVideoFrame(this.resolver, c.assetId, f, f.key);
  }

  /** Length of the timeline: the trimmed recording, or one motion loop. */
  timelineLength(): number {
    return timelineDuration(this.scene);
  }

  /** Keep the preview player on the current recording and playhead. */
  private syncVideo(): void {
    const c = this.scene.content;
    const entry = c.kind === "image" && c.clip && c.assetId ? this.library.entry(c.assetId) : null;
    if (!entry?.video || c.kind !== "image" || !c.clip) {
      if (this.video.current) this.video.detach();
      return;
    }
    if (this.video.current !== entry.id) {
      this.video.attach(entry.id, entry.blob, entry.width, entry.height);
      // A recording exports as video by default (a still is one click away).
      if (this.ui.get().exportSettings.kind !== "motion")
        this.setExportSettings({ kind: "motion" });
    }
    const p = this.playback.get();
    if (p.playing) {
      // A new recording, an undone trim or a stalled element: resume in range.
      const at = sourceTime(c.clip, p.t ?? 0);
      const inRange = this.video.time >= c.clip.start - 0.05 && this.video.time <= c.clip.end;
      if (this.video.paused || !inRange) this.video.play(at, c.clip.muted);
      else this.video.setMuted(c.clip.muted);
    } else this.video.seek(sourceTime(c.clip, p.t ?? this.restTime()));
  }

  /** Trim the recording or turn its sound off (one undo step per drag). */
  updateClip(patch: Partial<Pick<VideoClip, "start" | "end" | "muted">>, coalesce?: string): void {
    const clip = sceneClip(this.scene);
    if (!clip) return;
    const next = trimClip({ ...clip, muted: patch.muted ?? clip.muted }, patch);
    this.store.update(
      (s) =>
        s.content.kind === "image" && s.content.clip
          ? { ...s, content: { ...s.content, clip: next } }
          : s,
      { coalesce: coalesce ?? `clip:${Object.keys(patch).join(",")}` },
    );
    if (patch.start !== undefined) this.seek(0);
    else if (patch.end !== undefined) this.seek(clipLength(next));
    if (patch.muted !== undefined) this.announce(patch.muted ? "Sound off" : "Sound on");
  }

  /** Where the playhead rests when paused: the end pose, or phase 0 for loops. */
  restTime(spec: AnimationSpec | undefined = this.scene.animation): number {
    if (!spec) return 0;
    const p = getMotionPreset(spec.preset);
    if (!p || p.periodic) return 0;
    // A recording rests on its first frame, where a motion hasn't started.
    if (isVideoScene(this.scene)) return 0;
    if (spec.loop === "boomerang") return spec.duration * 0.5;
    return spec.duration * ((p.onceWindow?.[1] ?? 0.72) + 1) * 0.5;
  }

  /** Pick a motion preset (null turns motion off). */
  setMotion(id: string | null): void {
    const prev = this.scene.animation;
    // A recording always keeps its timeline: "no motion" holds the card still.
    if (!id && isVideoScene(this.scene)) {
      this.store.update((s) => ({ ...s, animation: createAnimation(STILL_MOTION_ID, prev) }));
      this.announce("Motion off");
      return;
    }
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
    if (prefersReducedMotion()) this.stopPreview();
    else this.play(0);
  }

  updateMotion(patch: Partial<AnimationSpec>, coalesce?: string): void {
    if (!this.scene.animation) return;
    this.store.update(
      (s) => (s.animation ? { ...s, animation: { ...s.animation, ...patch } } : s),
      { coalesce: coalesce ?? `motion:${Object.keys(patch).join(",")}` },
    );
    const t = this.playback.get().t;
    const d = this.timelineLength();
    if (t !== null && t > d) this.playback.set({ t: t % d });
  }

  play(from?: number): void {
    if (!this.scene.animation) return;
    const cur = this.playback.get().t;
    const d = this.timelineLength();
    const t = from ?? (cur === null || cur >= d - 1e-3 ? 0 : cur);
    this.playback.set({ playing: true, t });
    const clip = sceneClip(this.scene);
    if (clip) this.video.play(sourceTime(clip, t), clip.muted);
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
    const clip = sceneClip(this.scene);
    if (clip && this.video.current && !this.video.failed) {
      // Follow the recording's own clock, so picture and sound stay in sync.
      const len = clipLength(clip);
      const t = this.video.time - clip.start;
      if (this.video.ended || t >= len - 0.5 / spec.fps) {
        this.video.play(clip.start, clip.muted);
        this.playback.set({ t: 0 });
      } else {
        this.playback.set({ t: Math.max(0, t) });
      }
    } else {
      this.playback.set({ t: ((p.t ?? 0) + dt) % timelineDuration(this.scene) });
    }
    this.tickRaf = requestAnimationFrame(this.tick);
  };

  pause(): void {
    if (this.playback.get().playing) this.playback.set({ playing: false });
    this.video.pause();
  }

  togglePlay(): void {
    if (this.playback.get().playing) this.pause();
    else this.play();
  }

  seek(t: number): void {
    const d = this.scene.animation ? this.timelineLength() : 0;
    const at = Math.max(0, Math.min(d, t));
    this.playback.set({ playing: false, t: at });
    const clip = sceneClip(this.scene);
    if (clip) this.video.seek(sourceTime(clip, at));
  }

  /** Back to the still design (so annotations can be edited in place). */
  stopPreview(): void {
    const p = this.playback.get();
    if (p.playing || p.t !== null) this.playback.set({ playing: false, t: null });
    const clip = sceneClip(this.scene);
    if (clip) this.video.seek(sourceTime(clip, this.restTime()));
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
    this.motionEstimateAbort?.abort();
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
        style:
          scene.animation.preset === STILL_MOTION_ID
            ? (scene.meta.stylePresetId ?? "recording")
            : scene.animation.preset,
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
        detail: `${r.duration.toFixed(1)} s · ${r.width} × ${r.height} · ${r.fps} fps · ${formatBytes(r.blob.size)}${r.warnings?.length ? `. ${r.warnings.join(" ")}` : ""}`,
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

  private motionEstimate: { key: string; scene: Scene; result: Promise<number> } | null = null;
  private motionEstimateAbort: AbortController | null = null;

  /**
   * Expected size of the motion export: a small sample of the same clip is
   * encoded for real (200 px GIF, 480p video) and scaled up with a
   * calibrated model. Cached per scene and settings.
   */
  estimateMotion(
    settings: MotionExportSettings = this.ui.get().exportSettings.motion,
  ): Promise<number> {
    const scene = this.scene;
    const key = JSON.stringify(settings);
    const c = this.motionEstimate;
    if (c && c.scene === scene && c.key === key) return c.result;
    this.motionEstimateAbort?.abort();
    const ac = new AbortController();
    this.motionEstimateAbort = ac;
    const plan = this.motionPlan(settings);
    if (!plan || !scene.animation) return Promise.reject(new Error("No motion"));
    if (isVideoScene(scene)) {
      // A sample encode would render the whole recording; the model is instant.
      const [lo, hi] = roughAnimationBytes(plan, {
        format: settings.format,
        quality: settings.quality,
        preset: "recording",
        gifColors: settings.gifColors,
        dither: settings.dither,
      });
      const clip = sceneClip(scene)!;
      const sound =
        clip.audio && !clip.muted && settings.format !== "gif" ? (160_000 * plan.duration) / 8 : 0;
      const result = Promise.resolve(Math.round((lo + hi) / 2 + sound));
      this.motionEstimate = { key, scene, result };
      return result;
    }
    const gif = settings.format === "gif";
    const long = Math.max(plan.width, plan.height);
    const short = Math.min(plan.width, plan.height);
    const k = gif ? Math.min(1, 200 / long) : Math.min(1, 480 / short);
    const opts = {
      format: settings.format,
      scale: plan.scale * k,
      quality: settings.quality,
      ...(gif
        ? { fps: settings.gifFps, gifColors: settings.gifColors, dither: settings.dither }
        : {}),
    };
    const result = this.animator
      .export(scene, this.exportAssets(scene), opts, { signal: ac.signal })
      .then((r) => {
        if (k >= 1) return r.blob.size;
        const samplePlan = {
          width: r.width,
          height: r.height,
          fps: r.fps,
          frames: r.frames,
          duration: r.duration,
        };
        return gif
          ? extrapolateGifBytes(r.blob.size, samplePlan, plan)
          : extrapolateVideoBytes(r.blob.size, samplePlan, plan, settings.quality);
      });
    const entry = { key, scene, result };
    this.motionEstimate = entry;
    result.catch(() => {
      if (this.motionEstimate === entry) this.motionEstimate = null;
    });
    return result;
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
    return Math.max(1, maxExportScale(layoutScene(this.exportTarget(), this.resolver)));
  }

  /** Inputs for export planning (canvas size, how the screenshot is drawn, limits). */
  planInput(scene: Scene = this.exportTarget()) {
    const layout = layoutScene(scene, this.resolver);
    return {
      width: layout.canvas.width,
      height: layout.canvas.height,
      drawRatio: drawRatio(layout, scene.content.kind === "image"),
      fixed: scene.canvas.size.kind === "fixed",
      maxScale: Math.max(1, maxExportScale(layout)),
    };
  }

  /** What an export with these settings produces (Copy caps the long side unless asked not to). */
  exportPlan(
    settings: ExportSettings = this.ui.get().exportSettings,
    opts: { copy?: boolean } = {},
    scene: Scene = this.exportTarget(),
  ): ExportPlan {
    const plan = planExport(this.planInput(scene), {
      scale: settings.scale,
      format: opts.copy ? "png" : settings.format,
      quality: settings.quality,
      destination: settings.destination,
      ...(opts.copy && !settings.copyFull ? { maxLong: COPY_MAX_LONG } : {}),
    });
    return opts.copy ? { ...plan, format: "png" } : plan;
  }

  filenameFor(
    r: { width: number; height: number },
    settings: ExportSettings,
    scale?: number,
  ): string {
    const s = this.exportTarget();
    const size = s.canvas.size;
    const sc = scale ?? this.exportPlan(settings).scale;
    const whole = Math.abs(sc - Math.round(sc)) < 0.01;
    // "@0.32x" says nothing useful: destination sizes drop the scale suffix.
    const pattern = whole ? settings.pattern : settings.pattern.replace(/@\{scale\}x/g, "");
    return formatFilename(pattern, {
      name: s.meta.name,
      style: s.meta.stylePresetId ?? "custom",
      preset: size.kind === "auto" ? "auto" : (size.presetId ?? "custom"),
      width: r.width,
      height: r.height,
      scale: whole ? Math.round(sc) : Math.round(sc * 100) / 100,
      format: settings.format,
      now: new Date(),
    });
  }

  /** The scene Copy and Export use (the selected slide in App Store mode). */
  exportTarget(): Scene {
    return this.ui.get().mode === "appstore"
      ? this.sets.slideScene(this.sets.selected)
      : this.scene;
  }

  runExport(
    format: ExportFormat,
    scale: number,
    quality?: number,
    scene: Scene = this.exportTarget(),
  ): Promise<ExportResult> {
    // A recording's still is its frame at the trim start, at full size.
    const clip = sceneClip(scene);
    const assets = this.exportAssets(scene).map((a) =>
      clip && a.poster ? { ...a, stillAt: clip.start } : a,
    );
    return this.exporter.export(scene, assets, {
      format,
      scale,
      ...(quality !== undefined ? { quality } : {}),
    });
  }

  /**
   * Export a plan; when the destination has a size limit, retry (JPEG, then
   * lower quality, then fewer pixels) until the file fits.
   */
  async runPlan(
    plan: ExportPlan,
    settings: ExportSettings = this.ui.get().exportSettings,
    opts: { pngOnly?: boolean } = {},
    scene: Scene = this.exportTarget(),
  ): Promise<ExportResult & { fitted: boolean }> {
    const dest = getDestination(settings.destination);
    let attempt = { format: plan.format, quality: plan.quality, scale: plan.scale };
    let r = await this.runExport(attempt.format, attempt.scale, attempt.quality, scene);
    let fitted = false;
    const limit = dest.limitBytes;
    for (let i = 0; limit && r.blob.size > limit && i < 5; i++) {
      attempt = nextAttempt(attempt, r.blob.size, limit, dest.format === "auto" && !opts.pngOnly);
      r = await this.runExport(attempt.format, attempt.scale, attempt.quality, scene);
      fitted = true;
    }
    return { ...r, fitted };
  }

  private previewCache: {
    scene: Scene;
    key: string;
    result: Promise<ExportResult & { fitted: boolean }>;
  } | null = null;

  /**
   * The exact file an export with these settings saves: encoded for real (in
   * the worker) and cached, so the popover shows its true size and format and
   * Download hands over the very same file without encoding again.
   */
  previewExport(
    settings: ExportSettings = this.ui.get().exportSettings,
  ): Promise<ExportResult & { fitted: boolean }> {
    const scene = this.exportTarget();
    const plan = this.exportPlan(settings);
    const key = JSON.stringify([plan, settings.destination]);
    const c = this.previewCache;
    if (c && c.scene === scene && c.key === key) return c.result;
    const result = this.runPlan(plan, settings);
    const entry = { scene, key, result };
    this.previewCache = entry;
    result.catch(() => {
      if (this.previewCache === entry) this.previewCache = null;
    });
    return result;
  }

  setExportSettings(patch: Partial<ExportSettings>): void {
    const next = { ...this.ui.get().exportSettings, ...patch };
    this.ui.set({ exportSettings: next });
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...next, v: SETTINGS_VERSION }));
    } catch {
      /* ignore */
    }
  }

  /** Nothing to export yet: say so instead of doing nothing. */
  nothingYet(what: "copy" | "export"): void {
    const mod = /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent) ? "⌘" : "Ctrl+";
    this.toast({
      kind: "info",
      title: "Paste a screenshot first",
      detail: `Press ${mod}V, drop an image or choose a file, then ${what} it.`,
      prose: true,
    });
  }

  /** Copy PNG to the clipboard. Call synchronously from the user gesture. */
  copy(anchor?: Element | null, opts: { full?: boolean } = {}): void {
    if (!this.ui.get().hasContent) return this.nothingYet("copy");
    if (this.ui.get().copyState === "busy") return;
    if (this.ui.get().mode === "appstore") return this.copySlide(anchor);
    if (this.postIsEmpty()) return this.emptyPost();
    const settings = {
      ...this.ui.get().exportSettings,
      ...(opts.full ? { copyFull: true } : {}),
    };
    const plan = this.exportPlan(settings, { copy: true });
    const job = this.runPlan(plan, settings, { pngOnly: true });
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
        const original = getDestination(settings.destination).id === "original";
        const capped = plan.capped && original;
        this.toast({
          kind: "wrap",
          title: "Copied to clipboard",
          detail: `${r.width} × ${r.height} PNG · ${formatBytes(r.blob.size)}${capped ? " · sized for pasting" : ""}`,
          thumb: await thumbUrl(r.blob),
          action: capped
            ? { label: "Copy full size", run: () => this.copy(null, { full: true }) }
            : { label: "Download", run: () => void this.downloadImage() },
        });
        this.announce(`Copied ${r.width} by ${r.height} PNG to the clipboard.`);
      },
      async () => {
        this.ui.set({ copyState: "idle" });
        try {
          const r = await job;
          downloadBlob(r.blob, this.filenameFor(r, { ...settings, format: "png" }, plan.scale));
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

  /** App Store mode: copy the selected slide at its exact size, without alpha. */
  private copySlide(anchor?: Element | null): void {
    const i = this.sets.selected;
    const job = this.sets.slideFile(i, "png");
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
        const size = setCanvasSize(this.sets.set);
        this.toast({
          kind: "wrap",
          title: `Copied slide ${i + 1}`,
          detail: `${size.width} × ${size.height} PNG · no alpha · ${formatBytes(r.blob.size)}`,
          thumb: await thumbUrl(r.blob),
        });
      },
      () => {
        this.ui.set({ copyState: "idle" });
        this.toast({
          kind: "error",
          title: "Your browser blocked clipboard access",
          detail: "Use Export ZIP instead.",
          prose: true,
        });
      },
    );
  }

  /** A post or testimonial with no text yet: nothing worth exporting. */
  postIsEmpty(): boolean {
    const c = this.exportTarget().content;
    return c.kind === "post" && !c.text.trim();
  }

  private emptyPost(): void {
    this.toast({
      kind: "info",
      title: "Write the post first",
      detail: "The card has no text yet. Type it in the Post panel.",
      prose: true,
    });
  }

  /** The Export button: the motion clip when motion export is chosen, else the image. */
  async download(anchor?: Element | null): Promise<void> {
    if (!this.ui.get().hasContent) return this.nothingYet("export");
    if (this.ui.get().mode === "appstore")
      return this.sets.exportZip(this.ui.get().exportSettings.format === "jpeg" ? "jpeg" : "png");
    if (this.ui.get().exportSettings.kind === "motion" && this.scene.animation)
      return this.exportMotion(anchor);
    if (this.ui.get().mode === "screenshot" && isBatch(this.store.getState().doc))
      return this.batch.exportAll(
        window.matchMedia?.("(max-width: 767px)").matches ? "share" : "zip",
      );
    return this.downloadImage(anchor);
  }

  /** Download a still image with the current export settings. */
  async downloadImage(anchor?: Element | null, override?: Partial<ExportSettings>): Promise<void> {
    if (!this.ui.get().hasContent || this.ui.get().exportBusy) return;
    if (this.postIsEmpty()) return this.emptyPost();
    const settings = { ...this.ui.get().exportSettings, ...override };
    this.ui.set({ exportBusy: true });
    try {
      const plan = this.exportPlan(settings);
      const r = await this.previewExport(settings);
      const actual = r.mime.includes("png")
        ? "png"
        : r.mime.includes("jpeg")
          ? "jpeg"
          : r.mime.includes("webp")
            ? "webp"
            : plan.format;
      const name = this.filenameFor(r, { ...settings, format: actual as ExportFormat }, plan.scale);
      downloadBlob(r.blob, name);
      sprinkle(anchor ?? null);
      const fallback = actual !== plan.format && !r.fitted;
      const dest = getDestination(settings.destination);
      const fit =
        dest.limitLabel && dest.limitBytes && r.blob.size <= dest.limitBytes
          ? r.fitted
            ? ` · saved as ${actual === "jpeg" ? "JPEG" : "a smaller PNG"} to fit ${dest.limitLabel}`
            : ` · fits ${dest.limitLabel}`
          : "";
      this.emit("downloaded", { ...r, name });
      this.toast({
        kind: "wrap",
        title: `Saved ${name}`,
        detail: `${r.width} × ${r.height} ${actual.toUpperCase()} · ${formatBytes(r.blob.size)}${fit}${fallback ? ` (${plan.format.toUpperCase()} isn't supported here)` : ""}`,
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
      if (this.ui.get().mode === "appstore") {
        await this.sets.saveSlide(this.sets.selected, settings.format === "jpeg" ? "jpeg" : "png");
        this.ui.set({ mobileExport: false });
        return;
      }
      if (this.postIsEmpty()) return this.emptyPost();
      const plan = this.exportPlan(settings);
      const r = await this.previewExport(settings);
      const actual: ExportFormat = r.mime.includes("jpeg")
        ? "jpeg"
        : r.mime.includes("webp")
          ? "webp"
          : "png";
      const name = this.filenameFor(r, { ...settings, format: actual }, plan.scale);
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
    const doc = this.store.getState().doc;
    if (isBatch(doc)) {
      // The whole batch: every image, the shared style and each one's own changes.
      await this.batch.ready();
      const file = await createProjectFile(
        scene,
        this.library
          .exportAssets(this.batch.assetIds())
          .filter((a) => !isBuiltinAssetId(a.id))
          .map((a) => ({ id: a.id, blob: a.blob, width: a.width, height: a.height })),
        { appVersion: APP_VERSION, now: new Date(), batch: doc },
      );
      const name = `shotcandy-${doc.items.length}-images.shotcandy`;
      downloadBlob(await projectToBlob(file), name);
      this.toast({
        kind: "info",
        title: "Project saved",
        detail: `${name} · ${doc.items.length} images`,
      });
      return;
    }
    if (this.exportAssets(scene).some((a) => a.blob.size > MAX_STORED_VIDEO_BYTES)) {
      this.toast({
        kind: "error",
        title: "This recording is too big for a project file",
        detail: `Project files hold recordings up to ${MAX_STORED_VIDEO_BYTES / 1024 / 1024} MB. Trim the recording first, or export the video.`,
        prose: true,
        duration: 7000,
      });
      return;
    }
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
      if (p.batch) {
        // Images decode in the worker: the one on stage fully, the rest as thumbnails.
        await this.batch.adoptBlobs(p.assets, p.batch);
        if (this.ui.get().mode !== "screenshot") this.setMode("screenshot");
        const undoable = this.replaceDoc(p.batch, "Open project");
        this.designId = null;
        this.ui.set((s) => ({
          hasContent: true,
          xfade: s.xfade + 1,
          zoom: null,
          pan: { x: 0, y: 0 },
          tool: "select",
        }));
        this.bumpAssets();
        this.batch.scheduleMemory();
        this.toast({
          kind: undoable ? "undo" : "info",
          title: "Project opened",
          detail: `${p.batch.items.length} images${p.issues.length ? `. With notes: ${p.issues.join("; ")}` : ""}`,
          prose: true,
          ...(undoable ? { action: { label: "Undo", run: () => this.store.undo() } } : {}),
        });
        return;
      }
      for (const a of p.assets) {
        const img = await importMedia(a.blob);
        this.library.add(img);
        void this.thumbs?.setAsset(img.id, img.proxy, img.width, img.height, img.palette);
      }
      this.adoptMode(p.scene);
      const undoable = this.replaceDoc(p.scene, "Open project");
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
        kind: undoable ? "undo" : "info",
        title: "Project opened",
        detail: p.issues.length ? `With notes: ${p.issues.join("; ")}` : "Everything restored.",
        prose: true,
        ...(undoable ? { action: { label: "Undo", run: () => this.store.undo() } } : {}),
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
    this.onDocChange();
    this.syncVideo();
    if (this.ui.get().mode === "appstore") {
      this.sets.scheduleSave();
      return;
    }
    if (isBatch(this.store.getState().doc)) {
      if (this.ui.get().mode === "screenshot") this.batch.scheduleSave();
      return;
    }
    if (this.batch.importing) return;
    if (!this.ui.get().hasContent || !this.db) return;
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = setTimeout(() => void this.autosave(), 900);
  }

  /** Save the current design into "Recent designs" (debounced after edits). */
  async autosave(): Promise<void> {
    if (!this.db || !this.ui.get().hasContent) return;
    // A batch is saved as one batch, never as a recent design per image.
    if (isBatch(this.store.getState().doc) || this.batch.importing) return;
    const scene = this.scene;
    if (sceneAssetIds(scene).some((id) => this.unstored.has(id))) return;
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
      if (extra.length) await this.db.assets.gc(await this.assetsInUse(kept.map((d) => d.scene)));
      this.emit("autosaved", rec.id);
    } catch {
      /* storage full or blocked: editing continues */
    }
  }

  /**
   * Every stored asset something still points at: the kept recents, the open
   * design, the saved App Store set (read from storage, since it may not be
   * loaded this session) and saved styles with an uploaded background.
   */
  private async assetsInUse(scenes: Scene[]): Promise<Set<string>> {
    const db = this.db!;
    const [appstore, presets, batch] = await Promise.all([
      db.settings.get(APPSTORE_SET_KEY).catch(() => undefined),
      db.presets.list().catch(() => []),
      db.settings.get<{ batch?: unknown }>(BATCH_KEY).catch(() => undefined),
    ]);
    const stashed = Object.values(this.stash).map((x) => x.doc);
    // Undo and redo can bring back any document in the histories (a batch the
    // user just collapsed, the image a paste replaced), so their images stay too.
    const { past, future } = this.store.history();
    const history = [
      ...past,
      ...future,
      ...Object.values(this.stash).flatMap((x) => [
        ...(x.history?.past ?? []),
        ...(x.history?.future ?? []),
      ]),
    ];
    const open = [this.store.getState().doc, ...stashed, ...history];
    return collectKeepIds({
      scenes: [...scenes, this.scene, ...stashed.filter((d) => !isBatch(d)).map(docScene)],
      patches: presets.map((p) => p.patch),
      appstore,
      batch: batch?.batch,
      ids: open.flatMap((d) => (isBatch(d) ? BatchController.keepIds(d) : [])),
    });
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
        const img = await importMedia(rec.blob);
        this.library.add(img);
        void this.thumbs?.setAsset(img.id, img.proxy, img.width, img.height, img.palette);
      }
    }
    this.adoptMode(d.scene);
    const undoable = this.replaceDoc(d.scene, "Open recent design");
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
    if (undoable)
      this.toast({
        kind: "undo",
        title: "Opened a recent design",
        detail: "Your images are one undo away.",
        prose: true,
        action: { label: "Undo", run: () => this.store.undo() },
      });
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
