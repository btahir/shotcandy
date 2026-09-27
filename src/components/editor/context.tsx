"use client";
import { createContext, useContext } from "react";
import type { EditorState } from "@/state/editor-store";
import { useEditor } from "@/state/react";
import { useStore } from "@/lib/store";
import type { EditorApp, UiState } from "./app";

export const AppContext = createContext<EditorApp | null>(null);

export function useApp(): EditorApp {
  const app = useContext(AppContext);
  if (!app) throw new Error("useApp outside <Editor>");
  return app;
}

/** Subscribe to part of the editor (scene) state. */
export function useScene<T>(selector: (s: EditorState) => T): T {
  return useEditor(useApp().store, selector);
}

/** Subscribe to part of the UI state. */
export function useUi<T>(selector: (s: UiState) => T): T {
  return useStore(useApp().ui, selector);
}
