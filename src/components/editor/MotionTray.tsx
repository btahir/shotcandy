"use client";
/**
 * The Motion tray: pick a motion preset (tiles demo the movement with CSS),
 * then tune duration, easing, looping, amount, focus point and annotation
 * draw-on. The stage shows a live preview with a timeline scrubber.
 */
import { memo } from "react";
import { type MotionEasing, getMotionPreset, listMotionPresets, scrollViewport } from "@/engine";
import { Icon } from "../icons";
import { Segmented, Switch } from "../ui/controls";
import { Slider } from "../ui/Slider";
import { useApp, useScene, useUi } from "./context";

/** Tiles in display order; "none" first. */
export const MOTION_TILES = [
  "none",
  "reveal",
  "float",
  "sweep",
  "focus",
  "scroll",
  "draw",
  "drift",
  "flip",
];

/** A tiny CSS-animated stage that shows what each motion does. */
export function MotionGlyph({ id }: { id: string }) {
  return (
    <span className={`mg mg-${id}`} aria-hidden="true">
      <i className="mg-card">
        <b />
        <b />
        <b />
      </i>
      {id === "draw" && (
        <svg className="mg-draw" viewBox="0 0 60 36">
          <path d="M10 28 C 18 10, 34 8, 46 14" pathLength="1" />
          <path d="M40 9 L47 14.5 L39 18" pathLength="1" />
        </svg>
      )}
      {id === "focus" && <i className="mg-ring" />}
    </span>
  );
}

const EASE_OPTIONS: { value: MotionEasing; label: string }[] = [
  { value: "smooth", label: "Smooth" },
  { value: "snappy", label: "Snappy" },
  { value: "bounce", label: "Bouncy" },
  { value: "linear", label: "Linear" },
];

const FOCUS = [0.2, 0.5, 0.8];

