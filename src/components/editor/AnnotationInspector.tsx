"use client";
/** Contextual inspector for annotations: properties of the selection plus the list. */
import { useState } from "react";
import type { Annotation } from "@/engine";
import { ANNOTATION_FONTS } from "@/lib/fonts";
import { Icon, type IconName } from "../icons";
import { Segmented, Switch } from "../ui/controls";
import { Slider } from "../ui/Slider";
import { ANN_COLOURS } from "./app";
import { useApp, useScene, useUi } from "./context";
import { ColourButton } from "./Inspector";

const META: Record<Annotation["kind"], { name: string; icon: IconName; desc: string }> = {
  text: { name: "Text", icon: "text", desc: "Double-click to edit · drag the corner to resize" },
  arrow: { name: "Arrow", icon: "arrow", desc: "Drag the ends · middle dot bends it" },
  rect: { name: "Highlight", icon: "rect", desc: "Drag the handles · ⇧ for a square" },
  redact: { name: "Blur", icon: "blur", desc: "Hides what’s underneath for good" },
};

const TOOL_HINT: Record<string, { name: string; icon: IconName; desc: string }> = {
  text: { name: "Text", icon: "text", desc: "Click anywhere on the canvas to type" },
  arrow: { name: "Arrow", icon: "arrow", desc: "Drag on the canvas to draw an arrow" },
  rect: { name: "Highlight", icon: "rect", desc: "Drag on the canvas to draw a box" },
  redact: { name: "Blur", icon: "blur", desc: "Drag over anything private" },
  select: {
    name: "Annotations",
    icon: "cursor",
    desc: "Pick a tool below, or select an annotation",
  },
};

function detail(a: Annotation): string {
  switch (a.kind) {
    case "text":
      return `“${a.text.length > 18 ? `${a.text.slice(0, 18)}…` : a.text}”`;
    case "arrow":
      return `${a.curve ? "curved" : "straight"} · ${Math.round(a.width)}`;
    case "rect":
      return a.style;
    case "redact":
      return `${a.mode === "blur" ? "strength" : "pixels"} ${Math.round(a.strength)}`;
  }
}

export function Colours({
  value,
  onPick,
}: {
  value: string;
  onPick: (c: string, final: boolean) => void;
}) {
  const norm = value.toLowerCase().slice(0, 7);
  const isCustom = !ANN_COLOURS.some((c) => c.toLowerCase() === norm);
  return (
    <div className="ann-colours" role="group" aria-label="Colour">
      {ANN_COLOURS.map((c) => (
        <button
          key={c}
          type="button"
          className={`sw sm${c.toLowerCase() === norm ? " on" : ""}`}
          style={{ background: c }}
          aria-label={`Colour ${c}`}
          aria-pressed={c.toLowerCase() === norm}
          onClick={() => onPick(c, true)}
        />
      ))}
      <ColourButton
        className={`sw sm add rainbow${isCustom ? " on" : ""}`}
        value={value}
        label="Custom colour"
        onChange={onPick}
      />
    </div>
  );
}

