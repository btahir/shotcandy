"use client";
/**
 * On-canvas annotation editing: hit areas, selection outlines and handles
 * (constant screen size at any zoom), move/resize/bend by dragging, drawing
 * new annotations with the dock tools, and inline text editing. Everything
 * edits the scene model; the canvas renderer draws the result.
 */
import {
  type PointerEvent as RPE,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  type Annotation,
  type AnnotationAnchor,
  type ArrowAnnotation,
  type Point,
  type RectAnnotation,
  type RedactAnnotation,
  type TextAnnotation,
  getFont,
} from "@/engine";
import { useApp, useScene, useUi } from "./context";
import {
  type Geo,
  anchorSize,
  arrowPoints,
  curveFromMid,
  fromScreen,
  quad,
  textBox,
  toScreen,
} from "./geometry";

type Handle =
  "move" | "p1" | "p2" | "mid" | "size" | "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

interface Drag {
  id: string;
  handle: Handle;
  start: Point;
  orig: Annotation;
  pointerId: number;
  moved: boolean;
  creating?: boolean;
}

const pts = (p: Point[]) => p.map((q) => `${q.x},${q.y}`).join(" ");

export function AnnotationLayer({
  geo,
  left,
  top,
  compRef,
}: {
  geo: Geo;
  left: number;
  top: number;
  compRef: RefObject<HTMLDivElement | null>;
}) {
  const app = useApp();
  const annotations = useScene((s) => s.scene.annotations);
  const selection = useScene((s) => s.selection);
  const tool = useUi((s) => s.tool);
  const editing = useUi((s) => s.editingText);
  const drag = useRef<Drag | null>(null);
  const [, force] = useState(0);

  const W = geo.layout.canvas.width * geo.zoom;
  const H = geo.layout.canvas.height * geo.zoom;

  const local = (e: { clientX: number; clientY: number }): Point => {
    const r = compRef.current?.getBoundingClientRect();
    return r ? { x: e.clientX - r.left, y: e.clientY - r.top } : { x: 0, y: 0 };
  };

  const begin = (e: RPE<Element>, a: Annotation, handle: Handle) => {
    if (e.button !== 0 || tool !== "select") return;
    e.stopPropagation();
    e.preventDefault();
    app.store.select(a.id);
    if (editing && editing !== a.id) app.ui.set({ editingText: null });
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current = {
      id: a.id,
      handle,
      start: local(e),
      orig: a,
      pointerId: e.pointerId,
      moved: false,
    };
  };

  const onMove = (e: RPE<Element>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const p = local(e);
    if (!d.moved && Math.hypot(p.x - d.start.x, p.y - d.start.y) < 2) return;
    d.moved = true;
    const patch = dragPatch(geo, d, p, e.shiftKey, e.altKey);
    if (patch) app.updateAnnotation(d.id, patch, `drag:${d.id}:${d.handle}`);
  };

  const onUp = (e: RPE<Element>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    if (d.creating) finishCreate(d, local(e));
    force((n) => n + 1);
  };

  const finishCreate = (d: Drag, p: Point) => {
    const a = app.scene.annotations.find((x) => x.id === d.id);
    if (!a) return;
    const tiny = Math.hypot(p.x - d.start.x, p.y - d.start.y) < 10;
    if (tiny) {
      if (a.kind === "arrow") {
        const S = anchorSize(geo, a.anchor);
        const dx = (0.18 * S.w) / S.w;
        const dy = (0.12 * S.w) / S.h;
        app.updateAnnotation(
          a.id,
          { x2: a.x1 + dx, y2: a.y1 + dy } as Partial<Annotation>,
          `create:${a.id}`,
        );
      } else if (a.kind === "rect" || a.kind === "redact") {
        const w = a.kind === "redact" ? 0.22 : 0.28;
        const h = a.kind === "redact" ? 0.07 : 0.16;
        app.updateAnnotation(
          a.id,
          { x: a.x - w / 2, y: a.y - h / 2, w, h } as Partial<Annotation>,
          `create:${a.id}`,
        );
      }
    }
    app.setTool("select");
    app.store.select(a.id);
  };

  // Drawing with a tool: capture layer over the whole stage.
  const onCreateDown = (e: RPE<HTMLDivElement>) => {
    if (e.button !== 0 || tool === "select") return;
    e.preventDefault();
    e.stopPropagation();
    const p = local(e);
    const c = fromScreen(geo, "content", p.x, p.y);
    const inside = !!c && c.x >= 0 && c.x <= 1 && c.y >= 0 && c.y <= 1;
    let anchor: AnnotationAnchor = "content";
    if (!inside && (tool === "text" || tool === "arrow")) anchor = "canvas";
    const n = fromScreen(geo, anchor, p.x, p.y);
    if (!n) return;
    const clampC = (v: number) =>
      anchor === "content" && tool !== "text" && tool !== "arrow" ? Math.min(1, Math.max(0, v)) : v;
    const x = clampC(n.x);
    const y = clampC(n.y);
    let id: string;
    if (tool === "text") {
      id = app.addAnnotation("text", { anchor, x, y } as Partial<Annotation>);
      app.setTool("select");
      app.store.select(id);
      app.ui.set({ editingText: id });
      return;
    }
    const key = `create:${Date.now()}`;
    if (tool === "arrow")
      id = app.addAnnotation(
        "arrow",
        { anchor, x1: x, y1: y, x2: x, y2: y } as Partial<Annotation>,
        {
          coalesce: key,
        },
      );
    else
      id = app.addAnnotation(
        tool === "redact" ? "redact" : "rect",
        { anchor: "content", x, y, w: 0, h: 0 } as Partial<Annotation>,
        {
          coalesce: key,
        },
      );
    const orig = app.scene.annotations.find((a) => a.id === id)!;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      id,
      handle: tool === "arrow" ? "p2" : "se",
      start: p,
      orig,
      pointerId: e.pointerId,
      moved: true,
      creating: true,
    };
    // Coalesce the whole creation into one undo step.
    lastCreateKey.current = key;
  };
  const lastCreateKey = useRef<string>("");

  const onCreateMove = (e: RPE<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || !d.creating) return;
    const patch = dragPatch(geo, d, local(e), e.shiftKey, e.altKey);
    if (patch) app.updateAnnotation(d.id, patch, lastCreateKey.current);
  };

  const hs = 16; // handle diameter (screen px, constant at any zoom)

  return (
    <>
      {tool !== "select" && (
        <div
          className={`ann-capture ${tool === "text" ? "text-cursor" : "draw-cursor"}`}
          style={{ position: "absolute", inset: 0, zIndex: 7 }}
          onPointerDown={onCreateDown}
          onPointerMove={onCreateMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          aria-hidden="true"
        />
      )}
      <svg
        className="ann-layer"
        style={{ left, top, width: W, height: H, pointerEvents: "none" }}
        width={W}
        height={H}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        aria-hidden="true"
      >
        {annotations.map((a) => {
          const sel = a.id === selection;
          if (editing === a.id) return null;
          if (a.kind === "arrow")
            return (
              <ArrowShape key={a.id} a={a} geo={geo} sel={sel} tool={tool} begin={begin} hs={hs} />
            );
          if (a.kind === "text")
            return (
              <TextShape key={a.id} a={a} geo={geo} sel={sel} tool={tool} begin={begin} hs={hs} />
            );
          return (
            <BoxShape key={a.id} a={a} geo={geo} sel={sel} tool={tool} begin={begin} hs={hs} />
          );
        })}
      </svg>
      {editing && (
        <TextEditor
          key={editing}
          geo={geo}
          left={left}
          top={top}
          a={annotations.find((x) => x.id === editing) as TextAnnotation | undefined}
        />
      )}
    </>
  );
}

