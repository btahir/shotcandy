"use client";
/** Keyboard shortcuts (docs/design/system/shortcuts.md). */
import { useEffect } from "react";
import { type Annotation, layoutScene } from "@/engine";
import { isTypingTarget } from "@/lib/platform";
import type { EditorApp, Tool } from "./app";
import { stepZoom } from "./Dock";
import { openFilePicker } from "./EmptyState";

const TOOL_KEYS: Record<string, Tool> = {
  v: "select",
  t: "text",
  a: "arrow",
  r: "rect",
  b: "redact",
};
const FRAME_CYCLE = ["none", "macos", "browser", "phone", "tablet", "laptop"];
const PAD_CYCLE = [40, 80, 120, 160, 0];

export function useShortcuts(app: EditorApp) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ui = app.ui.get();
      const mod = e.metaKey || e.ctrlKey;
      const typing = isTypingTarget(e.target);
      const key = e.key.toLowerCase();

      if (ui.modal) {
        // Modals own the keyboard; Esc still closes one that hasn't taken focus yet.
        if (e.key === "Escape") app.ui.set({ modal: null });
        return;
      }
      if (typing) {
        // Inputs keep their native undo/copy/paste.
        if (mod && key === "s" && ui.hasContent) {
          e.preventDefault();
          if (e.shiftKey) app.ui.set({ popover: "export" });
          else void app.download(document.querySelector("[data-testid=export]"));
        }
        return;
      }

      if (mod) {
        if (key === "z") {
          e.preventDefault();
          if (e.shiftKey) app.store.redo();
          else app.store.undo();
        } else if (key === "y" && e.ctrlKey) {
          e.preventDefault();
          app.store.redo();
        } else if (key === "c") {
          const sel = window.getSelection();
          if (sel && !sel.isCollapsed) return;
          e.preventDefault();
          app.copy(document.querySelector("[data-copy-anchor]"));
        } else if (key === "s") {
          e.preventDefault();
          if (!ui.hasContent) return app.nothingYet("export");
          if (e.shiftKey) app.ui.set({ popover: "export" });
          else void app.download(document.querySelector("[data-testid=export]"));
        } else if (key === "o") {
          e.preventDefault();
          openFilePicker((f) => void app.loadBlob(f, { source: "file" }));
        } else if (key === "d" && app.store.getState().selection) {
          e.preventDefault();
          app.duplicateAnnotation(app.store.getState().selection!);
        } else if (key === "0") {
          e.preventDefault();
          app.ui.set({ zoom: null, pan: { x: 0, y: 0 } });
        } else if (key === "1") {
          e.preventDefault();
          app.ui.set({ zoom: 1 });
        } else if (key === "=" || key === "+") {
          e.preventDefault();
          app.ui.set({ zoom: stepZoom(ui.zoom ?? ui.fitZoom, 1) });
        } else if (key === "-" || key === "_") {
          e.preventDefault();
          app.ui.set({ zoom: stepZoom(ui.zoom ?? ui.fitZoom, -1) });
        }
        return;
      }
      if (e.altKey) return;

      const selId = app.store.getState().selection;
      const sel = selId ? app.scene.annotations.find((a) => a.id === selId) : undefined;

      if (e.key === "Escape") {
        if (ui.popover) return app.ui.set({ popover: null });
        if (ui.editingText) return app.ui.set({ editingText: null });
        if (selId) return app.store.select(null);
        if (ui.tool !== "select") return app.setTool("select");
        return;
      }
      if (e.key === "?") {
        e.preventDefault();
        app.ui.set({ modal: "shortcuts", popover: null });
        return;
      }
      if (sel) {
        if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          app.deleteAnnotation(sel.id);
          return;
        }
        if (e.key === "Enter" && sel.kind === "text") {
          e.preventDefault();
          app.ui.set({ editingText: sel.id });
          return;
        }
        if (e.key.startsWith("Arrow")) {
          e.preventDefault();
          nudge(app, sel, e.key, e.shiftKey ? 10 : 1);
          return;
        }
        if (e.key === "Tab") {
          const list = app.scene.annotations;
          const i = list.findIndex((a) => a.id === sel.id);
          const next = list[(i + (e.shiftKey ? -1 : 1) + list.length) % list.length];
          if (next && list.length > 1) {
            e.preventDefault();
            app.store.select(next.id);
          }
          return;
        }
      }
      if (TOOL_KEYS[key] && !e.shiftKey) {
        if (!ui.hasContent) return;
        app.setTool(TOOL_KEYS[key]);
        return;
      }
      switch (key) {
        case "g":
          app.ui.set({ modal: "gallery", popover: null });
          break;
        case "[":
          app.stepStyle(-1);
          break;
        case "]":
          app.stepStyle(1);
          break;
        case "s":
          app.shuffle();
          break;
        case "k":
          app.ui.set({ popover: ui.popover === "size" ? null : "size" });
          break;
        case "m":
          if (app.scene.animation) app.togglePlay();
          break;
        case "f": {
          const f = app.scene.card.frame;
          if (e.shiftKey) {
            const order = ["auto", "light", "dark"] as const;
            const next = order[(order.indexOf(f.theme) + 1) % order.length]!;
            app.set(["card", "frame", "theme"], next);
            app.announce(
              next === "auto" ? "Frame theme: auto, matches your screenshot" : `Frame ${next}`,
            );
          } else {
            const next = FRAME_CYCLE[(FRAME_CYCLE.indexOf(f.id) + 1) % FRAME_CYCLE.length]!;
            app.set(["card", "frame", "id"], next);
            app.announce(`Frame: ${next}`);
          }
          break;
        }
        case "p": {
          const cur = app.scene.canvas.padding;
          const next = PAD_CYCLE.find((p) => p > cur) ?? 0;
          app.set(["canvas", "padding"], next === 160 && cur >= 160 ? 0 : next);
          app.announce(`Padding ${next}`);
          break;
        }
        default:
          if (/^[1-6]$/.test(key)) {
            const tiles = document.querySelectorAll<HTMLButtonElement>(
              "[data-testid=styles-tray] button.preset, .rail button.preset",
            );
            tiles[Number(key) - 1]?.click();
          }
      }
    };

    const onPaste = (e: ClipboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (app.ui.get().modal) return;
      const dt = e.clipboardData;
      if (!dt) return;
      let file: File | null = null;
      for (let i = 0; i < (dt.files?.length ?? 0); i++) {
        const f = dt.files[i]!;
        if (f.type.startsWith("image/") || f.type === "") {
          file = f;
          break;
        }
      }
      if (!file)
        for (let i = 0; i < (dt.items?.length ?? 0); i++) {
          const it = dt.items[i]!;
          if (it.kind === "file") {
            file = it.getAsFile();
            if (file) break;
          }
        }
      if (file) {
        e.preventDefault();
        void app.loadBlob(file, { source: "paste" });
        return;
      }
      const text = dt.getData?.("text/plain");
      if (text) app.pastedText(text);
    };

    window.addEventListener("keydown", onKey);
    document.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("paste", onPaste);
    };
  }, [app]);
}

function nudge(app: EditorApp, a: Annotation, key: string, px: number) {
  const layout = layoutScene(app.scene, app.resolver);
  const perU =
    a.anchor === "content" ? 1 / (layout.card.content.width * layout.k) : 1 / layout.canvas.width;
  const perV =
    a.anchor === "content" ? 1 / (layout.card.content.height * layout.k) : 1 / layout.canvas.height;
  const du = key === "ArrowLeft" ? -px * perU : key === "ArrowRight" ? px * perU : 0;
  const dv = key === "ArrowUp" ? -px * perV : key === "ArrowDown" ? px * perV : 0;
  const patch =
    a.kind === "arrow"
      ? { x1: a.x1 + du, y1: a.y1 + dv, x2: a.x2 + du, y2: a.y2 + dv }
      : { x: a.x + du, y: a.y + dv };
  app.updateAnnotation(a.id, patch as Partial<Annotation>, `nudge:${a.id}`);
}
