"use client";
/** React bindings for the editor store. */
import { useSyncExternalStore } from "react";
import type { EditorState, EditorStore } from "./editor-store";

export function useEditor<T>(store: EditorStore, selector: (s: EditorState) => T): T {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(store.getState()),
  );
}
