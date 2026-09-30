/**
 * Editor state: the current document with undo/redo, framework-free.
 *
 * - The document is immutable; updates produce a new one (see engine setIn/patch
 *   helpers), so subscribers can compare by reference.
 * - Most of the editor edits "the scene": the design on the stage. A document
 *   is usually that scene itself, but it can be larger (a batch of images that
 *   share one style). A lens maps the document to the scene on the stage and
 *   routes scene edits back into the document, so every `update(scene => …)`
 *   call site works unchanged and one history covers everything.
 * - Rapid updates that share a `coalesce` key (e.g. dragging a slider) merge into
 *   one history entry, so undo jumps back to before the drag, not one pixel.
 * - React binds via useSyncExternalStore (see ./react.ts); nothing here imports React.
 */
import type { Scene } from "@/engine";

export interface EditorState<D = Scene> {
  /** The scene on the stage (the document itself, or the part of it being edited). */
  scene: Scene;
  /** The whole document. */
  doc: D;
  /** Id of the selected annotation, if any. */
  selection: string | null;
  canUndo: boolean;
  canRedo: boolean;
  /** Name of the step Undo would revert, when it has one ("Remove 3 images"). */
  undoLabel: string | null;
  redoLabel: string | null;
}

export interface UpdateOptions {
  /** Updates with the same key within `coalesceMs` merge into one undo step. */
  coalesce?: string;
  /** Skip history entirely (e.g. transient previews). */
  transient?: boolean;
  /** Name of the step, for "Undo …" labels. */
  label?: string;
  /** Merge window for `coalesce`, overriding the store default (Infinity: always merge). */
  coalesceMs?: number;
}

/** Undo/redo stacks, kept aside while another design is shown (mode switches). */
export interface EditorHistory<D = Scene> {
  past: D[];
  future: D[];
  pastLabels?: (string | null)[];
  futureLabels?: (string | null)[];
}

/** Maps a document to the scene being edited, and scene edits back into the document. */
export interface DocLens<D> {
  scene(doc: D): Scene;
  /** Fold an edited scene (`next`, made from `prev`) back into the document. */
  update(doc: D, next: Scene, prev: Scene): D;
}

export interface EditorStore<D = Scene> {
  getState(): EditorState<D>;
  subscribe(listener: () => void): () => void;
  update(recipe: (scene: Scene) => Scene, opts?: UpdateOptions): void;
  /** Change the document itself (batch operations: add, remove, reorder…). */
  updateDoc(recipe: (doc: D) => D, opts?: UpdateOptions): void;
  /** Replace the document and reset history (loading a design or project), or restore a saved history. */
  reset(doc: D, history?: EditorHistory<D>): void;
  /** A copy of the undo/redo stacks. */
  history(): EditorHistory<D>;
  select(id: string | null): void;
  undo(): void;
  redo(): void;
}

export interface EditorStoreOptions {
  historyLimit?: number;
  coalesceMs?: number;
  now?: () => number;
}

const IDENTITY: DocLens<Scene> = { scene: (d) => d, update: (_d, next) => next };

export function createEditorStore(initial: Scene, opts?: EditorStoreOptions): EditorStore<Scene>;
export function createEditorStore<D>(
  initial: D,
  opts: EditorStoreOptions & { lens: DocLens<D> },
): EditorStore<D>;
export function createEditorStore<D>(
  initial: D,
  opts: EditorStoreOptions & { lens?: DocLens<D> } = {},
): EditorStore<D> {
  const lens = (opts.lens ?? IDENTITY) as DocLens<D>;
  const limit = opts.historyLimit ?? 200;
  const coalesceMs = opts.coalesceMs ?? 600;
  const now = opts.now ?? (() => Date.now());
  let past: D[] = [];
  let pastLabels: (string | null)[] = [];
  let future: D[] = [];
  let futureLabels: (string | null)[] = [];
  let lastKey: string | null = null;
  let lastTime = 0;
  let state: EditorState<D> = {
    scene: lens.scene(initial),
    doc: initial,
    selection: null,
    canUndo: false,
    canRedo: false,
    undoLabel: null,
    redoLabel: null,
  };
  const listeners = new Set<() => void>();

  const commit = (doc: D, next: Partial<EditorState<D>> = {}) => {
    const scene = doc === state.doc ? state.scene : lens.scene(doc);
    state = {
      ...state,
      ...next,
      doc,
      scene,
      canUndo: past.length > 0,
      canRedo: future.length > 0,
      undoLabel: pastLabels[pastLabels.length - 1] ?? null,
      redoLabel: futureLabels[futureLabels.length - 1] ?? null,
    };
    for (const l of listeners) l();
  };

  const record = (prev: D, o: UpdateOptions) => {
    if (o.transient) return;
    const t = now();
    const windowMs = o.coalesceMs ?? coalesceMs;
    const merge = o.coalesce !== undefined && o.coalesce === lastKey && t - lastTime < windowMs;
    if (!merge) {
      past.push(prev);
      pastLabels.push(o.label ?? null);
      if (past.length > limit) {
        past = past.slice(past.length - limit);
        pastLabels = pastLabels.slice(pastLabels.length - limit);
      }
    }
    future = [];
    futureLabels = [];
    lastKey = o.coalesce ?? null;
    lastTime = t;
  };

  const apply = (doc: D, o: UpdateOptions) => {
    const prev = state.doc;
    if (doc === prev) return;
    record(prev, o);
    const scene = lens.scene(doc);
    const selection =
      state.selection && scene.annotations.some((a) => a.id === state.selection)
        ? state.selection
        : null;
    // Compute the scene once here so commit doesn't do it again.
    state = { ...state, doc, scene };
    commit(doc, { selection });
  };

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    update(recipe, o = {}) {
      const prevScene = state.scene;
      const next = recipe(prevScene);
      if (next === prevScene) return;
      apply(lens.update(state.doc, next, prevScene), o);
    },
    updateDoc(recipe, o = {}) {
      const next = recipe(state.doc);
      if (next === state.doc) return;
      // A document change (selecting another image, reordering) ends any slider drag.
      if (o.transient) lastKey = null;
      apply(next, o);
    },
    reset(doc, history) {
      past = history ? history.past.slice() : [];
      future = history ? history.future.slice() : [];
      pastLabels = history?.pastLabels?.slice() ?? past.map(() => null);
      futureLabels = history?.futureLabels?.slice() ?? future.map(() => null);
      lastKey = null;
      commit(doc, { selection: null });
    },
    history() {
      return {
        past: past.slice(),
        future: future.slice(),
        pastLabels: pastLabels.slice(),
        futureLabels: futureLabels.slice(),
      };
    },
    select(id) {
      if (id !== state.selection) commit(state.doc, { selection: id });
    },
    undo() {
      const prev = past.pop();
      if (prev === undefined) return;
      const label = pastLabels.pop() ?? null;
      future.push(state.doc);
      futureLabels.push(label);
      lastKey = null;
      commit(prev);
    },
    redo() {
      const next = future.pop();
      if (next === undefined) return;
      const label = futureLabels.pop() ?? null;
      past.push(state.doc);
      pastLabels.push(label);
      lastKey = null;
      commit(next);
    },
  };
}
