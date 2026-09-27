"use client";
/** The editor root: wires the controller, global input, layout and modals. */
import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
// Editor-only styles (motion, modes), kept out of the landing pages' CSS.
import "@/app/motion.css";
import "@/app/modes.css";
import "@/app/controls.css";
import { imageFromDataTransfer } from "@/engine";
import { EditorApp } from "./app";
import { AppContext, useUi } from "./context";
import { RecentsDialog, ShortcutsSheet } from "./Dialogs";
import { Gallery } from "./Gallery";
import { Header } from "./Header";
import { Inspector } from "./Inspector";
import { MobileEditor } from "./Mobile";
import { useShortcuts } from "./shortcuts";
import { Stage } from "./Stage";

const NARROW = "(max-width: 767px)";

/** null while prerendering/hydrating: both layouts ship in the HTML and CSS picks one. */
function useNarrow(): boolean | null {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(NARROW);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(NARROW).matches,
    () => null,
  );
}

const OK_TYPES = ["image/png", "image/jpeg", "image/webp", ""];

function useDragAndDrop(app: EditorApp) {
  useEffect(() => {
    let depth = 0;
    const kind = (dt: DataTransfer | null): "ok" | "bad" | null => {
      if (!dt || !Array.from(dt.types ?? []).includes("Files")) return null;
      const items = Array.from(dt.items ?? []).filter((i) => i.kind === "file");
      if (!items.length) return "ok";
      return items.some((i) => OK_TYPES.includes(i.type)) ? "ok" : "bad";
    };
    const enter = (e: DragEvent) => {
      const k = kind(e.dataTransfer);
      if (!k) return;
      e.preventDefault();
      depth++;
      if (!app.ui.get().modal) app.ui.set({ drag: k });
    };
    const over = (e: DragEvent) => {
      if (kind(e.dataTransfer)) {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      }
    };
    const leave = (e: DragEvent) => {
      if (!kind(e.dataTransfer)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) app.ui.set({ drag: null });
    };
    const drop = (e: DragEvent) => {
      depth = 0;
      app.ui.set({ drag: null });
      if (!e.dataTransfer) return;
      if (e.dataTransfer.types.includes("text/x-annotation")) return;
      const f = imageFromDataTransfer(e.dataTransfer);
      const any = e.dataTransfer.files?.[0];
      if (f || any) e.preventDefault();
      if (f) void app.loadBlob(f, { source: "drop" });
      else if (any)
        app.toast({
          kind: "error",
          title: "Couldn't read that file",
          detail: "Drop a PNG, JPEG or WebP image.",
          prose: true,
        });
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, [app]);
}

/** Screen-reader announcements; portalled so an open modal (which inerts the page) doesn't mute it. */
function LiveRegion() {
  const msg = useUi((s) => s.announce);
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const el = document.createElement("div");
    el.setAttribute("data-modal-keep", "");
    document.body.appendChild(el);
    setHost(el);
    return () => el.remove();
  }, []);
  const region = (
    <div className="sr-only" role="status" aria-live="polite" data-testid="status">
      {msg}
    </div>
  );
  return host ? createPortal(region, host) : region;
}

/** The page's h1 once the empty state (which carries its own) is gone. */
function EditorHeading() {
  const mode = useUi((s) => s.mode);
  const hasContent = useUi((s) => s.hasContent);
  if (mode === "screenshot" && !hasContent) return null;
  return <h1 className="sr-only">Shotcandy editor</h1>;
}

export function Editor() {
  const [app] = useState(() => new EditorApp());
  const narrow = useNarrow();

  useEffect(() => {
    void app.init();
    const w = window as unknown as Record<string, unknown>;
    w.__shotcandy = {
      app,
      store: app.store,
      library: app.library,
      exporter: app.exporter,
      get db() {
        return app.db;
      },
      get ready() {
        return app.ui.get().dbReady;
      },
      loadBlob: (b: Blob) => app.loadBlob(b),
    };
  }, [app]);

  useShortcuts(app);
  useDragAndDrop(app);

  return (
    <AppContext.Provider value={app}>
      {narrow !== false && (
        <div className={narrow === null ? "only-narrow" : undefined}>
          <MobileEditor />
        </div>
      )}
      {narrow !== true && (
        <div className={narrow === null ? "only-wide" : undefined}>
          <div className="app" data-layout="wide">
            <Header />
            <Stage />
            <Inspector />
          </div>
        </div>
      )}
      <Gallery narrow={!!narrow} />
      <ShortcutsSheet />
      <RecentsDialog />
      <EditorHeading />
      <LiveRegion />
    </AppContext.Provider>
  );
}
