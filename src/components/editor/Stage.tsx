"use client";
/**
 * The stage: dot-grid tray with a tint of the screenshot's colour, the live
 * preview canvas (rendered by the engine at display resolution), zoom and pan,
 * crop-corner selection marks with the output size, the annotation overlay,
 * the dock, toasts and the empty/drag-over moments.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { type Scene, layoutScene, outputSize, renderScene } from "@/engine";
import { fillDominant } from "@/lib/fill-css";
import { AnnotationLayer } from "./AnnotationLayer";
import { useApp, useScene, useUi } from "./context";
import { Dock, ZoomControl } from "./Dock";
import { DropVeil, EmptyState } from "./EmptyState";
import { Toasts } from "./Toasts";

const MAX_PREVIEW_SIDE = 8192;
const MAX_PREVIEW_AREA = 36_000_000;

export function Stage({ narrow = false }: { narrow?: boolean }) {
  const app = useApp();
  const scene = useScene((s) => s.scene);
  const selection = useScene((s) => s.selection);
  const hasImage = useUi((s) => s.hasImage);
  const zoomPref = useUi((s) => s.zoom);
  const pan = useUi((s) => s.pan);
  const tool = useUi((s) => s.tool);
  const landing = useUi((s) => s.landing);
  const xfade = useUi((s) => s.xfade);
  const editing = useUi((s) => s.editingText);
  const assetsVersion = useUi((s) => s.assetsVersion);
  const fontsReady = useUi((s) => s.fontsReady);
  const stageFocus = useUi((s) => s.stageFocus);
  const stageRef = useRef<HTMLDivElement>(null);
  const compRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [anim, setAnim] = useState<"" | "landing" | "xfade">("");
  const [spaceDown, setSpaceDown] = useState(false);
  const [panning, setPanning] = useState(false);

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const r = e!.contentRect;
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Built-in wallpapers load on demand.
  useEffect(() => app.ensureBuiltins(scene), [app, scene]);

  const layout = useMemo(
    () => layoutScene(scene, app.library),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scene, app, assetsVersion],
  );
  const W = layout.canvas.width;
  const H = layout.canvas.height;
  const padX = narrow ? 32 : 150;
  const padY = narrow ? 40 : 190;
  const fit =
    size.w > 0
      ? Math.max(0.02, Math.min((size.w - padX) / W, (size.h - padY) / H, narrow ? 2 : 1.5))
      : 0.5;
  const zoom = zoomPref ?? fit;

  useEffect(() => {
    if (Math.abs(app.ui.get().fitZoom - fit) > 1e-4) app.ui.set({ fitZoom: fit });
  }, [app, fit]);

  const dispW = W * zoom;
  const dispH = H * zoom;
  const lift = narrow ? 0 : 32;
  const left = Math.round((size.w - dispW) / 2 + pan.x);
  const top = Math.round((size.h - dispH) / 2 - lift + pan.y);

  // Render the preview (coalesced to one frame).
  const renderScene_ = useMemo(() => {
    if (!editing) return scene;
    return {
      ...scene,
      annotations: scene.annotations.map((a) =>
        a.id === editing && a.kind === "text" ? { ...a, text: "" } : a,
      ),
    } as Scene;
  }, [scene, editing]);

  useEffect(() => {
    if (!hasImage) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const id = requestAnimationFrame(() => {
      const dpr = window.devicePixelRatio || 1;
      let s = zoom * dpr;
      const long = Math.max(W, H) * s;
      if (long > MAX_PREVIEW_SIDE) s *= MAX_PREVIEW_SIDE / long;
      if (W * H * s * s > MAX_PREVIEW_AREA) s = Math.sqrt(MAX_PREVIEW_AREA / (W * H));
      const out = outputSize(layout, s);
      if (canvas.width !== out.width) canvas.width = out.width;
      if (canvas.height !== out.height) canvas.height = out.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const t0 = performance.now();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      renderScene(ctx, renderScene_, app.library, { scale: s, cache: app.cache });
      const ms = performance.now() - t0;
      (window as unknown as { __shotcandyRenderMs?: number }).__shotcandyRenderMs = ms;
      app.emit("rendered", ms);
    });
    return () => cancelAnimationFrame(id);
  }, [app, renderScene_, layout, zoom, W, H, hasImage, fontsReady, assetsVersion]);

  // Signature moments: first-paste landing and style cross-fades.
  const prevLanding = useRef(landing);
  const prevX = useRef(xfade);
  useEffect(() => {
    if (landing !== prevLanding.current) {
      prevLanding.current = landing;
      setAnim("landing");
      const t = setTimeout(() => setAnim(""), 460);
      return () => clearTimeout(t);
    }
    if (xfade !== prevX.current) {
      prevX.current = xfade;
      setAnim("xfade");
      const t = setTimeout(() => setAnim(""), 380);
      return () => clearTimeout(t);
    }
  }, [landing, xfade]);

  // Move focus to the stage after an image lands so ⌘C works immediately.
  useEffect(() => {
    if (stageFocus > 0 && !narrow)
      stageRef.current?.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
  }, [stageFocus, narrow]);

  // Space to pan.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, button, [role=slider], [contenteditable]")) return;
      setSpaceDown(true);
      e.preventDefault();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceDown(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // Wheel: pinch/ctrl zooms around the cursor; plain wheel pans when zoomed in.
  const zoomAt = useCallback(
    (next: number, cx: number, cy: number) => {
      const z0 = app.ui.get().zoom ?? app.ui.get().fitZoom;
      const z1 = Math.max(0.05, Math.min(8, next));
      const p = app.ui.get().pan;
      // Keep the point under the cursor fixed.
      const ox = (size.w - W * z0) / 2 + p.x;
      const oy = (size.h - H * z0) / 2 - lift + p.y;
      const u = (cx - ox) / z0;
      const v = (cy - oy) / z0;
      const nox = cx - u * z1;
      const noy = cy - v * z1;
      app.ui.set({
        zoom: z1,
        pan: { x: nox - (size.w - W * z1) / 2, y: noy - (size.h - H * z1) / 2 + lift },
      });
    },
    [app, size, W, H, lift],
  );

  useEffect(() => {
    const el = stageRef.current;
    if (!el || !hasImage) return;
    const onWheel = (e: WheelEvent) => {
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const z0 = app.ui.get().zoom ?? app.ui.get().fitZoom;
        zoomAt(z0 * Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top);
      } else {
        const z = app.ui.get().zoom;
        if (z !== null && z > app.ui.get().fitZoom * 1.01) {
          e.preventDefault();
          const p = app.ui.get().pan;
          app.ui.set({ pan: { x: p.x - e.deltaX, y: p.y - e.deltaY } });
        }
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [app, hasImage, zoomAt]);

  // Pointer: pan (space / middle button / background when zoomed), pinch, deselect.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    kind: "pan" | "pinch";
    x: number;
    y: number;
    pan: { x: number; y: number };
    dist?: number;
    zoom?: number;
  } | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!hasImage) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const onComp = compRef.current?.contains(e.target as Node);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = {
        kind: "pinch",
        x: (a!.x + b!.x) / 2,
        y: (a!.y + b!.y) / 2,
        pan: app.ui.get().pan,
        dist: Math.hypot(a!.x - b!.x, a!.y - b!.y),
        zoom: app.ui.get().zoom ?? app.ui.get().fitZoom,
      };
      return;
    }
    const zoomed = (app.ui.get().zoom ?? fit) > fit * 1.01;
    if (spaceDown || e.button === 1 || (zoomed && !onComp && tool === "select")) {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      gesture.current = { kind: "pan", x: e.clientX, y: e.clientY, pan: app.ui.get().pan };
      setPanning(true);
      return;
    }
    if (e.target === e.currentTarget || !onComp) {
      if (selection) app.store.select(null);
      if (editing) app.ui.set({ editingText: null });
    } else if (onComp && tool === "select" && selection) {
      // Clicking the composition (not an annotation) deselects.
      app.store.select(null);
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "pan") {
      app.ui.set({ pan: { x: g.pan.x + e.clientX - g.x, y: g.pan.y + e.clientY - g.y } });
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      const r = stageRef.current!.getBoundingClientRect();
      const cx = (a!.x + b!.x) / 2;
      const cy = (a!.y + b!.y) / 2;
      zoomAt(g.zoom! * (d / g.dist!), cx - r.left, cy - r.top);
    }
  };

  const endPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2 && gesture.current?.kind === "pinch") gesture.current = null;
    if (gesture.current?.kind === "pan") {
      gesture.current = null;
      setPanning(false);
    }
  };

  const palette =
    scene.content.kind === "image" && scene.content.assetId
      ? (app.library.get(scene.content.assetId)?.palette ?? null)
      : null;
  const tint = hasImage
    ? (palette?.dominant.hex ?? fillDominant(scene.background.fill, palette) ?? "transparent")
    : "#FF8FAB";

  const showMarks = hasImage && !selection && tool === "select" && !editing && !narrow;
  const zoomed = zoom > fit * 1.01;

  return (
    <main
      ref={stageRef}
      className={`stage${spaceDown || zoomed ? " can-pan" : ""}${panning ? " panning" : ""}`}
      style={{ ["--tint" as string]: tint }}
      tabIndex={hasImage ? 0 : -1}
      aria-label={hasImage ? "Canvas. Press ⌘C to copy the image" : "Canvas"}
      data-testid="stage"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onDoubleClick={(e) => {
        if (hasImage && !compRef.current?.contains(e.target as Node) && tool === "select")
          app.copy(e.currentTarget.ownerDocument.querySelector("[data-copy-anchor]"));
      }}
    >
      {!hasImage && <EmptyState narrow={narrow} />}
      {hasImage && (
        <>
          <div
            ref={compRef}
            className={`comp${anim ? ` ${anim}` : ""}`}
            style={{ left, top, width: dispW, height: dispH }}
          >
            <canvas
              ref={canvasRef}
              className="preview"
              data-testid="preview"
              role="img"
              aria-label={`Preview, ${W} by ${H} pixels`}
            />
          </div>
          {showMarks && (
            <div
              className={`sel-box${anim === "landing" ? " late" : ""}`}
              style={{ left, top, width: dispW, height: dispH }}
              aria-hidden="true"
            >
              <i />
              <i />
              <i />
              <i />
              {!narrow && (
                <span className="size-tag" data-testid="size-tag">
                  {W} × {H}
                </span>
              )}
            </div>
          )}
          <AnnotationLayer geo={{ layout, zoom }} left={left} top={top} compRef={compRef} />
          {!narrow && <Dock />}
        </>
      )}
      {!narrow && <ZoomControl disabled={!hasImage} />}
      <Toasts />
      <DropVeil />
    </main>
  );
}
