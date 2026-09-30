"use client";
/** React bindings for the editor store. */
import { useSyncExternalStore } from "react";
import type { EditorState, EditorStore } from "./editor-store";

export function useEditor<T, D>(store: EditorStore<D>, selector: (s: EditorState<D>) => T): T {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(store.getState()),
  );
}
