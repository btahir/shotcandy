"use client";
/**
 * Screens controller: multi-screen designs in the editor. Picking a layout,
 * its count and knobs, and filling, replacing, swapping and emptying its
 * screens, from the inspector, the stage, drops, pastes and the images rail.
 * Every change edits the design on stage (in a batch: the image on stage,
 * whatever the All / This image switch says) and is one named undo step.
 */
import {
  type ActiveLayout,
  type LayoutId,
  type LayoutParamKey,
  type Scene,
  type ScreenSlot,
  activeLayout,
  clearSlot,
  emptySlots,
  fillSlot,
  getLayoutDef,
  placeScreen,
  screenContent,
  setLayout,
  setLayoutParam,
  setScreenCount,
  shownScreens,
  swapSlots,
} from "@/engine";
import { isBatch, itemScreen } from "@/engine/batch/batch";
import { sortByName } from "@/engine/batch/names";
import { summarizeSkipped } from "@/engine/batch/plan";
import type { PickedFile } from "@/engine/input/files";
import { createStore, type Store } from "@/lib/store";
import type { EditorApp } from "./app";
import { openFilePicker } from "./EmptyState";

export interface ScreensUi {
  /** The screen a drag would drop on (files, a rail image or another screen). */
  target: number | null;
  /** What is being dragged over the screens. */
  carrying: "files" | "image" | "screen" | null;
  /** The screen being dragged onto another one (to swap them). */
  moving: number | null;
  /** Screens that just changed (a one-shot highlight). */
  flash: number[];
  /** Bumped when a screen's context menu should open (index and client point). */
  menu: { index: number; x: number; y: number } | null;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export class ScreensController {
  readonly ui: Store<ScreensUi>;
  /** File names by asset id, for labels and announcements (kept for this session only). */
  readonly names = new Map<string, string>();
  /** Screen at a client point while the stage shows a multi-screen design (set by the stage). */
  private locate: ((x: number, y: number) => number | null) | null = null;
  private flashTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly app: EditorApp) {
    this.ui = createStore<ScreensUi>({
      target: null,
      carrying: null,
      moving: null,
      flash: [],
      menu: null,
    });
  }

  private get scene(): Scene {
    return this.app.scene;
  }

  /** The Screens controls apply: screenshot mode with an image (not a recording). */
  available(scene: Scene = this.scene): boolean {
    const c = scene.content;
    return (
      this.app.ui.get().mode === "screenshot" &&
      this.app.ui.get().hasContent &&
      c.kind === "image" &&
      !!c.assetId &&
      !c.clip
    );
  }

  /** The multi-screen layout on stage, or null (single screen, or not screenshot mode). */
  active(): ActiveLayout | null {
    return this.available() ? activeLayout(this.scene) : null;
  }

  /** Shown screens without an image, in order. */
  empties(): number[] {
    return this.active() ? emptySlots(this.scene) : [];
  }

  /** The stage tells where its screens are; returns the clean-up. */
  setLocator(fn: (x: number, y: number) => number | null): () => void {
    this.locate = fn;
    return () => {
      if (this.locate === fn) this.locate = null;
    };
  }

  /** The screen under a client point, or null (off the screens, or a single design). */
  at(x: number, y: number): number | null {
    return this.active() ? (this.locate?.(x, y) ?? null) : null;
  }

  /** Whether files dropped at this point go into the design's screens. */
  takesFiles(x?: number, y?: number): boolean {
    if (!this.active()) return false;
    if (x !== undefined && y !== undefined && this.at(x, y) !== null) return true;
    return this.empties().length > 0;
  }

  /** The file name of screen `i`'s image, when known. */
  name(i: number, scene: Scene = this.scene): string | null {
    const id = screenContent(scene, i)?.assetId;
    if (!id) return null;
    const known = this.names.get(id);
    if (known) return known;
    const doc = this.app.store.getState().doc;
    if (isBatch(doc)) {
      const item = doc.items.find((x) => x.content.assetId === id);
      if (item?.name) return item.name;
    }
    if (i === 0 && this.app.sourceName) return this.app.sourceName;
    return null;
  }

