"use client";
import { Fragment } from "react";
import { Icon, type IconName } from "../icons";
import type { Tool } from "./app";
import { useApp, useUi } from "./context";

export const TOOLS: { id: Tool; label: string; key: string; icon: IconName }[] = [
  { id: "select", label: "Select", key: "V", icon: "cursor" },
  { id: "text", label: "Text", key: "T", icon: "text" },
  { id: "arrow", label: "Arrow", key: "A", icon: "arrow" },
  { id: "rect", label: "Highlight", key: "R", icon: "rect" },
  { id: "redact", label: "Blur", key: "B", icon: "blur" },
];

/** Floating annotation tool dock (desktop). */
export function Dock() {
  const app = useApp();
  const tool = useUi((s) => s.tool);
  return (
    <div className="dock" role="toolbar" aria-label="Annotation tools" data-testid="dock">
      {TOOLS.map((t, i) => (
        <Fragment key={t.id}>
          {i === 1 && <span className="div" aria-hidden="true" />}
          <button
            type="button"
            className={`tool has-tip${tool === t.id ? " on" : ""}`}
            aria-label={`${t.label} (${t.key})`}
            aria-pressed={tool === t.id}
            onClick={() => app.setTool(t.id)}
          >
            <Icon name={t.icon} />
            <span className="tip" aria-hidden="true">
              {t.label} <span className="kbd">{t.key}</span>
            </span>
          </button>
        </Fragment>
      ))}
    </div>
  );
}

export const ZOOM_STEPS = [0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4];

export function stepZoom(current: number, dir: 1 | -1): number {
  if (dir > 0) return ZOOM_STEPS.find((z) => z > current + 0.001) ?? 4;
  return [...ZOOM_STEPS].reverse().find((z) => z < current - 0.001) ?? 0.1;
}

export function ZoomControl({ disabled }: { disabled?: boolean }) {
  const app = useApp();
  const zoom = useUi((s) => s.zoom);
  const fit = useUi((s) => s.fitZoom);
  const z = zoom ?? fit;
  return (
    <div className="zoom" role="group" aria-label="Zoom">
      <button
        type="button"
        className="icon-btn"
        aria-label="Zoom out (⌘−)"
        disabled={disabled}
        onClick={() => app.ui.set({ zoom: stepZoom(z, -1) })}
      >
        <Icon name="minus" size="sm" />
      </button>
      <button
        type="button"
        className="zval mono"
        disabled={disabled}
        aria-label={`Zoom ${Math.round(z * 100)}%. Fit to stage (⌘0)`}
        title="Fit (⌘0)"
        onClick={() => app.ui.set({ zoom: null, pan: { x: 0, y: 0 } })}
      >
        {disabled ? "–" : `${Math.round(z * 100)}%`}
      </button>
      <button
        type="button"
        className="icon-btn"
        aria-label="Zoom in (⌘+)"
        disabled={disabled}
        onClick={() => app.ui.set({ zoom: stepZoom(z, 1) })}
      >
        <Icon name="plus" size="sm" />
      </button>
    </div>
  );
}