/** `quickColours`: the colour row is shown elsewhere (the phone sheet puts it under the tools). */
export function AnnotationInspector({ quickColours = false }: { quickColours?: boolean }) {
  const app = useApp();
  const annotations = useScene((s) => s.scene.annotations);
  const selection = useScene((s) => s.selection);
  const tool = useUi((s) => s.tool);
  const annColor = useUi((s) => s.annColor);
  const a = annotations.find((x) => x.id === selection);
  const [dragId, setDragId] = useState<string | null>(null);
  const up = (patch: Partial<Annotation>, key?: string) =>
    a && app.updateAnnotation(a.id, patch, key ?? `ann:${a.id}:${Object.keys(patch).join(",")}`);
  const back = () => {
    app.setTool("select");
    app.store.select(null);
    app.ui.set({ editingText: null });
  };
  const head = a ? META[a.kind] : TOOL_HINT[tool]!;

  return (
    <>
      <section className="tray" aria-label="Annotation properties" data-testid="annotation-props">
        <div className="tray-head" style={{ marginBottom: 10 }}>
          <button type="button" className="link back" onClick={back}>
            <Icon name="chevronLeft" size="sm" /> Style
          </button>
          <span className="meta">
            {annotations.length} annotation{annotations.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="ann-head">
          <span className="badge" aria-hidden="true">
            <Icon name={head.icon} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 className="ttl">{head.name}</h2>
            <div className="desc">{head.desc}</div>
          </div>
          {a && (
            <>
              <button
                type="button"
                className="icon-btn"
                aria-label={`Delete ${head.name.toLowerCase()} (⌫)`}
                title="Delete (⌫)"
                data-testid="delete-annotation"
                onClick={() => app.deleteAnnotation(a.id)}
              >
                <Icon name="trash" />
              </button>
            </>
          )}
        </div>

        {!a && tool !== "redact" && !quickColours && (
          <>
            <div className="sub">Colour</div>
            <Colours value={annColor} onPick={(c) => app.ui.set({ annColor: c })} />
          </>
        )}

        {a?.kind === "text" && (
          <>
            <div className="sub">Text</div>
            <label className="input area">
              <span className="sr-only">Text</span>
              <textarea
                value={a.text}
                rows={2}
                onChange={(e) => up({ text: e.target.value }, `text:${a.id}`)}
                onKeyDown={(e) => e.stopPropagation()}
              />
            </label>
            {!quickColours && (
              <>
                {!quickColours && (
                  <>
                    <div className="sub">Colour</div>
                    <Colours
                      value={a.color}
                      onPick={(c, f) => up({ color: c }, f ? undefined : `ann:${a.id}:color`)}
                    />
                  </>
                )}
              </>
            )}
            <div style={{ marginTop: 12 }}>
              <Slider
                label="Size"
                value={a.size}
                min={12}
                max={200}
                typedMax={600}
                onChange={(v) => up({ size: v })}
              />
            </div>
            <div className="sub">Font</div>
            <Segmented
              label="Font"
              value={a.font}
              onChange={(v) => {
                const f = ANNOTATION_FONTS.find((x) => x.id === v)!;
                up({ font: v, weight: f.weight });
              }}
              options={ANNOTATION_FONTS.map((f) => ({ value: f.id, label: f.label }))}
            />
            <div className="sub">Align</div>
            <Segmented
              label="Align"
              value={a.align}
              onChange={(v) => up({ align: v })}
              options={[
                { value: "left", label: "Left", icon: <Icon name="alignLeft" size="sm" /> },
                { value: "center", label: "Centre", icon: <Icon name="alignCenter" size="sm" /> },
                { value: "right", label: "Right", icon: <Icon name="alignRight" size="sm" /> },
              ]}
            />
            <div className="toggle-row" style={{ marginTop: 8 }}>
              <span className="label">Pill behind text</span>
              {a.background && (
                <ColourButton
                  value={a.background}
                  label="Pill colour"
                  alpha
                  onChange={(c, f) => up({ background: c }, f ? undefined : `ann:${a.id}:bg`)}
                />
              )}
              <Switch
                checked={!!a.background}
                label="Pill behind text"
                onChange={(v) =>
                  up({
                    background: v
                      ? a.color.toLowerCase() === "#ffffff"
                        ? "#ff4f7b"
                        : "#ffffff"
                      : null,
                  })
                }
              />
            </div>
          </>
        )}

        {a?.kind === "arrow" && (
          <>
            {!quickColours && (
              <>
                {!quickColours && (
                  <>
                    <div className="sub">Colour</div>
                    <Colours
                      value={a.color}
                      onPick={(c, f) => up({ color: c }, f ? undefined : `ann:${a.id}:color`)}
                    />
                  </>
                )}
              </>
            )}
            <div style={{ marginTop: 12 }}>
              <Slider
                label="Width"
                value={a.width}
                min={1}
                max={24}
                onChange={(v) => up({ width: v })}
              />
              <Slider
                label="Curve"
                value={a.curve}
                min={-1}
                max={1}
                step={0.05}
                centered
                format={(v) => v.toFixed(2)}
                onChange={(v) => up({ curve: v })}
              />
            </div>
            <div className="sub" style={{ marginTop: 12 }}>
              Head
            </div>
            <Segmented
              label="Arrow head"
              value={a.head}
              onChange={(v) => up({ head: v })}
              options={[
                { value: "triangle", label: "Triangle" },
                { value: "line", label: "Line" },
                { value: "none", label: "None" },
              ]}
            />
          </>
        )}

        {a?.kind === "rect" && (
          <>
            <div className="sub">Style</div>
            <Segmented
              label="Highlight style"
              value={a.style}
              onChange={(v) => up({ style: v })}
              options={[
                { value: "outline", label: "Outline" },
                { value: "fill", label: "Marker" },
                { value: "spotlight", label: "Spotlight" },
              ]}
            />
            {a.style !== "spotlight" && (
              <>
                {!quickColours && (
                  <>
                    <div className="sub">Colour</div>
                    <Colours
                      value={a.color}
                      onPick={(c, f) => up({ color: c }, f ? undefined : `ann:${a.id}:color`)}
                    />
                  </>
                )}
              </>
            )}
            <div style={{ marginTop: 12 }}>
              {a.style === "outline" && (
                <Slider
                  label="Width"
                  value={a.width}
                  min={1}
                  max={24}
                  onChange={(v) => up({ width: v })}
                />
              )}
              <Slider
                label="Corners"
                value={a.radius}
                min={0}
                max={60}
                onChange={(v) => up({ radius: v })}
              />
            </div>
          </>
        )}

        {a?.kind === "redact" && (
          <>
            <div className="sub">Mode</div>
            <Segmented
              label="Redaction mode"
              value={a.mode}
              onChange={(v) => up({ mode: v })}
              options={[
                { value: "blur", label: "Blur" },
                { value: "pixelate", label: "Pixelate" },
              ]}
            />
            <div style={{ marginTop: 12 }}>
              <Slider
                label="Strength"
                value={a.strength}
                min={2}
                max={60}
                onChange={(v) => up({ strength: v })}
              />
            </div>
          </>
        )}

        {a && a.kind !== "redact" && (
          <div className="toggle-row" style={{ marginTop: 8 }}>
            <span className="label">Moves with screenshot</span>
            <Switch
              checked={a.anchor === "content"}
              label="Moves with screenshot"
              onChange={(v) => convertAnchor(app, a, v ? "content" : "canvas")}
            />
          </div>
        )}
      </section>

      <section className="tray" aria-labelledby="t-anns">
        <div className="tray-head">
          <h2 id="t-anns">Annotations</h2>
          <span className="meta">{annotations.length > 1 ? "drag to reorder" : ""}</span>
        </div>
        {annotations.length === 0 ? (
          <p className="note" style={{ marginTop: 0 }}>
            Nothing yet. Pick a tool from the dock and draw on your screenshot.
          </p>
        ) : (
          <ul className="ann-list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {[...annotations].reverse().map((x) => {
              const m = META[x.kind];
              const on = x.id === selection;
              return (
                <li
                  key={x.id}
                  draggable
                  onDragStart={(e) => {
                    setDragId(x.id);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/x-annotation", x.id);
                  }}
                  onDragOver={(e) => {
                    if (dragId) e.preventDefault();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!dragId || dragId === x.id) return;
                    app.moveAnnotation(
                      dragId,
                      annotations.findIndex((q) => q.id === x.id),
                    );
                    setDragId(null);
                  }}
                  onDragEnd={() => setDragId(null)}
                  style={{ opacity: dragId === x.id ? 0.5 : 1 }}
                >
                  <button
                    type="button"
                    className={`menu-item${on ? " active current" : ""}`}
                    aria-pressed={on}
                    onClick={() => {
                      app.setTool("select");
                      app.store.select(x.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
                        e.preventDefault();
                        e.stopPropagation();
                        const i = annotations.findIndex((q) => q.id === x.id);
                        app.moveAnnotation(x.id, i + (e.key === "ArrowUp" ? 1 : -1));
                      }
                    }}
                  >
                    <span style={{ color: "var(--sc-ink-2)", display: "grid" }}>
                      <Icon name={m.icon} />
                    </span>
                    <b style={{ fontWeight: 600 }}>{m.name}</b>
                    <span className="muted" style={{ fontSize: 12, marginLeft: "auto" }}>
                      {detail(x)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <div className="foot-note">
        <Icon name="keyboard" size="sm" /> T text · A arrow · R box · B blur · Esc done
      </div>
    </>
  );
}

/** Switch anchors while keeping the annotation where it is on screen. */
function convertAnchor(
  app: ReturnType<typeof useApp>,
  a: Annotation,
  anchor: "content" | "canvas",
) {
  if (a.anchor === anchor || a.kind === "redact") return;
  app.reanchor(a.id, anchor);
}