  /** "Screen 2 of 3, empty" / "Screen 1 of 3, login.png". */
  label(i: number, scene: Scene = this.scene): string {
    const n = shownScreens(scene);
    const filled = !!screenContent(scene, i)?.assetId;
    return `Screen ${i + 1} of ${n}, ${filled ? (this.name(i, scene) ?? "image") : "empty"}`;
  }

  /** What the window's drop veil says while files are dragged over a multi-screen design. */
  dropMessage(): string | null {
    if (!this.active()) return null;
    const t = this.ui.get().target;
    if (t !== null)
      return screenContent(this.scene, t)?.assetId
        ? `Drop to replace screen ${t + 1}`
        : `Drop to fill screen ${t + 1}`;
    const n = this.empties().length;
    if (!n) return null;
    return n === 1 ? "Drop to fill the empty screen" : `Drop to fill ${n} empty screens`;
  }

  /** Point a drag at a screen (null: none). */
  hover(target: number | null, carrying: ScreensUi["carrying"]): void {
    const u = this.ui.get();
    if (u.target !== target || u.carrying !== carrying) this.ui.set({ target, carrying });
  }

  endDrag(): void {
    const u = this.ui.get();
    if (u.target !== null || u.carrying || u.moving !== null)
      this.ui.set({ target: null, carrying: null, moving: null });
  }

  private flash(indices: number[]): void {
    if (this.flashTimer) clearTimeout(this.flashTimer);
    this.ui.set({ flash: indices });
    this.flashTimer = setTimeout(() => this.ui.set({ flash: [] }), 700);
  }

  /** Change the design on stage as one named undo step; whether anything changed. */
  private edit(fn: (s: Scene) => Scene, label: string, coalesce?: string): boolean {
    const before = this.app.store.getState().doc;
    this.app.store.update(fn, { label, ...(coalesce ? { coalesce } : {}) });
    return this.app.store.getState().doc !== before;
  }

  // ------------------------------------------------------------------ layout

  /** Pick an arrangement ("single" shows screen 0 only; the other screens are kept). */
  setLayout(id: LayoutId, opts: { coalesce?: string } = {}): void {
    if (!this.available()) return;
    const def = getLayoutDef(id);
    if (!def) return;
    const label = id === "single" ? "Single screen" : `${def.label} layout`;
    if (!this.edit((s) => setLayout(s, id), label, opts.coalesce)) return;
    this.app.clearPreview(true);
    this.app.ui.set((u) => ({ xfade: u.xfade + 1 }));
    const scene = this.scene;
    if (id === "single") {
      const kept = (scene.slots ?? []).filter((s) => s.assetId).length;
      this.app.announce(
        kept ? `Single screen. ${plural(kept, "other screen")} kept for later.` : "Single screen",
      );
      return;
    }
    const n = shownScreens(scene);
    const empty = emptySlots(scene).length;
    this.app.announce(
      `${def.label}, ${plural(n, "screen")}${empty ? `, ${empty} empty. Drop images or press Tab to reach them.` : "."}`,
    );
  }

  /** Show `n` screens (hidden screens keep their images). */
  setCount(n: number): void {
    if (!this.active()) return;
    if (!this.edit((s) => setScreenCount(s, n), `Show ${n} screens`)) return;
    const empty = emptySlots(this.scene).length;
    this.app.announce(`${plural(n, "screen")}${empty ? `, ${empty} empty` : ""}`);
  }

  /** Move one of the layout's knobs (a slider drag is one undo step). */
  setParam(key: LayoutParamKey, value: number): void {
    const lay = this.active();
    const p = lay?.def.params.find((q) => q.key === key);
    if (!lay || !p) return;
    this.edit(
      (s) => setLayoutParam(s, key, value),
      `Change ${p.label.toLowerCase()}`,
      `screens:${key}`,
    );
  }

  /** Put the layout's knobs back to their defaults (the screens stay). */
  resetParams(): void {
    const lay = this.active();
    if (!lay || !this.scene.layout?.params) return;
    const changed = this.edit((s) => {
      if (!s.layout?.params) return s;
      const { params: _p, ...spec } = s.layout;
      return { ...s, layout: spec };
    }, `Reset ${lay.def.label.toLowerCase()}`);
    if (changed) this.app.announce(`${lay.def.label} reset`);
  }

