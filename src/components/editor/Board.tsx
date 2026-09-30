"use client";
/**
 * The App Store board: every slide of the set side by side on the stage,
 * rendered live by the engine. Click to select, drop screenshots onto slides,
 * add slides at the end.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  SET_MAX_SLIDES,
  imageFromDataTransfer,
  outputSize,
  layoutScene,
  renderScene,
  setCanvasSize,
} from "@/engine";
import { useStore } from "@/lib/store";
import { Icon } from "../icons";
import { focusNextFrame } from "../ui/controls";
import { useApp, useScene, useUi } from "./context";
import { openFilePicker } from "./EmptyState";

function SlideCanvas({ index, width }: { index: number; width: number }) {
  const app = useApp();
  const set = useStore(app.sets.state, (s) => s.set);
  const template = useScene((s) => s.scene);
  const assetsVersion = useUi((s) => s.assetsVersion);
  const fonts = useUi((s) => s.fontsReady);
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || width <= 0) return;
    const id = requestAnimationFrame(() => {
      const scene = app.sets.slideScene(index, template);
      const layout = layoutScene(scene, app.resolver);
      const scale = (width * Math.min(2, window.devicePixelRatio || 1)) / layout.canvas.width;
      const out = outputSize(layout, scale);
      if (c.width !== out.width) c.width = out.width;
      if (c.height !== out.height) c.height = out.height;
      const g = c.getContext("2d");
      if (!g) return;
      renderScene(g, scene, app.resolver, { scale, cache: app.cache });
    });
    return () => cancelAnimationFrame(id);
  }, [app, index, width, set, template, assetsVersion, fonts]);
  return <canvas ref={ref} aria-hidden="true" />;
}

export function Board({ narrow = false }: { narrow?: boolean }) {
  const app = useApp();
  const set = useStore(app.sets.state, (s) => s.set);
  const selected = useStore(app.sets.state, (s) => s.selected);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [dropAt, setDropAt] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) =>
      setBox({ w: e!.contentRect.width, h: e!.contentRect.height }),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { width: W, height: H } = setCanvasSize(set);
  const n = set.slides.length;
  const canAdd = n < SET_MAX_SLIDES;
  const gap = narrow ? 12 : 18;
  const padX = narrow ? 16 : 40;
  const maxH = Math.max(120, box.h - (narrow ? 56 : 150));
  // Fit every slide in view when possible; otherwise scroll sideways.
  const fitW = (box.w - padX * 2 - gap * (n + (canAdd ? 1 : 0) - 1)) / (n + (canAdd ? 0.45 : 0));
  const slideW = Math.max(narrow ? 120 : 150, Math.min(fitW, (maxH * W) / H));
  const slideH = (slideW * H) / W;

  const onDrop = (i: number) => (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDropAt(null);
    app.ui.set({ drag: null });
    const files = Array.from(e.dataTransfer.files ?? []).filter((f) => /^image\//.test(f.type));
    if (files.length) void app.sets.setSlideImages(i, files);
    else {
      const f = imageFromDataTransfer(e.dataTransfer);
      if (f) void app.sets.setSlideImage(i, f);
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const d = e.key === "ArrowRight" ? 1 : -1;
      if (e.altKey) app.sets.moveSlide(selected, d);
      else app.sets.select(selected + d);
      focusNextFrame(() => wrapRef.current?.querySelector<HTMLElement>(".slide.on"));
    }
  };

  return (
    <div ref={wrapRef} className={`board${narrow ? " narrow" : ""}`} data-testid="board">
      <div
        className="board-strip"
        role="group"
        aria-label="Slides (arrow keys to move between them, Alt+arrows to reorder)"
        style={{ gap, padding: `0 ${padX}px` }}
        onKeyDown={onKey}
      >
        {set.slides.map((s, i) => (
          <div key={s.id} className="slide-wrap" style={{ width: slideW }}>
            <button
              type="button"
              aria-pressed={i === selected}
              tabIndex={i === selected ? 0 : -1}
              aria-label={`Slide ${i + 1}: ${s.headline || "no headline"}${s.assetId ? "" : ", no screenshot yet"}`}
              className={`slide${i === selected ? " on" : ""}${dropAt === i ? " drop" : ""}`}
              style={{ width: slideW, height: slideH }}
              data-testid={`slide-${i}`}
              onClick={() => app.sets.select(i)}
              onDoubleClick={() => openFilePicker((f) => void app.sets.setSlideImage(i, f))}
              onDragOver={(e) => {
                if (Array.from(e.dataTransfer.types).includes("Files")) {
                  e.preventDefault();
                  e.stopPropagation();
                  setDropAt(i);
                }
              }}
              onDragLeave={() => setDropAt((d) => (d === i ? null : d))}
              onDrop={onDrop(i)}
            >
              <SlideCanvas index={i} width={slideW} />
              {!s.assetId && (
                <span className="slide-empty">
                  <Icon name="upload" size="sm" />
                  Drop a screenshot
                </span>
              )}
              {app.sets.slideMismatch(i) && (
                <span className="slide-warn" data-testid={`slide-warn-${i}`}>
                  <Icon name="alert" size="xs" />
                  {set.landscape ? "Portrait shot" : "Landscape shot"}
                </span>
              )}
            </button>
            <span className="slide-num mono" aria-hidden="true">
              {i + 1}
            </span>
          </div>
        ))}
        {canAdd && (
          <div className="slide-wrap" style={{ width: slideW * 0.45 }}>
            <button
              type="button"
              className="slide-add"
              style={{ height: slideH }}
              onClick={() => app.sets.addSlide()}
              aria-label="Add a slide"
              data-testid="add-slide"
            >
              <Icon name="plus" />
              <span>Add slide</span>
            </button>
            <span className="slide-num mono" aria-hidden="true">
              {n}/{SET_MAX_SLIDES}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