type ShapeProps<T> = {
  a: T;
  geo: Geo;
  sel: boolean;
  tool: string;
  hs: number;
  begin: (e: RPE<Element>, a: Annotation, h: Handle) => void;
};

function Dot({
  p,
  hs,
  mid,
  onDown,
  label,
}: {
  p: Point;
  hs: number;
  mid?: boolean;
  onDown: (e: RPE<Element>) => void;
  label: string;
}) {
  const r = mid ? 6 : hs / 2;
  return (
    <circle
      className={`handle${mid ? " mid" : ""}`}
      cx={p.x}
      cy={p.y}
      r={r}
      onPointerDown={onDown}
      style={{ cursor: mid ? "grab" : "crosshair" }}
    >
      <title>{label}</title>
    </circle>
  );
}

function ArrowShape({ a, geo, sel, tool, begin, hs }: ShapeProps<ArrowAnnotation>) {
  const ap = arrowPoints(geo, a);
  const S = ap.S;
  const sc = (q: Point) => toScreen(geo, a.anchor, q.x / S.w, q.y / S.h);
  const p1 = sc(ap.p1);
  const p2 = sc(ap.p2);
  const c = sc(ap.ctrl);
  const m = sc(ap.mid);
  const d = `M${p1.x} ${p1.y} Q${c.x} ${c.y} ${p2.x} ${p2.y}`;
  const strokeW = Math.max(16, a.width * geo.layout.k * geo.zoom + 12);
  return (
    <g>
      {tool === "select" && (
        <path
          className="hit-line"
          d={d}
          strokeWidth={strokeW}
          strokeLinecap="round"
          onPointerDown={(e) => begin(e, a, "move")}
        />
      )}
      {sel && (
        <>
          <Dot p={p1} hs={hs} onDown={(e) => begin(e, a, "p1")} label="Arrow start" />
          <Dot p={p2} hs={hs} onDown={(e) => begin(e, a, "p2")} label="Arrow tip" />
          <Dot p={m} hs={hs} mid onDown={(e) => begin(e, a, "mid")} label="Bend" />
        </>
      )}
    </g>
  );
}

