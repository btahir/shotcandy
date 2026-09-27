"use client";
/**
 * Candy slider: well track, candy fill, moulded knob, optional named stops,
 * and a mono value chip you can click to type. Spec: components.md "Slider".
 * - Drag anywhere on the track; hold Shift for 1/4 speed, Alt to skip snapping.
 * - Keys: arrows ±step (Shift ×10), PageUp/PageDown next stop, Home/End.
 */
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";

export interface SliderStop {
  value: number;
  label?: string;
}

export interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** Largest value accepted when typed (defaults to max). */
  typedMax?: number;
  typedMin?: number;
  stops?: SliderStop[];
  disabled?: boolean;
  /** Fill from zero for signed ranges (e.g. tilt -45..45). */
  centered?: boolean;
  format?: (v: number) => string;
  valueText?: (v: number) => string;
  /** Replaces the value chip text (e.g. "Lossless"). */
  valueLabel?: string;
  onChange: (v: number, final: boolean) => void;
  className?: string;
  hideLabel?: boolean;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function Slider(props: SliderProps) {
  const {
    label,
    value,
    min,
    max,
    step = 1,
    stops,
    disabled,
    centered,
    format = (v) => (step < 1 ? v.toFixed(step < 0.1 ? 2 : 1) : String(Math.round(v))),
    valueText,
    onChange,
  } = props;
  const id = useId();
  const trackRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const drag = useRef<{ startX: number; startV: number; fine: boolean; lastSnap: number | null }>(
    null,
  );

  const quantize = (v: number) => {
    const q = Math.round((v - min) / step) * step + min;
    return Number(clamp(q, min, max).toFixed(6));
  };
  const pct = ((clamp(value, min, max) - min) / (max - min)) * 100;
  const zeroPct = centered ? ((clamp(0, min, max) - min) / (max - min)) * 100 : 0;

  const bump = () => {
    const k = knobRef.current;
    if (!k) return;
    k.classList.remove("bump");
    void k.offsetWidth;
    k.classList.add("bump");
  };

  const snap = (v: number, alt: boolean) => {
    if (!stops || alt) return { v, stop: null as number | null };
    const tol = (max - min) * 0.03;
    for (const s of stops) if (Math.abs(v - s.value) <= tol) return { v: s.value, stop: s.value };
    return { v, stop: null };
  };

  const fromClientX = (x: number) => {
    const r = trackRef.current!.getBoundingClientRect();
    return min + clamp((x - r.left) / r.width, 0, 1) * (max - min);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || e.button !== 0) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).focus();
    e.currentTarget.setPointerCapture(e.pointerId);
    const onKnob = knobRef.current?.contains(e.target as Node);
    const start = onKnob ? value : fromClientX(e.clientX);
    const { v, stop } = snap(start, e.altKey);
    drag.current = { startX: e.clientX, startV: v, fine: e.shiftKey, lastSnap: stop };
    setDragging(true);
    if (!onKnob) onChange(quantize(v), false);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const r = trackRef.current!.getBoundingClientRect();
    if (e.shiftKey !== d.fine) {
      // Re-anchor when the fine modifier toggles mid-drag.
      d.startX = e.clientX;
      d.startV = value;
      d.fine = e.shiftKey;
    }
    const speed = d.fine ? 0.25 : 1;
    const raw = d.startV + ((e.clientX - d.startX) / r.width) * (max - min) * speed;
    const { v, stop } = snap(clamp(raw, min, max), e.altKey);
    if (stop !== null && stop !== d.lastSnap) bump();
    d.lastSnap = stop;
    const q = quantize(v);
    if (q !== value) onChange(q, false);
  };

  const endDrag = () => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    onChange(value, true);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    let next: number | null = null;
    const big = e.shiftKey ? 10 : 1;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowUp":
        next = value + step * big;
        break;
      case "ArrowLeft":
      case "ArrowDown":
        next = value - step * big;
        break;
      case "Home":
        next = min;
        break;
      case "End":
        next = max;
        break;
      case "PageUp": {
        const s = stops?.map((x) => x.value).find((x) => x > value + 1e-9);
        next = s ?? value + step * 10;
        break;
      }
      case "PageDown": {
        const s = stops
          ?.map((x) => x.value)
          .reverse()
          .find((x) => x < value - 1e-9);
        next = s ?? value - step * 10;
        break;
      }
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
    onChange(quantize(next), true);
  };

  const commitDraft = () => {
    const n = Number(draft.replace(",", "."));
    if (Number.isFinite(n)) {
      const lo = props.typedMin ?? min;
      const hi = props.typedMax ?? max;
      onChange(Number(clamp(n, lo, hi).toFixed(4)), true);
    }
    setEditing(false);
  };

  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const vt = valueText?.(value) ?? format(value);
  const fillLeft = centered ? Math.min(zeroPct, pct) : 0;
  const fillWidth = centered ? Math.abs(pct - zeroPct) : pct;

  return (
    <div
      className={`field${stops?.some((s) => s.label) ? " named" : ""}${disabled ? " disabled" : ""}${dragging ? " dragging" : ""}${props.className ? ` ${props.className}` : ""}`}
    >
      <span className={props.hideLabel ? "sr-only" : "label"} id={`${id}-l`}>
        {label}
      </span>
      <div
        ref={trackRef}
        className={`slider${dragging ? " dragging" : ""}${centered ? " centered" : ""}`}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-labelledby={`${id}-l`}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Number(value.toFixed(4))}
        aria-valuetext={vt}
        aria-disabled={disabled || undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onKeyDown={onKeyDown}
      >
        <div className="track" />
        <div className="fill" style={{ left: `${fillLeft}%`, width: `${fillWidth}%` }} />
        {stops && (
          <div className="stops" aria-hidden="true">
            {stops.map((s) => {
              const p = ((s.value - min) / (max - min)) * 100;
              return (
                <span key={s.value}>
                  <i style={{ left: `${p}%` }} />
                  {s.label && <b style={{ left: `${p}%` }}>{s.label}</b>}
                </span>
              );
            })}
          </div>
        )}
        <div ref={knobRef} className="knob" style={{ left: `${pct}%` }} />
      </div>
      {editing ? (
        <input
          ref={inputRef}
          className="val"
          aria-label={`${label} value`}
          value={draft}
          inputMode="decimal"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitDraft}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") commitDraft();
            else if (e.key === "Escape") setEditing(false);
            else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              e.preventDefault();
              const n = Number(draft) || 0;
              const d = (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 10 : 1) * step;
              setDraft(String(Number((n + d).toFixed(4))));
            }
          }}
        />
      ) : (
        <button
          type="button"
          className="val"
          disabled={disabled}
          aria-label={`${label}: ${vt}. Type a value`}
          onClick={() => {
            if (props.valueLabel) return;
            setDraft(format(value));
            setEditing(true);
          }}
          style={props.valueLabel ? { fontSize: 11 } : undefined}
        >
          {props.valueLabel ?? format(value)}
        </button>
      )}
    </div>
  );
}
