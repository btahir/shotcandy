"use client";
/**
 * Colour picker popover content: saturation/value square, hue strip, optional
 * alpha strip, hex input, eyedropper (where EyeDropper exists) and the
 * screenshot's palette. Emits normalized hex (#rrggbb or #rrggbbaa).
 */
import { useEffect, useRef, useState } from "react";
import { normalizeColor } from "@/engine";
import { Icon } from "../icons";

type HSV = { h: number; s: number; v: number; a: number };

function safeNorm(input: string, strict = false): string | null {
  const t = input.trim();
  const withHash = t.startsWith("#") ? t : `#${t}`;
  if (strict && !/^#([0-9a-f]{6}|[0-9a-f]{8})$/i.test(withHash)) return null;
  try {
    return normalizeColor(withHash);
  } catch {
    return null;
  }
}

function hexToHsv(hex: string): HSV {
  const n = safeNorm(hex) ?? "#ff4f7b";
  const r = parseInt(n.slice(1, 3), 16) / 255;
  const g = parseInt(n.slice(3, 5), 16) / 255;
  const b = parseInt(n.slice(5, 7), 16) / 255;
  const a = n.length > 7 ? parseInt(n.slice(7, 9), 16) / 255 : 1;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s: max ? d / max : 0, v: max, a };
}

function hsvToHex({ h, s, v, a }: HSV): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  const to = (x: number) =>
    Math.round(x * 255)
      .toString(16)
      .padStart(2, "0");
  const base = `#${to(f(5))}${to(f(3))}${to(f(1))}`;
  return a < 0.999 ? `${base}${to(a)}` : base;
}