  // ----------------------------------------------------------------- screens

  /**
   * Screens to fill, in order, for images landing on `at` (or on no screen
   * in particular): that screen first, then the empty shown screens after it,
   * then new ones up to the layout's most, then empty ones before it.
   */
  private order(at: number | null): number[] {
    const lay = this.active();
    if (!lay) return [];
    const scene = this.scene;
    const empty = emptySlots(scene);
    const grow: number[] = [];
    for (let i = lay.count; i < lay.def.maxCount; i++)
      if (!screenContent(scene, i)?.assetId) grow.push(i);
    if (at === null) return [...empty, ...grow];
    return [
      at,
      ...empty.filter((i) => i > at),
      ...grow.filter((i) => i > at),
      ...empty.filter((i) => i < at),
    ];
  }

  /**
   * Image files dropped or pasted onto the design: they fill `at` and the
   * empty screens (or just the empty screens, in order). Files beyond the
   * layout's most screens follow the usual import rules and join the batch.
   */
  async addFiles(
    files: readonly (File | PickedFile)[],
    at: number | null,
    source = "drop",
  ): Promise<void> {
    const app = this.app;
    const picked = files.map((f) => (f instanceof File ? { file: f, path: f.name } : f));
    const sorted = sortByName(picked.map((p) => ({ ...p, name: p.file.name }))).map((p) => ({
      file: p.file,
      path: p.path,
    }));
    const slots = this.order(at);
    if (!slots.length) {
      await app.importFiles(sorted, { source });
      return;
    }
    const take = sorted.slice(0, slots.length);
    const rest = sorted.slice(slots.length);
    const { added, skipped } = await app.batch.importImages(take.map((p) => p.file));
    for (const a of added) this.names.set(a.id, a.name);
    // The layout went away meanwhile (undo, another design): import them the usual way.
    if (!this.active()) {
      await app.importFiles(sorted, { source });
      return;
    }
    const placed: number[] = [];
    const replaced: number[] = [];
    if (added.length) {
      const cur = this.scene;
      added.forEach((_, k) => {
        const i = slots[k]!;
        placed.push(i);
        if (screenContent(cur, i)?.assetId) replaced.push(i);
      });
      const label =
        placed.length === 1
          ? replaced.length
            ? `Replace screen ${placed[0]! + 1}`
            : `Add image to screen ${placed[0]! + 1}`
          : `Fill ${placed.length} screens`;
      this.edit((s) => {
        let next = s;
        added.forEach((a, k) => (next = fillSlot(next, slots[k]!, a.id)));
        return next;
      }, label);
      if (placed.includes(0) && !isBatch(app.store.getState().doc))
        app.sourceName = added[placed.indexOf(0)]!.name;
      this.flash(placed);
    }
    const note = placed.length ? this.filledText(placed, replaced, added) : "";
    const why = skipped.length ? `Skipped ${summarizeSkipped(skipped)}.` : "";
    if (rest.length) {
      // Past the layout's most screens: the rest join the batch as images of their own.
      await app.importFiles(rest, {
        source,
        add: true,
        note: [note, why].filter(Boolean).join(" "),
      });
      return;
    }
    this.report(note, why, placed, replaced);
  }

  private filledText(placed: number[], replaced: number[], added: { name: string }[]): string {
    if (placed.length === 1) {
      const i = placed[0]! + 1;
      return replaced.length
        ? `Replaced screen ${i} with ${added[0]!.name}.`
        : `${added[0]!.name} placed in screen ${i} of ${shownScreens(this.scene)}.`;
    }
    return `Filled ${placed.length} screens.`;
  }

  private report(note: string, why: string, placed: number[], replaced: number[]): void {
    const app = this.app;
    if (!placed.length) {
      if (why)
        app.toast({
          kind: "error",
          title: "Couldn't add that file",
          detail: why,
          prose: true,
          duration: 6000,
        });
      return;
    }
    // Filling an empty screen shows itself; replacing or several at once gets a toast with Undo.
    if (replaced.length || placed.length > 1 || why) {
      app.toast({
        kind: "undo",
        title:
          placed.length === 1
            ? replaced.length
              ? `Replaced screen ${placed[0]! + 1}`
              : `Filled screen ${placed[0]! + 1}`
            : `Filled ${placed.length} screens`,
        ...(why ? { detail: why, prose: true } : {}),
        action: { label: "Undo", run: () => app.store.undo() },
        duration: why ? 7000 : 4200,
      });
    }
    app.announce(`${note}${why ? ` ${why}` : ""}`);
  }

