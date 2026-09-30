"use client";
/**
 * Batch controller: many screenshots sharing one style. The batch itself is
 * the editor store's document (engine/batch/batch.ts), so every edit, add,
 * remove and reorder is one undo step in the same history as everything else.
 * This controller owns what isn't document: importing (decoded in a worker,
 * placeholders while it runs), memory (full decodes only near the image on
 * stage), the sidebar's UI state, persistence and "Export all".
 */
import {
  type ExportFormat,
  type ImageContent,
  type ImportedImage,
  type Palette,
  type Scene,
  isBuiltinAssetId,
  sceneAssetIds,
} from "@/engine";
import {
  type Batch,
  type BatchItem,
  type EditorDoc,
  type NewItem,
  BATCH_MAX,
  BATCH_MAX_PHONE,
  activeIndex,
  addItems,
  batchAssetIds,
  combineItems,
  COMBINE_MAX,
  COMBINE_MIN,
  customCount,
  duplicateItems,
  hasImage,
  isBatch,
  itemAssetIds,
  itemScene,
  moveItems,
  normalizeBatch,
  nudgeItems,
  removeItems,
  resetOverrides,
  seedItemIds,
  selectAll,
  selectItems,
  useStyleForAll,
} from "@/engine/batch/batch";
import { batchArchiveName, batchFileName, dedupeName } from "@/engine/batch/names";
import { type Skipped, planImport, summarizeSkipped } from "@/engine/batch/plan";
import { type OverrideGroup, GROUP_LABELS, overrideGroups } from "@/engine/batch/style";
import { type PickedFile, fileKind } from "@/engine/input/files";
import { ImportError, STILL_MOTION_ID, importImage } from "@/engine";
import { type Decoded, ImportService } from "@/lib/import/service";
import { createStore, type Store } from "@/lib/store";
import type { EditorApp } from "./app";

export const BATCH_KEY = "batch";
const RAIL_KEY = "shotcandy:rail";
export const RAIL_MIN = 168;
export const RAIL_MAX = 320;
export const RAIL_DEFAULT = 208;

export interface Placeholder {
  key: string;
  name: string;
}

export interface ExportJob {
  done: number;
  total: number;
  target: ExportTarget;
}

export type ExportTarget = "zip" | "folder" | "share";

export interface FailedExport {
  id: string;
  name: string;
  reason: string;
}

export interface BatchUi {
  /** Where style edits go: all images, or the selected one(s). */
  scope: "all" | "some";
  /** Images still being imported (skeleton tiles). */
  pending: Placeholder[];
  exporting: ExportJob | null;
  failed: FailedExport[];
  railWidth: number;
  /** Explicitly collapsed or expanded; null follows the window (collapsed when narrow). */
  railCollapsed: boolean | null;
  /** Phones: the strip is in multi-select mode. */
  selecting: boolean;
  /** Bumped when an image's decode changes (thumbnail vs full). */
  memory: number;
}

interface Stored {
  blob: Blob;
  mime: string;
  width: number;
  height: number;
  palette: Palette;
  /** The small thumbnail (kept for every image). */
  thumb: HTMLCanvasElement;
  full: boolean;
}

const NARROW = "(max-width: 767px)";
const isNarrow = () => typeof window !== "undefined" && window.matchMedia?.(NARROW).matches;

