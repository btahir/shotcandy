"use client";
/**
 * "Edit gradient": type, an angle dial, a bar with 2-4 draggable colour stops
 * (palette suggestions from the screenshot), mesh shuffle and hue shift, and
 * grain. Every change writes the scene, coalesced per control for undo.
 */
import { useEffect, useRef, useState } from "react";
import {
  type BackgroundFill,
  type GradientEdit,
  type GradientType,
  type MeshPoint,
  type Palette,
  GRADIENT_ANGLES,
  GRADIENT_TYPES,
  MAX_STOPS,
  MIN_STOPS,
  colorAt,
  fromGradientEdit,
  hueShiftFill,
  paletteStopSuggestions,
  shuffleMesh,
  toGradientEdit,
} from "@/engine";
import { Icon } from "../icons";
import { Segmented } from "../ui/controls";
import { Slider } from "../ui/Slider";
import { useApp } from "./context";
import { ColourButton } from "./Inspector";

type Mesh = Extract<BackgroundFill, { kind: "mesh" }>;

const MESH_SPOTS: readonly [number, number, number][] = [
  [0.08, 0.1, 0.62],
  [0.92, 0.9, 0.62],
  [0.92, 0.12, 0.55],
  [0.1, 0.92, 0.55],
];

/** Colours of a mesh as an ordered list: base first, then its points. */
const meshColours = (m: Mesh) => [m.base, ...m.points.map((p) => p.color)];

function withMeshColours(m: Mesh, colours: string[]): Mesh {
  const [base, ...rest] = colours;
  const points: MeshPoint[] = rest.map((color, i) => {
    const old = m.points[i];
    if (old) return { ...old, color };
    const [x, y, radius] = MESH_SPOTS[i % MESH_SPOTS.length]!;
    return { x, y, radius, color };
  });
  return { ...m, base: base!, points };
}