  /** Click, Enter or "Replace…": choose one image for screen `i`. */
  pick(i: number): void {
    if (!this.active()) return;
    openFilePicker((f) => void this.addFiles([f], i, "file"));
  }

  /** The images of batch items (dragged from the rail) into screen `at` and the empty ones. */
  placeItems(at: number, ids: readonly string[]): void {
    const doc = this.app.store.getState().doc;
    if (!isBatch(doc) || !this.active()) return;
    const set = new Set(ids);
    // The design on stage can't go inside itself.
    const items = doc.items.filter((x) => set.has(x.id) && x.id !== doc.active);
    if (!items.length) {
      this.app.announce("That's the design on stage");
      return;
    }
    const slots = this.order(at).slice(0, items.length);
    const screens: ScreenSlot[] = items.map(itemScreen);
    const cur = this.scene;
    const replaced = slots.filter((i) => !!screenContent(cur, i)?.assetId);
    for (const x of items) if (x.content.assetId) this.names.set(x.content.assetId, x.name);
    const label =
      slots.length === 1
        ? `${replaced.length ? "Replace" : "Fill"} screen ${slots[0]! + 1}`
        : `Fill ${slots.length} screens`;
    const changed = this.edit((s) => {
      let next = s;
      screens.slice(0, slots.length).forEach((sc, k) => (next = placeScreen(next, slots[k]!, sc)));
      return next;
    }, label);
    if (!changed) return;
    this.flash(slots);
    const note =
      slots.length === 1
        ? `${items[0]!.name || "Image"} placed in screen ${slots[0]! + 1} of ${shownScreens(this.scene)}.`
        : `Filled ${slots.length} screens.`;
    this.report(note, "", slots, replaced);
  }

  /** Swap two screens (image, crop and its marks move together). */
  swap(a: number, b: number): void {
    const lay = this.active();
    if (!lay || a === b || Math.max(a, b) >= lay.count || Math.min(a, b) < 0) return;
    const [lo, hi] = a < b ? [a, b] : [b, a];
    if (!this.edit((s) => swapSlots(s, a, b), `Swap screens ${lo + 1} and ${hi + 1}`)) return;
    this.flash([a, b]);
    const title = `Swapped screens ${lo + 1} and ${hi + 1}`;
    this.app.toast({
      kind: "undo",
      title,
      action: { label: "Undo", run: () => this.app.store.undo() },
    });
    this.app.announce(`${title}. ${this.label(b)}.`);
  }

  /** Swap screen `i` with its neighbour (-1 before, +1 after). */
  move(i: number, dir: -1 | 1): number | null {
    const lay = this.active();
    if (!lay) return null;
    const j = i + dir;
    if (j < 0 || j >= lay.count) {
      this.app.announce(dir < 0 ? "Already the first screen" : "Already the last screen");
      return null;
    }
    this.swap(i, j);
    return j;
  }

  /** Empty screen `i` (not screen 1: that is the design's own screenshot). */
  clear(i: number): void {
    const lay = this.active();
    if (!lay || i <= 0 || i >= lay.count) return;
    const name = this.name(i);
    if (!screenContent(this.scene, i)?.assetId) return;
    if (!this.edit((s) => clearSlot(s, i), `Remove screen ${i + 1}`)) return;
    const title = `Removed ${name ?? "the image"} from screen ${i + 1}`;
    this.app.toast({
      kind: "undo",
      title,
      action: { label: "Undo", run: () => this.app.store.undo() },
      duration: 6000,
    });
    this.app.announce(`${title}. Screen ${i + 1} is empty.`);
  }

  /** Open the screen's menu (right-click, Shift+F10, the menu key, a tap on a phone). */
  openMenu(index: number, x: number, y: number): void {
    if (!this.active()) return;
    this.ui.set({ menu: { index, x, y } });
  }

  closeMenu(): void {
    if (this.ui.get().menu) this.ui.set({ menu: null });
  }
}
