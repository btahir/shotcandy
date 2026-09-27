/**
 * Editor state: the current scene with undo/redo, framework-free.
 *
 * - The scene is immutable; updates produce a new scene (see engine setIn/patch
 *   helpers), so subscribers can compare by reference.
 * - Rapid updates that share a `coalesce` key (e.g. dragging a slider) merge into
 *   one history entry, so undo jumps back to before the drag, not one pixel.
 * - React binds via useSyncExternalStore (see ./react.ts); nothing here imports React.
 */
import type { Scene } from "@/engine";

export interface EditorState {
  scene: Scene;
  /** Id of the selected annotation, if any. */
  selection: string | null;
  canUndo: boolean;
  canRedo: boolean;
}

export interface UpdateOptions {
  /** Updates with the same key within `coalesceMs` merge into one undo step. */
  coalesce?: string;
  /** Skip history entirely (e.g. transient previews). */
  transient?: boolean;
}

/** Undo/redo stacks, kept aside while another design is shown (mode switches). */
export interface EditorHistory {
  past: Scene[];
  future: Scene[];
}

export interface EditorStore {
  getState(): EditorState;
  subscribe(listener: () => void): () => void;
  update(recipe: (scene: Scene) => Scene, opts?: UpdateOptions): void;
  /** Replace the scene and reset history (loading a design or project), or restore a saved history. */
  reset(scene: Scene, history?: EditorHistory): void;
  /** A copy of the undo/redo stacks. */
  history(): EditorHistory;
  select(id: string | null): void;
  undo(): void;
  redo(): void;
}

export interface EditorStoreOptions {
  historyLimit?: number;
  coalesceMs?: number;
  now?: () => number;
}

export function createEditorStore(initial: Scene, opts: EditorStoreOptions = {}): EditorStore {
  const limit = opts.historyLimit ?? 200;
  const coalesceMs = opts.coalesceMs ?? 600;
  const now = opts.now ?? (() => Date.now());
  let past: Scene[] = [];
  let future: Scene[] = [];
  let lastKey: string | null = null;
  let lastTime = 0;
  let state: EditorState = { scene: initial, selection: null, canUndo: false, canRedo: false };
  const listeners = new Set<() => void>();

  const commit = (next: Partial<EditorState>) => {
    state = { ...state, ...next, canUndo: past.length > 0, canRedo: future.length > 0 };
    for (const l of listeners) l();
  };

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    update(recipe, o = {}) {
      const prev = state.scene;
      const next = recipe(prev);
      if (next === prev) return;
      if (!o.transient) {
        const t = now();
        const merge =
          o.coalesce !== undefined && o.coalesce === lastKey && t - lastTime < coalesceMs;
        if (!merge) {
          past.push(prev);
          if (past.length > limit) past = past.slice(past.length - limit);
        }
        future = [];
        lastKey = o.coalesce ?? null;
        lastTime = t;
      }
      const selection =
        state.selection && next.annotations.some((a) => a.id === state.selection)
          ? state.selection
          : null;
      commit({ scene: next, selection });
    },
    reset(scene, history) {
      past = history ? history.past.slice() : [];
      future = history ? history.future.slice() : [];
      lastKey = null;
      commit({ scene, selection: null });
    },
    history() {
      return { past: past.slice(), future: future.slice() };
    },
    select(id) {
      if (id !== state.selection) commit({ selection: id });
    },
    undo() {
      const prev = past.pop();
      if (!prev) return;
      future.push(state.scene);
      lastKey = null;
      commit({ scene: prev });
    },
    redo() {
      const next = future.pop();
      if (!next) return;
      past.push(state.scene);
      lastKey = null;
      commit({ scene: next });
    },
  };
}