export function GradientEditor({
  fill,
  grain,
  palette,
}: {
  fill: BackgroundFill;
  grain: number;
  palette: Palette | null;
}) {
  const app = useApp();
  const edit = toGradientEdit(fill, palette);
  const mesh = fill.kind === "mesh" ? fill : null;
  const [sel, setSel] = useState(0);
  const count = mesh ? meshColours(mesh).length : edit.stops.length;
  useEffect(() => {
    if (sel >= count) setSel(count - 1);
  }, [sel, count]);

  const write = (f: BackgroundFill, key: string) => {
    app.store.update(
      (s) => ({
        ...s,
        background: { ...s.background, fill: f },
      }),
      { coalesce: `gradient:${key}` },
    );
  };
  const setEdit = (e: GradientEdit, key: string) => write(fromGradientEdit(e), key);

  const setType = (type: GradientType) => {
    if (type === edit.type && fill.kind !== "auto") return;
    setEdit({ ...edit, type }, "type");
    app.announce(`${GRADIENT_TYPES.find((t) => t.id === type)?.label} gradient`);
  };

  // Stops (non-mesh) ------------------------------------------------------
  const setStopColour = (i: number, color: string) => {
    if (mesh) {
      const cs = meshColours(mesh);
      cs[i] = color;
      write(withMeshColours(mesh, cs), `colour${i}`);
      return;
    }
    const stops = edit.stops.map((s, j) => (j === i ? { ...s, color } : s));
    setEdit({ ...edit, stops }, `colour${i}`);
  };
  const addStop = () => {
    if (count >= MAX_STOPS) return;
    if (mesh) {
      const cs = meshColours(mesh);
      const suggestion = paletteStopSuggestions(palette)[cs.length] ?? cs[cs.length - 1]!;
      write(withMeshColours(mesh, [...cs, suggestion]), "count");
      setSel(cs.length);
      return;
    }
    // Insert in the widest gap, coloured as the gradient already is there.
    const s = edit.stops;
    let gi = 0;
    let gw = -1;
    for (let i = 1; i < s.length; i++) {
      const w = s[i]!.offset - s[i - 1]!.offset;
      if (w > gw) {
        gw = w;
        gi = i;
      }
    }
    const at = (s[gi - 1]!.offset + s[gi]!.offset) / 2;
    const stops = [...s.slice(0, gi), { offset: at, color: colorAt(s, at) }, ...s.slice(gi)];
    setEdit({ ...edit, stops }, "count");
    setSel(gi);
  };
  const removeStop = () => {
    if (count <= MIN_STOPS) return;
    if (mesh) {
      const cs = meshColours(mesh).filter((_, i) => i !== sel);
      write(
        withMeshColours({ ...mesh, points: mesh.points.filter((_, i) => i !== sel - 1) }, cs),
        "count",
      );
    } else {
      setEdit({ ...edit, stops: edit.stops.filter((_, i) => i !== sel) }, "count");
    }
    setSel(Math.max(0, sel - 1));
  };

  // Hue shift: relative to the fill when the drag started ---------------------
  const [hue, setHue] = useState(0);
  const hueBase = useRef<BackgroundFill | null>(null);
  const ours = useRef<BackgroundFill | null>(null);
  useEffect(() => {
    if (fill !== ours.current) {
      setHue(0);
      hueBase.current = null;
    }
  }, [fill]);

  const concrete: BackgroundFill = fill.kind === "auto" ? fromGradientEdit(edit) : fill;
  const colours = mesh ? meshColours(mesh) : edit.stops.map((s) => s.color);
  const suggestions = paletteStopSuggestions(palette).slice(0, 6);

  return (
    <div className="grad-edit" data-testid="gradient-editor">
      <Segmented<GradientType>
        label="Gradient type"
        value={fill.kind === "auto" ? null : edit.type}
        onChange={setType}
        options={GRADIENT_TYPES.map((t) => ({ value: t.id, label: t.label }))}
      />
      <div className="grad-row">
        {(edit.type === "linear" || edit.type === "conic") && !mesh ? (
          <AngleDial value={edit.angle} onChange={(a) => setEdit({ ...edit, angle: a }, "angle")} />
        ) : null}
        <div className="grad-main">
          {mesh ? (
            <div className="mesh-chips" role="group" aria-label="Mesh colours">
              {colours.map((c, i) => (
                <button
                  key={i}
                  type="button"
                  className={`stop-chip${sel === i ? " on" : ""}`}
                  style={{ background: c }}
                  aria-label={`Colour ${i + 1}: ${c}`}
                  aria-pressed={sel === i}
                  onClick={() => setSel(i)}
                />
              ))}
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                title="Move the colour blobs around"
                onClick={() => {
                  write(shuffleMesh(mesh, (Math.random() * 2 ** 31) | 0), "shuffle");
                  app.announce("Mesh shuffled");
                }}
              >
                <Icon name="shuffle" size="sm" /> Shuffle
              </button>
            </div>
          ) : (
            <StopBar
              edit={edit}
              sel={sel}
              onSelect={setSel}
              onMove={(i, offset) => {
                const stops = edit.stops.map((s, j) => (j === i ? { ...s, offset } : s));
                write(
                  edit.type === "linear"
                    ? { kind: "linear", angle: edit.angle, stops }
                    : fromGradientEdit({ ...edit, stops }),
                  `offset${i}`,
                );
              }}
            />
          )}
          <div className="stop-tools">
            <ColourButton
              value={colours[sel] ?? "#ffffff"}
              label={`Colour ${sel + 1}`}
              onChange={(c) => setStopColour(sel, c)}
            />
            <span className="stop-label">
              Colour {sel + 1}
              {!mesh && edit.stops[sel] ? (
                <span className="mono"> {Math.round(edit.stops[sel]!.offset * 100)}%</span>
              ) : null}
            </span>
            <button
              type="button"
              className="icon-btn sm"
              aria-label="Remove this colour"
              title="Remove this colour"
              disabled={count <= MIN_STOPS}
              onClick={removeStop}
            >
              <Icon name="minus" size="sm" />
            </button>
            <button
              type="button"
              className="icon-btn sm"
              aria-label="Add a colour"
              title="Add a colour"
              disabled={count >= MAX_STOPS}
              onClick={addStop}
            >
              <Icon name="plus" size="sm" />
            </button>
          </div>
        </div>
      </div>
      {suggestions.length > 0 && (
        <div className="grad-suggest">
          <span>From your shot</span>
          {suggestions.map((c) => (
            <button
              key={c}
              type="button"
              className="sw sm"
              style={{ background: c }}
              aria-label={`Use ${c} for colour ${sel + 1}`}
              title={c}
              onClick={() => setStopColour(sel, c)}
            />
          ))}
        </div>
      )}
      <Slider
        label="Hue"
        value={hue}
        min={-180}
        max={180}
        centered
        format={(v) => `${v > 0 ? "+" : ""}${Math.round(v)}°`}
        valueText={(v) => `hue shifted ${Math.round(v)} degrees`}
        onChange={(v, final) => {
          if (!hueBase.current) hueBase.current = concrete;
          setHue(v);
          const next = hueShiftFill(hueBase.current, v);
          ours.current = next;
          write(next, "hue");
          if (final) hueBase.current = null;
        }}
      />
      <Slider
        label="Grain"
        value={Math.round(grain * 100)}
        min={0}
        max={100}
        onChange={(v) => app.set(["background", "grain", "amount"], v / 100, "grain")}
      />
    </div>
  );
}