function loadRail(): { width: number; collapsed: boolean | null } {
  try {
    const raw = JSON.parse(localStorage.getItem(RAIL_KEY) ?? "{}") as {
      width?: number;
      collapsed?: boolean;
    };
    const w = Number(raw.width);
    return {
      width: Number.isFinite(w) ? Math.min(RAIL_MAX, Math.max(RAIL_MIN, w)) : RAIL_DEFAULT,
      collapsed: typeof raw.collapsed === "boolean" ? raw.collapsed : null,
    };
  } catch {
    return { width: RAIL_DEFAULT, collapsed: null };
  }
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/** A plain-words reason a file was skipped. */
function reasonOf(e: unknown): string {
  if (e instanceof ImportError) {
    switch (e.code) {
      case "heic":
        return "HEIC isn't supported yet";
      case "too-large":
        return "too large";
      case "empty":
        return "empty file";
      case "unsupported-format":
        return "not a PNG, JPEG or WebP";
      default:
        return "couldn't be read";
    }
  }
  return "couldn't be read";
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/** Every image of a single design: its screenshot and its other screens. */
function sceneImages(s: Scene): string[] {
  const ids: string[] = [];
  if (s.content.kind === "image" && s.content.assetId) ids.push(s.content.assetId);
  for (const x of s.slots ?? []) if (x.assetId && !ids.includes(x.assetId)) ids.push(x.assetId);
  return ids;
}

/** The batch with screens whose image couldn't be loaded emptied (their designs stay). */
function withoutMissingScreens(b: Batch, missing: ReadonlySet<string>): Batch {
  let touched = false;
  const items = b.items.map((x) => {
    if (!x.slots?.some((s) => s.assetId && missing.has(s.assetId))) return x;
    touched = true;
    return {
      ...x,
      slots: x.slots.map((s) => (s.assetId && missing.has(s.assetId) ? { assetId: null } : s)),
    };
  });
  return touched ? { ...b, items } : b;
}

function toCanvas(img: CanvasImageSource): HTMLCanvasElement {
  const { width, height } = img as unknown as { width: number; height: number };
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  c.getContext("2d")?.drawImage(img, 0, 0);
  return c;
}

export class BatchController {
  readonly ui: Store<BatchUi>;
  readonly decoder: ImportService | null;
  private readonly stored = new Map<string, Stored>();
  private readonly upgrading = new Map<string, Promise<void>>();
  private anchor: string | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private memoryTimer: ReturnType<typeof setTimeout> | null = null;
  private exportAbort: AbortController | null = null;
  private jobSeq = 0;
  /** An import is running: the intermediate designs aren't autosaved as recents. */
  importing = 0;

  constructor(private readonly app: EditorApp) {
    seedItemIds(Date.now().toString(36));
    const rail = typeof window !== "undefined" ? loadRail() : null;
    this.ui = createStore<BatchUi>({
      scope: "all",
      pending: [],
      exporting: null,
      failed: [],
      railWidth: rail?.width ?? RAIL_DEFAULT,
      railCollapsed: rail?.collapsed ?? null,
      selecting: false,
      memory: 0,
    });
    this.decoder = typeof window !== "undefined" ? new ImportService() : null;
  }

  dispose(): void {
    this.decoder?.dispose();
    this.exportAbort?.abort();
  }

  get doc(): EditorDoc {
    return this.app.store.getState().doc;
  }

  get batch(): Batch | null {
    const d = this.doc;
    return isBatch(d) ? d : null;
  }

  /** Most images a batch holds here (fewer on phones). */
  get max(): number {
    return isNarrow() ? BATCH_MAX_PHONE : BATCH_MAX;
  }

  /** How style edits are routed right now (read by the store's lens). */
  editScope(): "all" | "item" | "selected" {
    if (this.ui.get().scope === "all") return "all";
    const b = this.batch;
    return b && b.selected.length > 1 ? "selected" : "item";
  }

  setScope(scope: "all" | "some"): void {
    this.ui.set({ scope });
    const b = this.batch;
    if (!b) return;
    this.app.announce(
      scope === "all"
        ? `Changes apply to all ${b.items.length} images`
        : b.selected.length > 1
          ? `Changes apply to the ${b.selected.length} selected images`
          : "Changes apply to this image only",
    );
  }

  // ------------------------------------------------------------------ import

  /**
   * Add images to the design: an empty editor starts with the first, a single
   * design becomes a batch, a batch grows. Files are decoded in a worker, in
   * name order, with placeholder tiles meanwhile; unsupported files and exact
   * duplicates are skipped and reported in one toast. One undo step.
   */
  async add(
    picked: readonly PickedFile[],
    opts: { source?: string; note?: string } = {},
  ): Promise<number> {
    const app = this.app;
    const doc = this.doc;
    // A recording open on its own can't join a batch: the images start a new one.
    const recording =
      !isBatch(doc) && doc.content.kind === "image" && !!doc.content.clip && hasImage(doc);
    const plan = planImport(
      picked,
      {
        batch: isBatch(doc) ? doc.items.length : 0,
        single: !isBatch(doc) && hasImage(doc),
        recording,
        max: this.max,
      },
      { add: true },
    );
    const skipped: Skipped[] = plan.skipped.slice();
    const todo = plan.accept;
    const over = plan.over;
    if (!todo.length) {
      if (over)
        app.toast({
          kind: "info",
          title: `A batch holds up to ${this.max} images`,
          detail: "Remove some to add others.",
          prose: true,
        });
      else if (skipped.length)
        app.toast({
          kind: "error",
          title:
            skipped.length === 1
              ? "Couldn't add that file"
              : `Couldn't add ${skipped.length} files`,
          detail: `Skipped ${summarizeSkipped(skipped)}.`,
          prose: true,
          duration: 6000,
        });
      return 0;
    }
    if (over)
      app.toast({
        kind: "info",
        title: `Adding the first ${todo.length} of ${todo.length + over}`,
        detail: `A batch holds up to ${this.max} images.`,
        prose: true,
      });
    const job = ++this.jobSeq;
    const key = `batch-import:${job}`;
    const label = `Add ${plural(todo.length, "image")}`;
    if (recording) {
      // Start from an empty design with the recording's look (not its still timeline).
      app.stopPreview();
      app.store.updateDoc(
        (d) => {
          const { animation, ...rest } = d as Scene;
          const base = animation?.preset === STILL_MOTION_ID ? rest : (d as Scene);
          return { ...(base as Scene), content: { kind: "image", assetId: null }, annotations: [] };
        },
        { label, coalesce: key, coalesceMs: Infinity },
      );
    }
    const pending = todo.map((p, i) => ({ key: `${job}:${i}`, name: p.file.name }));
    this.ui.set((s) => ({ pending: [...s.pending, ...pending] }));
    if (todo.length > 1) app.announce(`Adding ${todo.length} images`);
    this.importing++;
    const known = new Set(this.assetIdsInDoc());
    let added = 0;
    // Adding to a batch shows the first new image; a design growing into one keeps its image.
    let firstNew = isBatch(this.doc);
    const t0 = performance.now();
    try {
      for (let i = 0; i < todo.length; i++) {
        const p = todo[i]!;
        const ph = pending[i]!;
        if (app.ui.get().mode !== "screenshot" || app.disposed) break;
        const cur = this.doc;
        const willShow = !isBatch(cur) && !hasImage(cur);
        const activate = isBatch(cur) && firstNew;
        let d: Decoded;
        try {
          d = await this.decode(p.file, willShow || activate);
        } catch (e) {
          skipped.push({ name: p.file.name, reason: reasonOf(e) });
          this.dropPending(ph.key);
          continue;
        }
        // Another mode came on stage while this image decoded: its design isn't ours to change.
        if (app.ui.get().mode !== "screenshot" || app.disposed) {
          this.closeDecoded(d);
          break;
        }
        if (known.has(d.id)) {
          skipped.push({ name: p.file.name, reason: "already added" });
          this.dropPending(ph.key);
          this.closeDecoded(d);
          continue;
        }
        known.add(d.id);
        app.screens.names.set(d.id, p.file.name);
        const blob =
          p.file.type === d.mime ? (p.file as Blob) : new Blob([p.file], { type: d.mime });
        this.adopt(d, blob);
        const content: ImageContent = { kind: "image", assetId: d.id };
        const item: NewItem = {
          name: p.file.name,
          content,
          ...this.autoCaption(content, d),
        };
        const wasEmpty = !isBatch(this.doc) && !hasImage(this.doc);
        app.store.updateDoc(
          (docNow) =>
            addItems(docNow, [item], {
              currentName: app.sourceName,
              activate,
              prepareFirst: (s) => app.prepareFirstImage(s, d),
            }),
          { coalesce: key, coalesceMs: Infinity, label },
        );
        if (activate) firstNew = false;
        if (wasEmpty) {
          app.sourceName = p.file.name;
          app.markLoaded(true, opts.source ?? "batch");
        }
        added++;
        this.dropPending(ph.key);
        app.bumpAssetsVersion();
        await tick();
      }
    } finally {
      this.importing--;
      this.ui.set((s) => ({
        pending: s.pending.filter((x) => !pending.some((p) => p.key === x.key)),
      }));
    }
    const ms = Math.round(performance.now() - t0);
    app.emit("batch-imported", { added, skipped: skipped.length, ms });
    this.scheduleMemory();
    if (!isBatch(this.doc)) app.afterImport();
    const b = this.batch;
    const said = [opts.note, skipped.length ? `Skipped ${summarizeSkipped(skipped)}.` : ""];
    const detail = said.filter(Boolean).join(" ") || undefined;
    if (added) {
      const title =
        b && added === b.items.length
          ? `Added ${plural(added, "image")}`
          : `Added ${plural(added, "image")}${b ? ` · ${b.items.length} in all` : ""}`;
      app.toast({
        kind: "undo",
        title,
        ...(detail ? { detail, prose: true } : {}),
        action: { label: "Undo", run: () => app.store.undo() },
        duration: skipped.length ? 7000 : 4200,
      });
      app.announce(`${title}.${detail ? ` ${detail}` : ""}`);
    } else if (skipped.length) {
      app.toast({
        kind: "error",
        title:
          skipped.length === 1 ? "Couldn't add that file" : `Couldn't add ${skipped.length} files`,
        detail: detail!,
        prose: true,
        duration: 6000,
      });
    }
    return added;
  }

  /**
   * Decode images for a design's screens (full size: they go on stage) and
   * put them in the library, thumbnails and storage. Recordings and other
   * files are skipped with a reason. In order; nothing goes into the document.
   */
  async importImages(
    files: readonly File[],
  ): Promise<{ added: { id: string; name: string }[]; skipped: Skipped[] }> {
    const added: { id: string; name: string }[] = [];
    const skipped: Skipped[] = [];
    for (const f of files) {
      const kind = fileKind(f);
      if (kind !== "image") {
        skipped.push({
          name: f.name,
          reason: kind === "video" ? "recordings can't go in a screen" : "not an image",
        });
        continue;
      }
      try {
        const d = await this.decode(f, true);
        const blob = f.type === d.mime ? (f as Blob) : new Blob([f], { type: d.mime });
        if (this.stored.has(d.id) || this.app.library.has(d.id)) {
          // Already here (the same image twice): make sure it's full, drop the new decode.
          this.closeDecoded(d);
          if (this.stored.has(d.id)) await this.ensureFull(d.id);
        } else this.adopt(d, blob);
        added.push({ id: d.id, name: f.name });
      } catch (e) {
        skipped.push({ name: f.name, reason: reasonOf(e) });
      }
    }
    if (added.length) this.app.bumpAssetsVersion();
    return { added, skipped };
  }

  private dropPending(key: string) {
    this.ui.set((s) => ({ pending: s.pending.filter((x) => x.key !== key) }));
  }

  private assetIdsInDoc(): string[] {
    const d = this.doc;
    if (isBatch(d)) return d.items.map((x) => x.content.assetId).filter((x): x is string => !!x);
    return d.content.kind === "image" && d.content.assetId && !d.content.clip
      ? [d.content.assetId]
      : [];
  }

  /** The caption a new image gets on the current canvas (tall canvases, landscape shots). */
  private autoCaption(content: ImageContent, size: { width: number; height: number }) {
    const d = this.doc;
    const { caption: _c, ...base } = isBatch(d) ? d.shared : d;
    const cap = this.app.captionFor({ ...base, content, annotations: [] }, size);
    return cap ? { caption: cap } : {};
  }

  private async decode(blob: Blob, full: boolean): Promise<Decoded> {
    if (!this.decoder) throw new Error("no decoder");
    return this.decoder.decode(blob, { proxy: full });
  }

  private closeDecoded(d: Decoded) {
    (d.thumb as { close?: () => void }).close?.();
    (d.proxy as { close?: () => void } | null)?.close?.();
  }

  // ------------------------------------------------------------------ memory

  /** Put a decoded image in the library: full when its proxy came along, else its thumbnail. */
  private adopt(d: Decoded, blob: Blob) {
    const app = this.app;
    const palette = d.palette ?? this.stored.get(d.id)?.palette;
    if (!palette) throw new Error("no palette");
    const full = !!d.proxy;
    const prev = this.stored.get(d.id);
    // One small canvas per image, kept for good: it is also what the library shows when evicted.
    const thumb = prev?.thumb ?? toCanvas(d.thumb);
    (d.thumb as { close?: () => void }).close?.();
    this.stored.set(d.id, {
      blob,
      mime: d.mime,
      width: d.width,
      height: d.height,
      palette,
      thumb,
      full: prev?.full ?? false,
    });
    if (!app.library.has(d.id)) app.library.add(this.entry(d.id));
    void app.thumbs?.setAsset(d.id, d.proxy ?? thumb, d.width, d.height, palette);
    if (full && d.proxy) this.swap(d.id, d.proxy, d.proxyWidth, d.proxyHeight);
    if (app.db)
      void app.db.assets
        .put({
          id: d.id,
          blob,
          mime: d.mime,
          width: d.width,
          height: d.height,
          role: "content",
          createdAt: Date.now(),
        })
        .catch(() => undefined);
  }

  /** A library entry: the full proxy, or the small thumbnail canvas (closing it is a no-op). */
  private entry(id: string, proxy?: CanvasImageSource, pw?: number, ph?: number): ImportedImage {
    const s = this.stored.get(id)!;
    const img = proxy ?? s.thumb;
    const w = proxy ? (pw ?? 0) : s.thumb.width;
    const h = proxy ? (ph ?? 0) : s.thumb.height;
    return {
      id,
      blob: s.blob,
      mime: s.mime,
      width: s.width,
      height: s.height,
      proxy: img,
      proxyWidth: w,
      proxyHeight: h,
      original: w >= s.width ? img : null,
      palette: s.palette,
    };
  }

  private swap(id: string, proxy?: CanvasImageSource, pw?: number, ph?: number) {
    const app = this.app;
    app.library.remove(id);
    app.library.add(this.entry(id, proxy, pw, ph));
    app.cache.invalidate(id);
    const s = this.stored.get(id);
    if (s) s.full = !!proxy;
    this.ui.set((u) => ({ memory: u.memory + 1 }));
    app.bumpAssetsVersion();
  }

  /** Decode an image fully (it came on stage, or next to it). */
  ensureFull(id: string): Promise<void> {
    const s = this.stored.get(id);
    if (!s || s.full) return Promise.resolve();
    const running = this.upgrading.get(id);
    if (running) return running;
    const job = (async () => {
      try {
        const d = await this.decoder!.decode(s.blob, { proxy: true, palette: false });
        (d.thumb as { close?: () => void }).close?.();
        if (!this.stored.has(id) || !d.proxy) return;
        this.swap(id, d.proxy, d.proxyWidth, d.proxyHeight);
        void this.app.thumbs?.setAsset(id, d.proxy, s.width, s.height, s.palette, {
          replace: true,
        });
      } catch {
        /* keep the thumbnail */
      } finally {
        this.upgrading.delete(id);
      }
    })();
    this.upgrading.set(id, job);
    return job;
  }

  /** Keep full decodes for the image on stage and its neighbours (one on phones). */
  scheduleMemory(): void {
    if (this.memoryTimer) clearTimeout(this.memoryTimer);
    this.memoryTimer = setTimeout(() => this.applyMemory(), 60);
  }

  private applyMemory() {
    const b = this.batch;
    if (!b && this.app.ui.get().mode === "screenshot") {
      // A single design: whatever is on stage is full, every screen of it.
      const d = this.doc;
      if (!isBatch(d) && d.content.kind === "image" && !d.content.clip)
        for (const id of sceneImages(d)) void this.ensureFull(id);
      return;
    }
    if (!b) return;
    const i = activeIndex(b);
    const near = isNarrow() ? [i, i + 1 < b.items.length ? i + 1 : i - 1] : [i, i - 1, i + 1];
    // The images of the designs near the stage, screens included, the one on stage first.
    const onStage = b.items[i] ? itemAssetIds(b.items[i]!) : [];
    const keep = new Set(near.flatMap((j) => (b.items[j] ? itemAssetIds(b.items[j]!) : [])));
    for (const id of onStage) void this.ensureFull(id);
    for (const id of keep) if (!onStage.includes(id)) void this.ensureFull(id);
    for (const [id, s] of this.stored)
      if (s.full && !keep.has(id) && !this.upgrading.has(id)) this.swap(id);
  }

  /** Images decoded right now: [full, thumbnails only]. For tests and the memory check. */
  memoryStats(): { full: number; thumbs: number } {
    let full = 0;
    for (const s of this.stored.values()) if (s.full) full++;
    return { full, thumbs: this.stored.size - full };
  }

  /** Load a stored image into the library as a thumbnail (restoring a batch). */
  private async loadStored(id: string, full: boolean): Promise<boolean> {
    if (this.stored.has(id)) {
      if (full) await this.ensureFull(id);
      return true;
    }
    if (this.app.library.has(id)) return true;
    const rec = await this.app.db?.assets.get(id).catch(() => undefined);
    if (!rec) return false;
    try {
      const d = await this.decode(rec.blob, full);
      this.adopt(d, rec.blob);
      return true;
    } catch {
      return false;
    }
  }

  /** Images of an opened project file: decoded in the worker, the design on stage fully. */
  async adoptBlobs(assets: readonly { id: string; blob: Blob }[], b: Batch): Promise<void> {
    const act = b.items[activeIndex(b)];
    const active = new Set(act ? itemAssetIds(act) : []);
    const items = new Set(b.items.flatMap(itemAssetIds));
    for (const a of assets) {
      if (this.stored.has(a.id) || this.app.library.has(a.id)) continue;
      try {
        if (items.has(a.id)) this.adopt(await this.decode(a.blob, active.has(a.id)), a.blob);
        else this.app.adoptImportedAsset(await importImage(a.blob));
      } catch {
        /* reported as missing when drawn */
      }
      await tick();
    }
  }

  // --------------------------------------------------------------- selection

  private afterSelect(b: Batch, announce = true) {
    const app = this.app;
    // Picking images snaps the switch back to All; say so when it was elsewhere.
    const snapped = this.ui.get().scope !== "all";
    this.ui.set({ scope: "all" });
    app.onBatchSelect();
    this.scheduleMemory();
    const all = snapped ? ` Changes apply to all ${b.items.length} images.` : "";
    if (!announce) {
      if (snapped) app.announce(all.trim());
      return;
    }
    const i = activeIndex(b);
    const item = b.items[i]!;
    app.announce(
      (b.selected.length > 1
        ? `${b.selected.length} images selected. Image ${i + 1} of ${b.items.length}, ${item.name || "untitled"}`
        : `Image ${i + 1} of ${b.items.length}, ${item.name || "untitled"}`) + all,
    );
  }

  select(id: string, mode: "only" | "toggle" | "range" = "only"): void {
    const b = this.batch;
    if (!b) return;
    const next = selectItems(b, id, mode, mode === "range" ? (this.anchor ?? b.active) : undefined);
    if (mode !== "range") this.anchor = id;
    if (next === b) return;
    this.app.store.updateDoc(() => next, { transient: true });
    this.afterSelect(next, next.active !== b.active || next.selected.length !== b.selected.length);
  }

  /** Arrow keys: move the active image (Shift extends the selection). */
  step(dir: -1 | 1, extend = false): void {
    const b = this.batch;
    if (!b) return;
    const i = activeIndex(b) + dir;
    const target = b.items[i];
    if (!target) return;
    if (extend) {
      const next = selectItems(b, target.id, "range", this.anchor ?? b.active);
      this.app.store.updateDoc(() => next, { transient: true });
      this.afterSelect(next);
    } else this.select(target.id);
  }

  jump(where: "first" | "last"): void {
    const b = this.batch;
    if (!b) return;
    this.select(b.items[where === "first" ? 0 : b.items.length - 1]!.id);
  }

  selectAll(): void {
    const b = this.batch;
    if (!b) return;
    const next = selectAll(b);
    if (next === b) return;
    this.app.store.updateDoc(() => next, { transient: true });
    this.afterSelect(next, false);
    this.app.announce(`All ${b.items.length} images selected`);
  }

  /** Esc: back to just the image on stage. */
  collapseSelection(): void {
    const b = this.batch;
    if (b && b.selected.length > 1) this.select(b.active);
  }

  /** The ids a menu or key acts on: the selection when the item is part of it, else the item. */
  targets(id?: string): string[] {
    const b = this.batch;
    if (!b) return [];
    if (!id || b.selected.includes(id)) return b.selected.slice();
    return [id];
  }

  // -------------------------------------------------------------- operations

  remove(ids: string[] = this.targets()): void {
    const b = this.batch;
    if (!b || !ids.length) return;
    const n = ids.length;
    const label = n === 1 ? "Remove image" : `Remove ${n} images`;
    this.app.store.updateDoc((d) => (isBatch(d) ? removeItems(d, ids) : d), { label });
    const after = this.doc;
    this.anchor = isBatch(after) ? after.active : null;
    // The rail is gone with the batch: keep the keyboard on the canvas.
    if (!isBatch(after)) this.app.ui.set((s) => ({ stageFocus: s.stageFocus + 1 }));
    this.scheduleMemory();
    const title =
      n === 1
        ? `Removed ${b.items.find((x) => x.id === ids[0])?.name || "image"}`
        : `Removed ${n} images`;
    this.app.toast({
      kind: "undo",
      title,
      ...(isBatch(after)
        ? {}
        : hasImage(after as Scene)
          ? { detail: "Back to one image.", prose: true }
          : {}),
      action: { label: "Undo", run: () => this.app.store.undo() },
      duration: 6000,
    });
    this.app.announce(`${title}.${isBatch(after) ? ` ${after.items.length} images left.` : ""}`);
  }

  /** Drag and drop: move the ids to an insertion point. */
  moveTo(ids: string[], to: number): void {
    const b = this.batch;
    if (!b) return;
    const next = moveItems(b, ids, to);
    if (next === b) return;
    this.app.store.updateDoc(() => next, {
      label: ids.length === 1 ? "Move image" : `Move ${ids.length} images`,
    });
    this.moved(next, ids);
  }

  /** Say where the moved images went, with Undo. */
  private moved(next: Batch, ids: string[]) {
    const i = next.items.findIndex((x) => x.id === ids[0]);
    const n = next.items.length;
    const title =
      ids.length === 1
        ? `Moved to position ${i + 1} of ${n}`
        : `Moved ${ids.length} images to position ${i + 1} of ${n}`;
    this.app.toast({
      kind: "undo",
      title,
      action: { label: "Undo", run: () => this.app.store.undo() },
    });
    this.app.announce(ids.length === 1 ? `Image moved to position ${i + 1} of ${n}` : title);
  }

  /** ⌥↑ / ⌥↓ and "Move up/down": the selection moves one place. */
  nudge(dir: -1 | 1, ids: string[] = this.targets()): void {
    const b = this.batch;
    if (!b) return;
    const next = nudgeItems(b, ids, dir);
    if (next === b) {
      this.app.announce(dir < 0 ? "Already first" : "Already last");
      return;
    }
    // Holding ⌥↓ moves several places in one undo step.
    this.app.store.updateDoc(() => next, {
      label: ids.length === 1 ? "Move image" : `Move ${ids.length} images`,
      coalesce: `batch-nudge:${ids.join(",")}`,
    });
    this.moved(next, ids);
  }

  duplicate(ids: string[] = this.targets()): void {
    const b = this.batch;
    if (!b) return;
    const room = this.max - b.items.length;
    if (room <= 0) {
      this.app.toast({
        kind: "info",
        title: `A batch holds up to ${this.max} images`,
        detail: "Remove some to make copies.",
        prose: true,
      });
      return;
    }
    const use = ids.slice(0, room);
    const label = use.length === 1 ? "Duplicate image" : `Duplicate ${use.length} images`;
    this.app.store.updateDoc((d) => (isBatch(d) ? duplicateItems(d, use) : d), { label });
    this.anchor = this.batch?.active ?? null;
    this.afterSelect(this.batch!, false);
    this.app.announce(use.length === 1 ? "Image duplicated" : `${use.length} images duplicated`);
  }

  /** Whether "Combine into one design" applies to these images (2 to 6 of them). */
  canCombine(ids: readonly string[] = this.targets()): boolean {
    return ids.length >= COMBINE_MIN && ids.length <= COMBINE_MAX;
  }

  /**
   * "Combine into one design": one new multi-screen design from the selected
   * images (side by side for 2-3, a grid for 4-6), right after them and on
   * stage. The originals stay. One undo step.
   */
  combine(ids: string[] = this.targets()): void {
    const b = this.batch;
    if (!b || !this.canCombine(ids)) return;
    if (b.items.length >= this.max) {
      this.app.toast({
        kind: "info",
        title: `A batch holds up to ${this.max} images`,
        detail: "Remove one to combine these.",
        prose: true,
      });
      return;
    }
    const n = ids.length;
    this.app.store.updateDoc((d) => (isBatch(d) ? combineItems(d, ids) : d), {
      label: `Combine ${n} images`,
    });
    const next = this.batch;
    if (!next || next === b) return;
    this.anchor = next.active;
    this.afterSelect(next, false);
    const i = activeIndex(next);
    const title = `Combined ${n} images into one design`;
    this.app.toast({
      kind: "undo",
      title,
      detail: `Image ${i + 1} of ${next.items.length}. The originals stay.`,
      prose: true,
      action: { label: "Undo", run: () => this.app.store.undo() },
      duration: 6000,
    });
    this.app.announce(`${title}. Image ${i + 1} of ${next.items.length}.`);
  }

  /** Reset the images (or some inspector groups of them) to the shared style. */
  reset(ids: string[] = this.targets(), groups?: OverrideGroup[]): void {
    const b = this.batch;
    if (!b) return;
    const touched = b.items.filter((x) => ids.includes(x.id) && x.overrides).length;
    if (!touched) return;
    const what = groups?.length === 1 ? GROUP_LABELS[groups[0]!].toLowerCase() : "style";
    const label = touched === 1 ? `Reset ${what}` : `Reset ${what} of ${touched} images`;
    this.app.store.updateDoc((d) => (isBatch(d) ? resetOverrides(d, ids, groups) : d), { label });
    this.app.ui.set((s) => ({ xfade: s.xfade + 1 }));
    const title =
      groups?.length === 1
        ? touched === 1
          ? `${GROUP_LABELS[groups[0]!]} matches all images again`
          : `${GROUP_LABELS[groups[0]!]} of ${touched} images reset`
        : touched === 1
          ? "Reset to the shared style"
          : `Reset ${touched} images to the shared style`;
    this.app.toast({
      kind: "undo",
      title,
      action: { label: "Undo", run: () => this.app.store.undo() },
    });
    this.app.announce(title);
  }

  /** Reset every image to the shared style. */
  resetAll(): void {
    const b = this.batch;
    if (b) this.reset(b.items.map((x) => x.id));
  }

  /** "Use this style for all": this image's look becomes everyone's; others keep their own changes. */
  useForAll(id: string = this.batch?.active ?? ""): void {
    const b = this.batch;
    if (!b) return;
    const others = customCount(b, id);
    this.app.store.updateDoc((d) => (isBatch(d) ? useStyleForAll(d, id) : d), {
      label: "Use style for all",
    });
    this.app.ui.set((s) => ({ xfade: s.xfade + 1 }));
    const n = b.items.length;
    const title = `Used this style for all ${n} images`;
    this.app.toast({
      kind: "undo",
      title,
      ...(others
        ? {
            detail: `${plural(others, "image")} ${others === 1 ? "keeps its" : "keep their"} own changes.`,
            prose: true,
          }
        : {}),
      action: { label: "Undo", run: () => this.app.store.undo() },
      duration: 6000,
    });
    this.app.announce(title);
  }

  /** Groups the image on stage overrides. */
  activeGroups(): OverrideGroup[] {
    const b = this.batch;
    if (!b) return [];
    return overrideGroups(b.items[activeIndex(b)]!.overrides);
  }

  // ------------------------------------------------------------- persistence

  scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      const b = this.batch;
      const db = this.app.db;
      if (!b || !db) return;
      void db.settings.set(BATCH_KEY, { v: 1, batch: b }).catch(() => undefined);
    }, 500);
  }

  clearSaved(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    void this.app.db?.settings.delete(BATCH_KEY).catch(() => undefined);
  }

  /** The saved batch (after a reload), with its images loaded; null when there is none. */
  async restore(): Promise<Batch | Scene | null> {
    const db = this.app.db;
    if (!db) return null;
    let raw: { batch?: unknown } | undefined;
    try {
      raw = await db.settings.get<{ batch?: unknown }>(BATCH_KEY);
    } catch {
      return null;
    }
    if (!raw) return null;
    const doc = normalizeBatch(raw.batch, BATCH_MAX);
    if (!doc || !isBatch(doc)) {
      this.clearSaved();
      return null;
    }
    // The design on stage first (full, every screen), then the others as thumbnails.
    const act = doc.items[activeIndex(doc)]!;
    const order = [act, ...doc.items.filter((x) => x !== act)];
    const missing = new Set<string>();
    const first = act.content.assetId!;
    for (const id of itemAssetIds(act)) if (!(await this.loadStored(id, true))) missing.add(id);
    const seen = new Set(itemAssetIds(act));
    const rest = order
      .slice(1)
      .flatMap(itemAssetIds)
      .filter((id) => !seen.has(id) && (seen.add(id), true));
    const later = (async () => {
      for (const id of rest) {
        if (missing.has(id)) continue;
        if (!(await this.loadStored(id, false))) missing.add(id);
        this.app.bumpAssetsVersion();
        await tick();
      }
      this.scheduleMemory();
    })();
    this.restoring = later;
    for (const x of doc.items) {
      const bg = itemScene(doc, x).background.fill;
      if (bg.kind === "image" && !isBuiltinAssetId(bg.assetId))
        void this.app.loadStoredAsset(bg.assetId);
    }
    if (missing.has(first)) {
      await later;
      const kept = doc.items.filter((x) => !missing.has(x.content.assetId!));
      if (!kept.length) return null;
      const fixed = removeItems(
        withoutMissingScreens(doc, missing),
        doc.items.filter((x) => missing.has(x.content.assetId!)).map((x) => x.id),
      );
      return fixed as Batch | Scene;
    }
    // A lost extra screen of the design on stage shows as empty rather than broken.
    return missing.size ? withoutMissingScreens(doc, missing) : doc;
  }

  private restoring: Promise<void> | null = null;

  /** Wait until every image of the batch (every screen of every design) is in the library. */
  async ready(): Promise<void> {
    if (this.restoring) await this.restoring;
    const b = this.batch;
    if (!b) return;
    for (const x of b.items)
      for (const id of itemAssetIds(x))
        if (!this.app.library.has(id)) await this.loadStored(id, false);
  }

  /** Every asset id a saved or open batch uses (never garbage-collected). */
  static keepIds(doc: unknown): string[] {
    const b = isBatch(doc) ? doc : normalizeBatch(doc);
    return b && isBatch(b) ? batchAssetIds(b) : [];
  }

  // ------------------------------------------------------------------ export

  /** Whether this browser can save straight into a folder (Chromium desktop). */
  static canSaveToFolder(): boolean {
    return (
      typeof window !== "undefined" &&
      typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker ===
        "function" &&
      !isNarrow()
    );
  }

  cancelExport(): void {
    this.exportAbort?.abort();
  }

  /**
   * Export every image (or `only` these) with the current export settings,
   * one at a time: into a ZIP, into a new "Shotcandy" folder, or to the share
   * sheet (phones). Failures don't stop the rest; they can be retried.
   */
  async exportAll(target: ExportTarget = "zip", only?: string[]): Promise<void> {
    // One at a time, from the first click (the folder picker and loading come before progress shows).
    if (this.exportBusy || this.ui.get().exporting || !this.batch) return;
    this.exportBusy = true;
    try {
      await this.runExportAll(target, only);
    } finally {
      this.exportBusy = false;
    }
  }

  private exportBusy = false;

  private async runExportAll(target: ExportTarget, only?: string[]): Promise<void> {
    const app = this.app;
    // The folder picker needs the click's user activation: ask before anything else.
    let dir: FileSystemDirectoryHandleLike | null = null;
    if (target === "folder") {
      try {
        const picker = (
          window as unknown as {
            showDirectoryPicker: (o: object) => Promise<FileSystemDirectoryHandleLike>;
          }
        ).showDirectoryPicker;
        const parent = await picker({ mode: "readwrite", id: "shotcandy-export" });
        dir = await parent.getDirectoryHandle("Shotcandy", { create: true });
      } catch (e) {
        if ((e as Error).name !== "AbortError")
          app.toast({
            kind: "error",
            title: "Couldn't open that folder",
            detail: "Saving a ZIP instead.",
            prose: true,
          });
        if ((e as Error).name === "AbortError") return;
        target = "zip";
      }
    }
    await this.ready();
    const snapshot = this.batch;
    if (!snapshot) return;
    const items = only ? snapshot.items.filter((x) => only.includes(x.id)) : snapshot.items.slice();
    if (!items.length) return;
    const settings = { ...app.ui.get().exportSettings, kind: "image" as const };
    const ac = new AbortController();
    this.exportAbort = ac;
    const total = items.length;
    this.ui.set({ exporting: { done: 0, total, target }, failed: [] });
    app.announce(`Exporting ${total} images`);
    const taken = new Set<string>();
    if (dir) {
      try {
        for await (const h of dir.values()) taken.add(h.name.toLowerCase());
      } catch {
        /* can't list: names are still unique within this export */
      }
    }
    const zipMod = target === "folder" ? null : await import("@/engine/batch/zip");
    const zip = zipMod && target === "zip" ? new zipMod.ZipStream() : null;
    const files: File[] = [];
    const names: string[] = [];
    const failed: FailedExport[] = [];
    const now = new Date();
    let cancelled = false;
    for (let k = 0; k < items.length; k++) {
      if (ac.signal.aborted) {
        cancelled = true;
        break;
      }
      const item = items[k]!;
      const n = snapshot.items.indexOf(item) + 1;
      try {
        const scene = itemScene(snapshot, item);
        const plan = app.exportPlan(settings, {}, scene);
        const r = await app.runPlan(plan, settings, {}, scene);
        const format: ExportFormat = r.mime.includes("jpeg")
          ? "jpeg"
          : r.mime.includes("webp")
            ? "webp"
            : "png";
        const whole = Math.abs(plan.scale - Math.round(plan.scale)) < 0.01;
        const name = dedupeName(
          batchFileName(settings.pattern, {
            source: item.name || scene.meta.name,
            n,
            width: r.width,
            height: r.height,
            scale: whole ? Math.round(plan.scale) : Math.round(plan.scale * 100) / 100,
            format,
            style: scene.meta.stylePresetId ?? "custom",
            preset:
              scene.canvas.size.kind === "auto" ? "auto" : (scene.canvas.size.presetId ?? "custom"),
            now,
          }),
          taken,
        );
        if (ac.signal.aborted) {
          cancelled = true;
          break;
        }
        if (dir) {
          const fh = await dir.getFileHandle(name, { create: true });
          const w = await fh.createWritable();
          await w.write(r.blob);
          await w.close();
        } else if (zip) {
          zip.add(name, new Uint8Array(await r.blob.arrayBuffer()), now);
        } else files.push(new File([r.blob], name, { type: r.mime }));
        names.push(name);
      } catch (e) {
        failed.push({
          id: item.id,
          name: item.name || `Image ${n}`,
          reason: e instanceof Error ? e.message : String(e),
        });
      }
      this.ui.set({ exporting: { done: k + 1, total, target } });
      // One image at a time: let the page breathe and memory settle.
      await tick();
    }
    this.exportAbort = null;
    try {
      if (cancelled) {
        zip?.abort();
        app.toast({
          kind: "info",
          title: "Export cancelled",
          detail:
            dir && names.length
              ? `${plural(names.length, "image")} already saved in the Shotcandy folder.`
              : "Nothing was saved.",
          prose: true,
        });
        return;
      }
      if (!names.length) {
        app.toast({
          kind: "error",
          title: "Export failed",
          detail: failed[0]?.reason ?? "Nothing could be rendered.",
          prose: true,
          duration: 6000,
        });
        this.ui.set({ failed });
        return;
      }
      let where = "";
      if (zip) {
        const blob = await zip.finish();
        const file = `${batchArchiveName(names.length, now)}.zip`;
        app.downloadFile(blob, file);
        where = file;
      } else if (dir) {
        where = "the Shotcandy folder";
      } else {
        const zipAll = async () => {
          const zm = zipMod ?? (await import("@/engine/batch/zip"));
          const z = new zm.ZipStream();
          for (const f of files) z.add(f.name, new Uint8Array(await f.arrayBuffer()), now);
          const file = `${batchArchiveName(files.length, now)}.zip`;
          app.downloadFile(await z.finish(), file);
          return file;
        };
        const shared = await this.shareFiles(files);
        if (shared === "cancelled") return;
        if (shared === "blocked") {
          // Rendering outlasted the tap that asked for it, and the share sheet
          // only opens from a tap: offer one.
          this.ui.set({ failed });
          app.toast({
            kind: "info",
            title: `${plural(files.length, "image")} ready`,
            detail: "Tap Share to save or send them.",
            prose: true,
            duration: 20000,
            action: {
              label: "Share",
              run: () =>
                void this.shareFiles(files).then(async (r) => {
                  if (r === "unsupported" || r === "blocked") await zipAll();
                  if (r !== "cancelled") app.announce(`Exported ${plural(files.length, "image")}`);
                }),
            },
          });
          app.announce(`${plural(files.length, "image")} ready. Use Share to save them.`);
          return;
        }
        if (shared === "unsupported") where = await zipAll();
      }
      app.emit("batch-exported", { names, target, failed: failed.map((f) => f.name) });
      this.ui.set({ failed });
      if (failed.length) {
        app.toast({
          kind: "error",
          title: `Exported ${names.length} of ${names.length + failed.length}`,
          detail: `${failed.length} failed: ${failed
            .slice(0, 3)
            .map((f) => `${f.name} (${f.reason})`)
            .join(", ")}${failed.length > 3 ? "…" : ""}`,
          prose: true,
          duration: 9000,
          action: {
            label: "Retry failed",
            run: () =>
              void this.exportAll(
                target === "folder" ? "zip" : target,
                failed.map((f) => f.id),
              ),
          },
        });
      } else {
        app.toast({
          kind: "wrap",
          title:
            target === "share" && !where
              ? `Shared ${plural(names.length, "image")}`
              : `Saved ${plural(names.length, "image")}`,
          ...(where
            ? { detail: where === "the Shotcandy folder" ? "In the Shotcandy folder" : where }
            : {}),
          thumb: await app.batchPoster(),
          duration: 4200,
        });
      }
      app.announce(`Exported ${plural(names.length, "image")}`);
    } finally {
      this.ui.set({ exporting: null });
    }
  }

  private async shareFiles(
    files: File[],
  ): Promise<"shared" | "cancelled" | "blocked" | "unsupported"> {
    const nav = navigator as Navigator & {
      canShare?: (d: ShareData) => boolean;
      share?: (d: ShareData) => Promise<void>;
    };
    if (typeof nav.share !== "function" || !nav.canShare?.({ files })) return "unsupported";
    try {
      await nav.share({ files, title: "Shotcandy images" });
      return "shared";
    } catch (e) {
      const name = (e as Error).name;
      // NotAllowedError: no recent tap (the share sheet needs one).
      return name === "AbortError"
        ? "cancelled"
        : name === "NotAllowedError"
          ? "blocked"
          : "unsupported";
    }
  }

  // --------------------------------------------------------------------- rail

  setRail(patch: { width?: number; collapsed?: boolean }): void {
    const next = {
      railWidth:
        patch.width !== undefined
          ? Math.round(Math.min(RAIL_MAX, Math.max(RAIL_MIN, patch.width)))
          : this.ui.get().railWidth,
      railCollapsed: patch.collapsed ?? this.ui.get().railCollapsed,
    };
    this.ui.set(next);
    try {
      localStorage.setItem(
        RAIL_KEY,
        JSON.stringify({ width: next.railWidth, collapsed: next.railCollapsed }),
      );
    } catch {
      /* ignore */
    }
  }

  /** Items of the open batch with the scene each exports. */
  scenes(): { item: BatchItem; scene: Scene }[] {
    const b = this.batch;
    return b ? b.items.map((item) => ({ item, scene: itemScene(b, item) })) : [];
  }

  /** Every asset the batch needs to render (for project files). */
  assetIds(): string[] {
    const ids = new Set<string>();
    for (const { scene } of this.scenes()) for (const id of sceneAssetIds(scene)) ids.add(id);
    return [...ids];
  }
}

interface FileSystemWritableLike {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
}
interface FileSystemFileHandleLike {
  createWritable(): Promise<FileSystemWritableLike>;
}
interface FileSystemDirectoryHandleLike {
  getDirectoryHandle(
    name: string,
    o?: { create?: boolean },
  ): Promise<FileSystemDirectoryHandleLike>;
  getFileHandle(name: string, o?: { create?: boolean }): Promise<FileSystemFileHandleLike>;
  values(): AsyncIterable<{ name: string }>;
}
