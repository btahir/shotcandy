"use client";
/**
 * The Screens tray: Single or one of six multi-screen layouts, and, only
 * while a layout is on, its screen count and its two or three knobs. It edits
 * the image on stage only (in a batch too: a layout is part of that image's
 * design, like its screenshot), so it sits above the All / This image switch
 * and never shows an override mark.
 */
import { memo, useId } from "react";
import {
  type LayoutDef,
  type LayoutId,
  type LayoutParamDef,
  LAYOUTS,
  activeLayout,
  isVideoScene,
  setLayout,
} from "@/engine";
import { Segmented } from "../ui/controls";
import { Slider } from "../ui/Slider";
import { useApp, useScene, useUi } from "./context";

/** Short tile labels (the full names are the accessible names). */
const SHORT: Record<LayoutId, string> = {
  single: "Single",
  "side-by-side": "Row",
  overlap: "Overlap",
  hero: "Hero",
  cascade: "Cascade",
  fan: "Fan",
  grid: "Grid",
};

interface Card {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Degrees, about (cx, cy). */
  rot?: number;
  cx?: number;
  cy?: number;
  /** Cards further back are fainter. */
  o?: number;
}

const fan = (rot: number, o?: number): Card => ({
  x: 9,
  y: 3,
  w: 8,
  h: 12.5,
  rot,
  cx: 13,
  cy: 24,
  ...(o ? { o } : {}),
});

/** Each layout as a few screens on the frame icons' 26 × 22 grid, back to front. */
const CARDS: Record<LayoutId, Card[]> = {
  single: [{ x: 4, y: 4, w: 18, h: 14 }],
  "side-by-side": [
    { x: 2, y: 6, w: 10, h: 10 },
    { x: 14, y: 6, w: 10, h: 10 },
  ],
  overlap: [
    { x: 3, y: 3, w: 13, h: 10, o: 0.55 },
    { x: 10, y: 9, w: 13, h: 10 },
  ],
  hero: [
    { x: 2, y: 7, w: 8, h: 9, o: 0.55 },
    { x: 16, y: 7, w: 8, h: 9, o: 0.55 },
    { x: 8.5, y: 3.5, w: 9, h: 15 },
  ],
  cascade: [
    { x: 12, y: 2, w: 11.5, h: 8.5, o: 0.4 },
    { x: 7.5, y: 6.25, w: 11.5, h: 8.5, o: 0.65 },
    { x: 3, y: 10.5, w: 11.5, h: 8.5 },
  ],
  fan: [fan(-20, 0.55), fan(20, 0.55), fan(0)],
  grid: [
    { x: 3, y: 3, w: 9, h: 7 },
    { x: 14, y: 3, w: 9, h: 7 },
    { x: 3, y: 12, w: 9, h: 7 },
    { x: 14, y: 12, w: 9, h: 7 },
  ],
};

const cardRect = (c: Card, extra: Record<string, string | number> = {}) => (
  <rect
    x={c.x}
    y={c.y}
    width={c.w}
    height={c.h}
    rx={2}
    transform={c.rot ? `rotate(${c.rot} ${c.cx} ${c.cy})` : undefined}
    {...extra}
  />
);

/**
 * A layout's schematic in the frame icons' style (1.6 px strokes, round
 * corners). Cards in front hide the ones behind them (a mask with a small
 * gap), so the icon reads as depth on any tile colour.
 */
export function LayoutIcon({ id, className }: { id: LayoutId; className?: string }) {
  const uid = useId().replace(/:/g, "");
  const cards = CARDS[id];
  return (
    <svg className={className} viewBox="0 0 26 22" fill="none" aria-hidden="true">
      {cards.map((c, k) => {
        const front = cards.slice(k + 1);
        const mask = front.length ? `${uid}m${k}` : undefined;
        return (
          <g key={k}>
            {mask && (
              <mask id={mask} maskUnits="userSpaceOnUse" x="-4" y="-4" width="34" height="30">
                <rect x="-4" y="-4" width="34" height="30" fill="#fff" />
                {front.map((f, j) => (
                  <g key={j}>{cardRect(f, { fill: "#000", stroke: "#000", strokeWidth: 3.6 })}</g>
                ))}
              </mask>
            )}
            {/* The mask goes on a group, so it isn't turned with a rotated card. */}
            <g mask={mask ? `url(#${mask})` : undefined} opacity={c.o}>
              {cardRect(c, { stroke: "currentColor", strokeWidth: 1.6 })}
            </g>
          </g>
        );
      })}
    </svg>
  );
}

function paramValue(p: LayoutParamDef, v: number): number {
  return p.unit === "deg" ? Math.round(v) : Math.round(v * 100);
}