/** A round dial for the gradient angle, with the eight common angles as ticks. */
function AngleDial({ value, onChange }: { value: number; onChange: (deg: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const R = 26;
  const fromPointer = (e: React.PointerEvent, snap: number) => {
    const r = ref.current!.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    let a = (Math.atan2(dx, -dy) * 180) / Math.PI;
    a = (a + 360) % 360;
    return (Math.round(a / snap) * snap) % 360;
  };
  const rad = (value * Math.PI) / 180;
  return (
    <div className="angle-dial-wrap">
      <div
        ref={ref}
        className="angle-dial"
        role="slider"
        tabIndex={0}
        aria-label="Angle"
        aria-valuemin={0}
        aria-valuemax={359}
        aria-valuenow={Math.round(value)}
        aria-valuetext={`${Math.round(value)} degrees`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          onChange(fromPointer(e, e.shiftKey ? 45 : 5));
        }}
        onPointerMove={(e) => {
          if (e.buttons !== 1) return;
          onChange(fromPointer(e, e.shiftKey ? 45 : 5));
        }}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 45 : 5;
          const d =
            e.key === "ArrowRight" || e.key === "ArrowUp"
              ? step
              : e.key === "ArrowLeft" || e.key === "ArrowDown"
                ? -step
                : 0;
          if (!d) return;
          e.preventDefault();
          e.stopPropagation();
          onChange((((Math.round(value) + d) % 360) + 360) % 360);
        }}
      >
        <svg viewBox="-32 -32 64 64" aria-hidden="true">
          {GRADIENT_ANGLES.map((a) => {
            const t = (a * Math.PI) / 180;
            return (
              <circle
                key={a}
                cx={Math.sin(t) * R}
                cy={-Math.cos(t) * R}
                r={a === Math.round(value) ? 2.6 : 1.6}
                className={a === Math.round(value) ? "tick on" : "tick"}
              />
            );
          })}
          <line x1={0} y1={0} x2={Math.sin(rad) * 17} y2={-Math.cos(rad) * 17} className="hand" />
          <circle cx={Math.sin(rad) * 17} cy={-Math.cos(rad) * 17} r={5} className="knob" />
          <circle cx={0} cy={0} r={2.4} className="hub" />
        </svg>
      </div>
      <span className="mono angle-val">{Math.round(value)}°</span>
    </div>
  );
}

/** The gradient as a bar with a draggable handle per stop. */
function StopBar({
  edit,
  sel,
  onSelect,
  onMove,
}: {
  edit: GradientEdit;
  sel: number;
  onSelect: (i: number) => void;
  onMove: (i: number, offset: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const stops = edit.stops;
  const css = `linear-gradient(90deg, ${stops.map((s) => `${s.color} ${(s.offset * 100).toFixed(1)}%`).join(", ")})`;
  const clampFor = (i: number, v: number) => {
    const lo = i > 0 ? stops[i - 1]!.offset + 0.01 : 0;
    const hi = i < stops.length - 1 ? stops[i + 1]!.offset - 0.01 : 1;
    return Math.round(Math.min(hi, Math.max(lo, v)) * 1000) / 1000;
  };
  return (
    <div className="stop-bar" ref={ref} style={{ background: css }}>
      {stops.map((s, i) => (
        <button
          key={i}
          type="button"
          role="slider"
          className={`stop${sel === i ? " on" : ""}`}
          style={{ left: `${s.offset * 100}%`, background: s.color }}
          aria-label={`Colour ${i + 1} position`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(s.offset * 100)}
          aria-valuetext={`${Math.round(s.offset * 100)} percent, ${s.color}`}
          onPointerDown={(e) => {
            onSelect(i);
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (e.buttons !== 1 || !ref.current) return;
            const r = ref.current.getBoundingClientRect();
            onMove(i, clampFor(i, (e.clientX - r.left) / r.width));
          }}
          onFocus={() => onSelect(i)}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 0.1 : 0.01;
            const d = e.key === "ArrowRight" ? step : e.key === "ArrowLeft" ? -step : 0;
            if (!d) return;
            e.preventDefault();
            e.stopPropagation();
            onMove(i, clampFor(i, s.offset + d));
          }}
        />
      ))}
    </div>
  );
}
