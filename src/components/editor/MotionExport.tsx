"use client";
/** Export options for the motion clip: MP4 / WebM / GIF, size, frame rate and quality. */
import { useEffect, useState } from "react";
import { type AnimationFormat, canEncodeFormat } from "@/engine";
import { useModKey } from "@/lib/platform";
import { Icon } from "../icons";
import { Segmented, Switch } from "../ui/controls";
import { formatBytes } from "./app";
import { useApp, useScene, useUi } from "./context";

const VIDEO_RES = [
  { value: 720, label: "720p" },
  { value: 1080, label: "1080p" },
  { value: 1440, label: "1440p" },
  { value: 2160, label: "4K" },
];
const GIF_SIZES = [
  { value: 480, label: "S" },
  { value: 640, label: "M" },
  { value: 800, label: "L" },
  { value: 1080, label: "XL" },
];

/** Which video formats this browser can encode (null while probing). */
export function useVideoSupport() {
  const [support, setSupport] = useState<Record<"mp4" | "webm", boolean | null>>({
    mp4: null,
    webm: null,
  });
  useEffect(() => {
    let alive = true;
    void Promise.all([canEncodeFormat("mp4"), canEncodeFormat("webm")]).then(([mp4, webm]) => {
      if (alive) setSupport({ mp4, webm });
    });
    return () => {
      alive = false;
    };
  }, []);
  return support;
}

export function MotionExportPanel({ onDone }: { onDone?: () => void }) {
  const app = useApp();
  const mod = useModKey();
  const spec = useScene((s) => s.scene.animation);
  useScene((s) => s.scene);
  const settings = useUi((s) => s.exportSettings.motion);
  const busy = useUi((s) => !!s.motionExport);
  const support = useVideoSupport();
  const set = (patch: Partial<typeof settings>) =>
    app.setExportSettings({ motion: { ...settings, ...patch } });

  // Fall back to a format this browser can encode.
  useEffect(() => {
    if (settings.format === "mp4" && support.mp4 === false)
      set({ format: support.webm ? "webm" : "gif" });
    else if (settings.format === "webm" && support.webm === false)
      set({ format: support.mp4 ? "mp4" : "gif" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [support.mp4, support.webm]);

  if (!spec) {
    return (
      <div className="motion-empty">
        <Icon name="motion" />
        <p>
          Pick a motion in the <b>Motion</b> tray to export a video or GIF.
        </p>
      </div>
    );
  }
  const plan = app.motionPlan(settings);
  const gif = settings.format === "gif";
  const video = !gif;
  const bits = plan
    ? plan.width *
      plan.height *
      plan.fps *
      (settings.quality === "small" ? 0.05 : settings.quality === "best" ? 0.2 : 0.1)
    : 0;
  // Screen designs compress well: VBR lands around half the target bitrate.
  const est = plan && video ? (bits * plan.duration) / 8 / 2 : null;
  const label = settings.format === "gif" ? "GIF" : settings.format.toUpperCase();

  return (
    <div className="export-panel motion-export" data-testid="motion-export">
      <div className="sub">Format</div>
      <Segmented<AnimationFormat>
        label="Motion format"
        value={settings.format}
        onChange={(format) => set({ format })}
        options={[
          {
            value: "mp4",
            label: "MP4",
            disabled: support.mp4 === false,
            title:
              support.mp4 === false
                ? "This browser can't encode H.264 video"
                : "H.264 video, plays everywhere",
          },
          {
            value: "webm",
            label: "WebM",
            disabled: support.webm === false,
            title: support.webm === false ? "This browser can't encode WebM" : "VP9 video",
          },
          { value: "gif", label: "GIF", title: "Animated GIF, loops anywhere" },
        ]}
      />
      <div className="sub" style={{ marginTop: 14 }}>
        Size{" "}
        <span className="mono muted" data-testid="motion-dims">
          {plan ? `${plan.width} × ${plan.height} px` : ""}
        </span>
      </div>
      {video ? (
        <Segmented
          label="Video size"
          value={String(settings.videoRes)}
          onChange={(v) => set({ videoRes: Number(v) })}
          options={VIDEO_RES.map((r) => ({ value: String(r.value), label: r.label }))}
        />
      ) : (
        <Segmented
          label="GIF size"
          value={String(settings.gifSize)}
          onChange={(v) => set({ gifSize: Number(v) })}
          options={GIF_SIZES.map((r) => ({
            value: String(r.value),
            label: r.label,
            title: `${r.value} px on the long side`,
          }))}
        />
      )}
      <div className="sub" style={{ marginTop: 14 }}>
        Frame rate
      </div>
      {video ? (
        <Segmented
          label="Frame rate"
          value={String(spec.fps)}
          onChange={(v) => app.updateMotion({ fps: Number(v) })}
          options={[24, 30, 60].map((f) => ({ value: String(f), label: `${f} fps` }))}
        />
      ) : (
        <Segmented
          label="GIF frame rate"
          value={String(settings.gifFps)}
          onChange={(v) => set({ gifFps: Number(v) })}
          options={[10, 15, 20, 25].map((f) => ({ value: String(f), label: `${f}` }))}
        />
      )}
      <div className="sub" style={{ marginTop: 14 }}>
        {video ? "Quality" : "Colours"}
      </div>
      {video ? (
        <Segmented
          label="Video quality"
          value={settings.quality}
          onChange={(quality) => set({ quality })}
          options={[
            { value: "small", label: "Small" },
            { value: "balanced", label: "Balanced" },
            { value: "best", label: "Best" },
          ]}
        />
      ) : (
        <>
          <Segmented
            label="GIF colours"
            value={String(settings.gifColors)}
            onChange={(v) => set({ gifColors: Number(v) as 64 | 128 | 256 })}
            options={[64, 128, 256].map((c) => ({ value: String(c), label: String(c) }))}
          />
          <div className="toggle-row" style={{ marginTop: 6 }}>
            <span className="label">
              Smooth gradients
              <small>Dithering hides colour banding</small>
            </span>
            <Switch
              checked={settings.dither}
              label="Smooth gradients (dither)"
              onChange={(dither) => set({ dither })}
            />
          </div>
        </>
      )}
      <div className="motion-summary mono" data-testid="motion-summary">
        {plan && (
          <>
            {plan.duration.toFixed(1)} s · {plan.frames} frames
            {est ? ` · ≈ ${formatBytes(est)}` : ""}
          </>
        )}
      </div>
      {gif && plan && plan.width * plan.height * plan.frames > 90_000_000 && (
        <p className="note">Big GIF ahead. MP4 is about ten times smaller for the same clip.</p>
      )}
      <button
        type="button"
        className="btn btn-primary btn-block"
        data-testid="export-motion"
        disabled={busy}
        onClick={(e) => {
          void app.exportMotion(e.currentTarget);
          onDone?.();
        }}
      >
        <Icon name="film" /> Export {label}{" "}
        <span className="tag">{mod === "⌘" ? "⌘S" : "Ctrl S"}</span>
      </button>
    </div>
  );
}