function ParamSlider({ p, value }: { p: LayoutParamDef; value: number }) {
  const app = useApp();
  const deg = p.unit === "deg";
  return (
    <Slider
      label={p.label}
      value={paramValue(p, value)}
      min={deg ? p.min : p.min * 100}
      max={deg ? p.max : p.max * 100}
      centered={deg}
      format={(v) => (deg ? `${Math.round(v)}°` : `${Math.round(v)}`)}
      valueText={(v) => (deg ? `${Math.round(v)} degrees` : `${Math.round(v)} percent`)}
      onChange={(v) => app.screens.setParam(p.key, deg ? v : v / 100)}
    />
  );
}

function Knobs({ def }: { def: LayoutDef }) {
  const app = useApp();
  const spec = useScene((s) => s.scene.layout);
  const count = useScene((s) => activeLayout(s.scene)?.count ?? def.defaultCount);
  const counts: string[] = [];
  for (let n = def.minCount; n <= def.maxCount; n++) counts.push(String(n));
  return (
    <div className="screens-knobs" data-testid="screens-knobs">
      {counts.length > 1 && (
        <div className="field screens-count">
          <span className="label">Count</span>
          <Segmented
            label="Number of screens"
            value={String(count)}
            onChange={(v) => app.screens.setCount(Number(v))}
            options={counts.map((c) => ({ value: c, label: c, title: `${c} screens` }))}
          />
        </div>
      )}
      {def.params.map((p) => (
        <ParamSlider key={p.key} p={p} value={spec?.params?.[p.key] ?? p.default} />
      ))}
    </div>
  );
}

export const ScreensTray = memo(function ScreensTray({ bare = false }: { bare?: boolean }) {
  const app = useApp();
  const mode = useUi((s) => s.mode);
  const hasContent = useUi((s) => s.hasContent);
  const image = useScene(
    (s) => s.scene.content.kind === "image" && !!s.scene.content.assetId && !isVideoScene(s.scene),
  );
  const current = useScene((s) => activeLayout(s.scene)?.id ?? "single");
  const tuned = useScene((s) => !!activeLayout(s.scene) && !!s.scene.layout?.params);
  if (mode !== "screenshot" || !hasContent || !image) return null;
  const def = LAYOUTS.find((l) => l.id === current)!;

  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : 0;
    const u = e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!d && !u) return;
    e.preventDefault();
    e.stopPropagation();
    const root = e.currentTarget;
    const i = LAYOUTS.findIndex((l) => l.id === current);
    const next = LAYOUTS[(i + d + u + LAYOUTS.length) % LAYOUTS.length]!;
    // Arrowing through the layouts is one undo step.
    app.screens.setLayout(next.id, { coalesce: "screens-layout-keys" });
    requestAnimationFrame(() =>
      root.querySelector<HTMLButtonElement>(`[data-layout="${next.id}"]`)?.focus(),
    );
  };

  return (
    <section className="tray screens-tray" aria-labelledby="t-screens" data-testid="screens-tray">
      {!bare ? (
        <div className="tray-head">
          <h2 id="t-screens">Screens</h2>
          {tuned ? (
            <button
              type="button"
              className="link quiet"
              data-testid="screens-reset"
              aria-label={`Reset ${def.params.map((p) => p.label.toLowerCase()).join(" and ")}`}
              onClick={() => app.screens.resetParams()}
            >
              Reset
            </button>
          ) : (
            <span className="meta">{def.label}</span>
          )}
        </div>
      ) : (
        <div className="sub screens-sub" id="t-screens">
          Screens
        </div>
      )}
      <div
        className="frames screens-row"
        role="radiogroup"
        aria-label="Screens layout"
        onKeyDown={onKey}
        onPointerLeave={() => app.clearPreview()}
      >
        {LAYOUTS.map((l) => {
          const on = l.id === current;
          return (
            <button
              key={l.id}
              type="button"
              role="radio"
              data-layout={l.id}
              aria-checked={on}
              aria-label={l.label}
              tabIndex={on ? 0 : -1}
              title={`${l.label}: ${l.description}`}
              className={`tile labelled${on ? " on" : ""}`}
              onPointerEnter={(e) => {
                if (e.pointerType !== "mouse" || on) return;
                app.previewScene((s) => setLayout(s, l.id), l.label);
              }}
              onClick={() => app.screens.setLayout(l.id)}
            >
              <LayoutIcon id={l.id} />
              <span className="tile-label" aria-hidden="true">
                {SHORT[l.id]}
              </span>
            </button>
          );
        })}
      </div>
      {current !== "single" && <Knobs key={current} def={def} />}
      {bare && <div className="hr" />}
    </section>
  );
});