export const MotionTray = memo(function MotionTray({ bare = false }: { bare?: boolean }) {
  const app = useApp();
  const spec = useScene((s) => s.scene.animation);
  const annotations = useScene(
    (s) => s.scene.annotations.filter((a) => a.kind !== "redact").length,
  );
  const hasContent = useUi((s) => s.hasContent);
  useUi((s) => s.assetsVersion);
  const preset = spec ? getMotionPreset(spec.preset) : undefined;
  const current = spec?.preset ?? "none";
  const presets = new Map(listMotionPresets().map((p) => [p.id, p]));
  const shortPage = hasContent && scrollViewport(app.scene, app.motionContext()) >= 0.98;
  const scrollNote = preset?.id === "scroll" && shortPage;
  // Pads with nothing to act on say so up front (REVIEW r2 N13).
  const hintFor = (id: string): string | null =>
    id === "draw" && annotations === 0
      ? "Add an arrow or text first: this draws your annotations on"
      : id === "scroll" && shortPage
        ? "Best for long pages: this screenshot already fits"
        : null;

  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const btns = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("button.mtile"));
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    const d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 3, ArrowUp: -3 }[e.key];
    if (!d) return;
    e.preventDefault();
    btns[Math.max(0, Math.min(btns.length - 1, i + d))]?.focus();
  };

  const body = (
    <>
      <div className="mtiles" onKeyDown={onKey} role="group" aria-label="Motion presets">
        {MOTION_TILES.map((id) => {
          const p = presets.get(id);
          if (id !== "none" && !p) return null;
          const label = p?.label ?? "None";
          const on = current === id;
          const hint = hintFor(id);
          return (
            <button
              key={id}
              type="button"
              className={`mtile${on ? " on" : ""}${hint ? " weak" : ""}`}
              aria-pressed={on}
              aria-label={
                p ? `${label} motion: ${hint ?? p.description}` : "No motion (still image)"
              }
              title={hint ?? p?.description ?? "A still image"}
              data-motion={id}
              onClick={() => app.setMotion(id === "none" ? null : id)}
            >
              <span className="mthumb thumb">
                <MotionGlyph id={id} />
              </span>
              <span className="name">{label}</span>
            </button>
          );
        })}
      </div>
      {spec && preset && (
        <div className="motion-controls" data-testid="motion-controls">
          {preset.id === "draw" && annotations === 0 && (
            <div className="warn-note draw-hint" data-testid="draw-hint" role="status">
              <Icon name="arrow" size="sm" />
              <span>
                Draw on animates your arrows, boxes and text. Add one first, or this exports a still
                clip.
                <span className="guard-acts">
                  <button type="button" className="link" onClick={() => app.setTool("arrow")}>
                    Add an arrow
                  </button>
                  <button type="button" className="link" onClick={() => app.setTool("text")}>
                    Add text
                  </button>
                </span>
              </span>
            </div>
          )}
          <Slider
            label="Length"
            value={spec.duration}
            min={1}
            max={12}
            step={0.5}
            typedMax={20}
            stops={[
              { value: 2, label: "2s" },
              { value: 4, label: "4s" },
              { value: 8, label: "8s" },
            ]}
            format={(v) => `${v.toFixed(1)}s`}
            valueText={(v) => `${v.toFixed(1)} seconds`}
            onChange={(v) =>
              app.updateMotion({ duration: Math.round(v * 2) / 2 }, "motion:duration")
            }
          />
          <Slider
            label="Amount"
            value={Math.round(spec.intensity * 100)}
            min={25}
            max={200}
            stops={[{ value: 100, label: "1×" }]}
            format={(v) => `${Math.round(v)}%`}
            valueText={(v) => `${Math.round(v)} percent`}
            onChange={(v) => app.updateMotion({ intensity: v / 100 }, "motion:intensity")}
          />
          {preset.periodic ? (
            <div className="loop-note">
              <Icon name="loop" size="sm" /> Loops seamlessly, forever
            </div>
          ) : (
            <>
              <div className="sub">Easing</div>
              <Segmented<MotionEasing>
                label="Easing"
                value={spec.easing === "gentle" ? "smooth" : spec.easing}
                onChange={(easing) => app.updateMotion({ easing })}
                options={EASE_OPTIONS}
              />
              <div className="sub" style={{ marginTop: 12 }}>
                Play
              </div>
              <Segmented
                label="Play"
                value={spec.loop}
                onChange={(loop) => app.updateMotion({ loop })}
                options={[
                  { value: "once", label: "Once, then hold" },
                  { value: "boomerang", label: "There and back" },
                ]}
              />
            </>
          )}
          {preset.id === "focus" && (
            <div className="focus-row">
              <div>
                <div className="sub" style={{ margin: 0 }}>
                  Zoom into
                </div>
                <p className="note" style={{ margin: "4px 0 0" }}>
                  Pick the part of the screenshot to zoom into.
                </p>
              </div>
              <div className="focus-grid" role="radiogroup" aria-label="Zoom into">
                {FOCUS.map((y) =>
                  FOCUS.map((x) => {
                    const on = Math.abs(spec.focusX - x) < 0.05 && Math.abs(spec.focusY - y) < 0.05;
                    const name = `${y < 0.4 ? "top" : y > 0.6 ? "bottom" : "middle"} ${x < 0.4 ? "left" : x > 0.6 ? "right" : "centre"}`;
                    return (
                      <button
                        key={`${x}-${y}`}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        aria-label={name}
                        className={on ? "on" : undefined}
                        onClick={() => app.updateMotion({ focusX: x, focusY: y }, "motion:focus")}
                      />
                    );
                  }),
                )}
              </div>
            </div>
          )}
          {scrollNote && (
            <p className="note">
              This shot isn’t tall enough to scroll, so it slowly pushes in instead.
            </p>
          )}
          <div className="toggle-row">
            <span className="label">
              Draw on annotations
              {annotations === 0 && preset.id !== "draw" && (
                <small>Add an arrow or text to draw it on</small>
              )}
            </span>
            <Switch
              checked={spec.annotations && annotations > 0}
              disabled={annotations === 0}
              label="Draw on annotations"
              onChange={(v) => app.updateMotion({ annotations: v })}
            />
          </div>
        </div>
      )}
    </>
  );

  if (bare) return <div className="motion-bare">{body}</div>;
  return (
    <section className="tray" aria-labelledby="t-motion" data-testid="motion-tray">
      <div className="tray-head">
        <h2 id="t-motion">Motion</h2>
        {spec ? (
          <span className="meta">
            {spec.duration.toFixed(1)}s ·{" "}
            {preset?.periodic ? "loop" : spec.loop === "boomerang" ? "there & back" : "once"}
          </span>
        ) : (
          <span className="meta">Still</span>
        )}
      </div>
      {body}
    </section>
  );
});