export function ColorPicker({
  value,
  onChange,
  palette = [],
  alpha = false,
  label = "Colour",
}: {
  value: string;
  onChange: (hex: string, final: boolean) => void;
  palette?: string[];
  alpha?: boolean;
  label?: string;
}) {
  const [hsv, setHsv] = useState<HSV>(() => hexToHsv(value));
  const [hex, setHex] = useState(value);
  const last = useRef(value);
  useEffect(() => {
    if (value !== last.current) {
      last.current = value;
      setHsv(hexToHsv(value));
      setHex(value);
    }
  }, [value]);

  const emit = (next: HSV, final: boolean) => {
    setHsv(next);
    const h = hsvToHex(alpha ? next : { ...next, a: 1 });
    last.current = h;
    setHex(h);
    onChange(h, final);
  };

  const drag = (el: HTMLElement, e: React.PointerEvent, fn: (x: number, y: number) => void) => {
    el.setPointerCapture(e.pointerId);
    const r = el.getBoundingClientRect();
    const at = (ev: { clientX: number; clientY: number }) =>
      fn(
        Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)),
        Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height)),
      );
    at(e);
    const move = (ev: PointerEvent) => at(ev);
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      onChange(last.current, true);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  };

  const hueHex = hsvToHex({ h: hsv.h, s: 1, v: 1, a: 1 });
  const solid = hsvToHex({ ...hsv, a: 1 });
  const hasDropper = typeof window !== "undefined" && "EyeDropper" in window;

  const keyNudge = (e: React.KeyboardEvent, axis: "sv" | "h" | "a") => {
    const d = e.shiftKey ? 0.1 : 0.02;
    let n = { ...hsv };
    if (axis === "sv") {
      if (e.key === "ArrowLeft") n.s = Math.max(0, n.s - d);
      else if (e.key === "ArrowRight") n.s = Math.min(1, n.s + d);
      else if (e.key === "ArrowUp") n.v = Math.min(1, n.v + d);
      else if (e.key === "ArrowDown") n.v = Math.max(0, n.v - d);
      else return;
    } else if (axis === "h") {
      if (e.key === "ArrowLeft" || e.key === "ArrowDown") n = { ...n, h: (n.h + 360 - d * 360) % 360 };
      else if (e.key === "ArrowRight" || e.key === "ArrowUp") n = { ...n, h: (n.h + d * 360) % 360 };
      else return;
    } else {
      if (e.key === "ArrowLeft" || e.key === "ArrowDown") n.a = Math.max(0, n.a - d);
      else if (e.key === "ArrowRight" || e.key === "ArrowUp") n.a = Math.min(1, n.a + d);
      else return;
    }
    e.preventDefault();
    e.stopPropagation();
    emit(n, true);
  };

  return (
    <div className="picker">
      <div
        className="sv focusable"
        role="slider"
        tabIndex={0}
        aria-label={`${label}: saturation and brightness`}
        aria-valuenow={Math.round(hsv.s * 100)}
        aria-valuetext={solid}
        style={{ backgroundColor: hueHex }}
        onPointerDown={(e) =>
          drag(e.currentTarget, e, (x, y) => emit({ ...hsv, s: x, v: 1 - y }, false))
        }
        onKeyDown={(e) => keyNudge(e, "sv")}
      >
        <span
          className="dot"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: solid }}
        />
      </div>
      <div
        className="hue focusable"
        role="slider"
        tabIndex={0}
        aria-label={`${label}: hue`}
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(hsv.h)}
        onPointerDown={(e) => drag(e.currentTarget, e, (x) => emit({ ...hsv, h: x * 359.9 }, false))}
        onKeyDown={(e) => keyNudge(e, "h")}
      >
        <span className="dot" style={{ left: `${(hsv.h / 360) * 100}%`, background: hueHex }} />
      </div>
      {alpha && (
        <div
          className="alpha focusable sw transparent"
          role="slider"
          tabIndex={0}
          aria-label={`${label}: opacity`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(hsv.a * 100)}
          style={{ width: "100%", borderRadius: 7, boxShadow: "none" }}
          onPointerDown={(e) => drag(e.currentTarget, e, (x) => emit({ ...hsv, a: x }, false))}
          onKeyDown={(e) => keyNudge(e, "a")}
        >
          <span
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 7,
              background: `linear-gradient(90deg, transparent, ${solid})`,
            }}
          />
          <span
            className="dot"
            style={{
              position: "absolute",
              top: "50%",
              width: 18,
              height: 18,
              margin: "-9px 0 0 -9px",
              borderRadius: "50%",
              left: `${hsv.a * 100}%`,
              boxShadow: "0 0 0 3px #fff, 0 1px 4px rgba(0,0,0,.4)",
            }}
          />
        </div>
      )}
      <div className="row">
        <span
          className="colour-dot"
          style={{ background: hex, width: 32, height: 32, borderRadius: 10 }}
        />
        <label className="input mono-input" style={{ flex: 1 }}>
          <span className="sr-only">{label} hex value</span>
          <input
            value={hex}
            spellCheck={false}
            onChange={(e) => {
              setHex(e.target.value);
              const n = safeNorm(e.target.value, true);
              if (n) {
                last.current = n;
                setHsv(hexToHsv(n));
                onChange(n, false);
              }
            }}
            onBlur={() => {
              const n = safeNorm(hex);
              if (n) {
                last.current = n;
                setHsv(hexToHsv(n));
                setHex(n);
              } else setHex(last.current);
              onChange(last.current, true);
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") onChange(last.current, true);
            }}
          />
        </label>
        {hasDropper && (
          <button
            type="button"
            className="icon-btn"
            aria-label="Pick a colour from the screen"
            onClick={async () => {
              try {
                const ED = (
                  window as unknown as {
                    EyeDropper: new () => { open(): Promise<{ sRGBHex: string }> };
                  }
                ).EyeDropper;
                const r = await new ED().open();
                const n = safeNorm(r.sRGBHex);
                if (n) emit(hexToHsv(n), true);
              } catch {
                /* cancelled */
              }
            }}
          >
            <Icon name="eyedrop" />
          </button>
        )}
      </div>
      {palette.length > 0 && (
        <>
          <div className="sub" style={{ margin: "12px 0 6px" }}>
            From your shot
          </div>
          <div className="pal">
            {palette.map((c) => (
              <button
                key={c}
                type="button"
                className="sw"
                style={{ background: c }}
                aria-label={`Use ${c}`}
                onClick={() => emit(hexToHsv(c), true)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