function TextShape({ a, geo, sel, tool, begin, hs }: ShapeProps<TextAnnotation>) {
  const app = useApp();
  const box = textBox(geo, a);
  const q = quad(geo, a.anchor, box);
  return (
    <g>
      {tool === "select" && (
        <polygon
          className="hit"
          points={pts(q)}
          onPointerDown={(e) => begin(e, a, "move")}
          onDoubleClick={() => app.ui.set({ editingText: a.id })}
        />
      )}
      {sel && (
        <>
          <polygon className="outline" points={pts(q)} />
          <Dot p={q[2]!} hs={hs - 4} onDown={(e) => begin(e, a, "size")} label="Resize text" />
        </>
      )}
    </g>
  );
}

function BoxShape({ a, geo, sel, tool, begin }: ShapeProps<RectAnnotation | RedactAnnotation>) {
  const S = anchorSize(geo, a.anchor);
  const r = { left: a.x * S.w, top: a.y * S.h, width: a.w * S.w, height: a.h * S.h };
  const q = quad(geo, a.anchor, r);
  const mid = (i: number, j: number) => ({
    x: (q[i]!.x + q[j]!.x) / 2,
    y: (q[i]!.y + q[j]!.y) / 2,
  });
  const handles: [Handle, Point][] = [
    ["nw", q[0]!],
    ["n", mid(0, 1)],
    ["ne", q[1]!],
    ["e", mid(1, 2)],
    ["se", q[2]!],
    ["s", mid(2, 3)],
    ["sw", q[3]!],
    ["w", mid(3, 0)],
  ];
  const cursors: Record<string, string> = {
    nw: "nwse-resize",
    se: "nwse-resize",
    ne: "nesw-resize",
    sw: "nesw-resize",
    n: "ns-resize",
    s: "ns-resize",
    e: "ew-resize",
    w: "ew-resize",
  };
  return (
    <g>
      {tool === "select" && (
        <polygon className="hit" points={pts(q)} onPointerDown={(e) => begin(e, a, "move")} />
      )}
      {(sel || a.kind === "redact") && (
        <polygon
          className={`outline${a.kind === "redact" ? " redact" : ""}${sel ? "" : " idle"}`}
          points={pts(q)}
        />
      )}
      {sel &&
        handles.map(([h, p]) => (
          <rect
            key={h}
            className="handle sq"
            x={p.x - 5}
            y={p.y - 5}
            width={10}
            height={10}
            rx={3}
            style={{ cursor: cursors[h] }}
            onPointerDown={(e) => begin(e, a, h)}
          />
        ))}
    </g>
  );
}

