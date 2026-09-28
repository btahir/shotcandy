"use client";
/**
 * The motion timeline: play/pause, a scrubber over one loop (the moving part
 * of a "once" motion is tinted, the hold is dotted), the playhead time and a
 * Still button that returns to the editable design.
 */
import { type KeyboardEvent, type PointerEvent, useRef } from "react";
import { clipLength, getMotionPreset, sceneClip } from "@/engine";
import { useStore } from "@/lib/store";
import { Icon } from "../icons";
import { useApp, useScene, useUi } from "./context";

function segments(preset: ReturnType<typeof getMotionPreset>, loop: "once" | "boomerang") {
  if (!preset || preset.periodic) return [{ from: 0, to: 1, kind: "move" }];
  if (loop === "boomerang")
    return [
      { from: 0, to: 0.4, kind: "move" },
      { from: 0.4, to: 0.6, kind: "hold" },
      { from: 0.6, to: 1, kind: "move" },
    ];
  const [a, b] = preset.onceWindow ?? [0, 0.72];
  return [
    ...(a > 0 ? [{ from: 0, to: a, kind: "hold" }] : []),
    { from: a, to: b, kind: "move" },
    { from: b, to: 1, kind: "hold" },
  ];
}

export function Timeline({ narrow = false }: { narrow?: boolean }) {
  const app = useApp();
  const spec = useScene((s) => s.scene.animation);
  const clip = useScene((s) => sceneClip(s.scene));
  const busy = useUi((s) => !!s.motionExport);
  const playing = useStore(app.playback, (s) => s.playing);
  const t = useStore(app.playback, (s) => s.t);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  if (!spec) return null;
  // A recording's timeline is the trimmed clip; a still's is one motion loop.
  const D = clip ? clipLength(clip) : spec.duration;
  const preset = getMotionPreset(spec.preset);
  const at = t ?? app.restTime(spec);
  const pct = Math.max(0, Math.min(1, at / D));
  const fps = spec.fps;
  const segs = clip ? [{ from: 0, to: 1, kind: "move" }] : segments(preset, spec.loop);
  const tickStep = D > 120 ? 30 : D > 40 ? 10 : D > 15 ? 5 : 1;
  const ticks = Math.floor(D / tickStep);

  const seekAt = (clientX: number) => {
    const r = trackRef.current!.getBoundingClientRect();
    const u = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    // Snap the playhead to the export's frame grid, so what you see is a real frame.
    app.seek(Math.round(u * D * fps) / fps);
  };
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    seekAt(e.clientX);
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging.current) seekAt(e.clientX);
  };
  const onUp = () => {
    dragging.current = false;
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const frame = 1 / fps;
    const step = e.shiftKey ? 10 * frame : frame;
    let next: number | null = null;
    if (e.key === "ArrowRight") next = at + step;
    else if (e.key === "ArrowLeft") next = at - step;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = D;
    else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      app.togglePlay();
      return;
    }
    if (next === null) return;
    e.preventDefault();
    e.stopPropagation();
    app.seek(Math.round(Math.max(0, Math.min(D, next)) * fps) / fps);
  };

  return (
    <div
      className={`timeline${narrow ? " narrow" : ""}`}
      role="group"
      aria-label={clip ? "Recording playback" : "Motion preview"}
      data-testid="timeline"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="tl-play"
        aria-label={playing ? "Pause preview (M)" : "Play preview (M)"}
        title={playing ? "Pause (M)" : "Play (M)"}
        data-testid="play"
        disabled={busy}
        onClick={() => app.togglePlay()}
      >
        <Icon name={playing ? "pause" : "play"} size="sm" />
      </button>
      <div
        ref={trackRef}
        className="tl-track"
        role="slider"
        tabIndex={0}
        aria-label="Playhead"
        aria-valuemin={0}
        aria-valuemax={D}
        aria-valuenow={Math.round(at * 100) / 100}
        aria-valuetext={`${at.toFixed(1)} of ${D.toFixed(1)} seconds`}
        data-testid="scrubber"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={onKey}
      >
        <div className="tl-rail">
          {segs.map((s, i) => (
            <i
              key={i}
              className={`tl-seg ${s.kind}`}
              style={{ left: `${s.from * 100}%`, width: `${(s.to - s.from) * 100}%` }}
            />
          ))}
          <i className="tl-fill" style={{ width: `${pct * 100}%` }} />
        </div>
        {Array.from({ length: ticks + 1 }, (_, i) => (
          <b key={i} className="tl-tick" style={{ left: `${((i * tickStep) / D) * 100}%` }} />
        ))}
        <span className="tl-knob" style={{ left: `${pct * 100}%` }} />
      </div>
      <span className="tl-time mono" aria-hidden="true">
        {at.toFixed(1)}
        <span> / {D.toFixed(1)}s</span>
      </span>
      {!narrow && (
        <button
          type="button"
          className={`tl-still${t === null && !playing ? " on" : ""}`}
          title="Show the still design (to edit annotations)"
          aria-label="Show the still design"
          onClick={() => app.stopPreview()}
        >
          Still
        </button>
      )}
    </div>
  );
}

/** Rendering progress for animated exports, with cancel. */
export function RenderPill() {
  const app = useApp();
  const job = useUi((s) => s.motionExport);
  if (!job) return null;
  const pct = job.total ? Math.round((job.done / job.total) * 100) : 0;
  const label =
    job.stage === "starting"
      ? "Starting…"
      : job.stage === "palette"
        ? "Picking colours…"
        : job.stage === "finishing"
          ? "Finishing…"
          : `Frame ${job.done} of ${job.total}`;
  return (
    <div className="render-pill" role="status" aria-live="polite" data-testid="render-pill">
      <span className="rp-ring" style={{ ["--p" as string]: `${pct}%` }} aria-hidden="true">
        <Icon name="film" size="xs" />
      </span>
      <span className="rp-txt">
        <b>Rendering {job.format === "gif" ? "GIF" : job.format.toUpperCase()}</b>
        <span className="mono">
          {label} · {pct}%
        </span>
      </span>
      <span className="rp-bar" aria-hidden="true">
        <i style={{ width: `${pct}%` }} />
      </span>
      <button
        type="button"
        className="act"
        onClick={() => app.cancelMotionExport()}
        data-testid="cancel-render"
      >
        Cancel
      </button>
    </div>
  );
}