/** Compute the annotation patch for a drag, in normalized anchor coords. */
function dragPatch(
  geo: Geo,
  d: Drag,
  p: Point,
  shift: boolean,
  alt: boolean,
): Partial<Annotation> | null {
  const a = d.orig;
  const anchor = a.anchor;
  const S = anchorSize(geo, anchor);
  const cur = fromScreen(geo, anchor, p.x, p.y);
  const st = fromScreen(geo, anchor, d.start.x, d.start.y);
  if (!cur || !st) return null;
  let du = cur.x - st.x;
  let dv = cur.y - st.y;
  if (d.handle === "move") {
    if (shift) {
      if (Math.abs(du * S.w) > Math.abs(dv * S.h)) dv = 0;
      else du = 0;
    }
    if (a.kind === "arrow")
      return { x1: a.x1 + du, y1: a.y1 + dv, x2: a.x2 + du, y2: a.y2 + dv } as Partial<Annotation>;
    return { x: a.x + du, y: a.y + dv } as Partial<Annotation>;
  }
  if (a.kind === "arrow") {
    if (d.handle === "mid") {
      const ap = arrowPoints(geo, a);
      const mid = { x: ap.mid.x + du * S.w, y: ap.mid.y + dv * S.h };
      return { curve: Number(curveFromMid(ap.p1, ap.p2, mid).toFixed(3)) } as Partial<Annotation>;
    }
    const fixed = d.handle === "p1" ? { x: a.x2, y: a.y2 } : { x: a.x1, y: a.y1 };
    let nx = (d.handle === "p1" ? a.x1 : a.x2) + du;
    let ny = (d.handle === "p1" ? a.y1 : a.y2) + dv;
    if (d.creating) {
      nx = cur.x;
      ny = cur.y;
    }
    if (shift) {
      // Snap the shaft to 15° steps.
      const vx = (nx - fixed.x) * S.w;
      const vy = (ny - fixed.y) * S.h;
      const len = Math.hypot(vx, vy);
      const ang = Math.round(Math.atan2(vy, vx) / (Math.PI / 12)) * (Math.PI / 12);
      nx = fixed.x + (Math.cos(ang) * len) / S.w;
      ny = fixed.y + (Math.sin(ang) * len) / S.h;
    }
    return (d.handle === "p1" ? { x1: nx, y1: ny } : { x2: nx, y2: ny }) as Partial<Annotation>;
  }
  if (a.kind === "text") {
    if (d.handle === "size") {
      const box = textBox(geo, a);
      const cx = box.left + box.width / 2;
      const cy = box.top + box.height / 2;
      const r0 = Math.hypot(st.x * S.w - cx, st.y * S.h - cy) || 1;
      const r1 = Math.hypot(cur.x * S.w - cx, cur.y * S.h - cy);
      return {
        size: Math.max(6, Math.min(600, Math.round(a.size * (r1 / r0)))),
      } as Partial<Annotation>;
    }
    return null;
  }
  // Boxes: resize by edges/corners in anchor units (isotropic for Shift = square).
  const b = a as RectAnnotation | RedactAnnotation;
  let x0 = b.x * S.w;
  let y0 = b.y * S.h;
  let x1 = (b.x + b.w) * S.w;
  let y1 = (b.y + b.h) * S.h;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const h = d.handle;
  const px = d.creating ? cur.x * S.w : undefined;
  const py = d.creating ? cur.y * S.h : undefined;
  const dx = du * S.w;
  const dy = dv * S.h;
  if (d.creating) {
    x1 = px!;
    y1 = py!;
  } else {
    if (h.includes("w")) x0 += dx;
    if (h.includes("e")) x1 += dx;
    if (h.includes("n")) y0 += dy;
    if (h.includes("s")) y1 += dy;
  }
  if (shift && h.length === 2) {
    const w = x1 - x0;
    const hh = y1 - y0;
    const side = Math.max(Math.abs(w), Math.abs(hh));
    if (h.includes("e") || d.creating) x1 = x0 + Math.sign(w || 1) * side;
    else x0 = x1 - Math.sign(w || 1) * side;
    if (h.includes("s") || d.creating) y1 = y0 + Math.sign(hh || 1) * side;
    else y0 = y1 - Math.sign(hh || 1) * side;
  }
  if (alt && !d.creating) {
    // Resize from the centre.
    if (h.includes("w") || h.includes("e")) {
      const half = Math.abs((h.includes("w") ? x0 : x1) - cx);
      x0 = cx - half;
      x1 = cx + half;
    }
    if (h.includes("n") || h.includes("s")) {
      const half = Math.abs((h.includes("n") ? y0 : y1) - cy);
      y0 = cy - half;
      y1 = cy + half;
    }
  }
  const nx0 = Math.min(x0, x1) / S.w;
  const ny0 = Math.min(y0, y1) / S.h;
  let w = Math.abs(x1 - x0) / S.w;
  let hN = Math.abs(y1 - y0) / S.h;
  let x = nx0;
  let y = ny0;
  if (a.kind === "redact") {
    // Redactions live on the screenshot.
    x = Math.max(0, x);
    y = Math.max(0, y);
    w = Math.min(w, 1 - x);
    hN = Math.min(hN, 1 - y);
  }
  return { x, y, w, h: hN } as Partial<Annotation>;
}

/** Inline text editing over the canvas (the canvas skips this annotation's text meanwhile). */
function TextEditor({
  geo,
  left,
  top,
  a,
}: {
  geo: Geo;
  left: number;
  top: number;
  a?: TextAnnotation;
}) {
  const app = useApp();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(a?.text ?? "");

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.select();
  }, []);

  useEffect(() => {
    if (!a) app.ui.set({ editingText: null });
  }, [a, app]);

  if (!a) return null;
  const box = textBox(geo, { ...a, text: value });
  const q = quad(geo, a.anchor, box);
  const minX = Math.min(...q.map((p) => p.x));
  const minY = Math.min(...q.map((p) => p.y));
  const maxX = Math.max(...q.map((p) => p.x));
  const maxY = Math.max(...q.map((p) => p.y));
  const scale = (maxX - minX) / Math.max(1, box.width);
  const fontPx = box.size * scale;
  const padX = a.background ? fontPx * 0.5 : fontPx * 0.1;
  const padY = a.background ? fontPx * 0.28 : fontPx * 0.05;

  const commit = () => {
    const text = value;
    if (!text.trim()) {
      app.ui.set({ editingText: null });
      app.deleteAnnotation(a.id);
      return;
    }
    app.ui.set({ editingText: null });
    app.announce("Text updated");
  };

  return (
    <textarea
      ref={ref}
      className="text-editor"
      aria-label="Annotation text"
      value={value}
      rows={value.split("\n").length}
      spellCheck={false}
      style={{
        left: left + minX,
        top: top + minY,
        width: Math.max(40, maxX - minX + 4),
        height: maxY - minY,
        font: `${a.weight} ${fontPx}px/${fontPx * 1.2}px ${getFont(a.font).stack}`,
        // The canvas picks Bricolage's optical size from its device-pixel size; match it.
        fontOpticalSizing: "none",
        fontVariationSettings: `"opsz" ${Math.max(12, Math.min(96, fontPx * (window.devicePixelRatio || 1)))}`,
        color: a.color,
        textAlign: a.align,
        padding: `${padY}px ${padX}px`,
        background: a.background ?? "transparent",
        borderRadius: a.background ? Math.min((maxY - minY) / 2, fontPx * 0.7) : 4,
        boxShadow: "0 0 0 2px var(--sc-accent-ring)",
      }}
      onChange={(e) => {
        setValue(e.target.value);
        app.updateAnnotation(a.id, { text: e.target.value } as Partial<Annotation>, `text:${a.id}`);
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          commit();
        }
      }}
      onBlur={commit}
    />
  );
}
