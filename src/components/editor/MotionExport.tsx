"use client";
/** Export options for the motion clip: MP4 / WebM / GIF, size, frame rate and quality. */
import { useEffect, useMemo, useState } from "react";
import { type AnimationFormat, canEncodeFormat, roughAnimationBytes } from "@/engine";
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

/** Expected size of the motion export (a real sample encode, scaled up), debounced. */
export function useMotionEstimate(active: boolean): number | null {
  const app = useApp();
  const scene = useScene((s) => s.scene);
  const settings = useUi((s) => s.exportSettings.motion);
  const busy = useUi((s) => !!s.motionExport);
  const [res, setRes] = useState<{ key: unknown; bytes: number } | null>(null);
  const key = useMemo(() => [scene, settings], [scene, settings]);
  useEffect(() => {
    if (!active || busy || !scene.animation) return;
    let alive = true;
    const t = setTimeout(() => {
      app
        .estimateMotion(settings)
        .then((bytes) => alive && setRes({ key, bytes }))
        .catch(() => undefined);
    }, 400);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [active, busy, app, key, scene.animation, settings]);
  return res && res.key === key ? res.bytes : null;
}

const GIF_TARGET = 5 * 1024 * 1024;

/** "2–3 MB" / "400–600 KB": a range in one unit. */
export function formatRange([lo, hi]: [number, number]): string {
  const MB = 1024 * 1024;
  if (hi >= MB) {
    const f = (v: number) => (v < 10 ? v.toFixed(1) : String(Math.round(v)));
    return `${f(lo / MB)}–${f(hi / MB)} MB`;
  }
  return `${Math.round(lo / 1024)}–${Math.round(hi / 1024)} KB`;
}

export function MotionExportPanel({ onDone }: { onDone?: () => void }) {
  const app = useApp();
  const mod = useModKey();
  const spec = useScene((s) => s.scene.animation);
  useScene((s) => s.scene);
  const est = useMotionEstimate(true);
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
  // An instant range from the calibrated models; the sample encode refines it.
  const rough = plan
    ? roughAnimationBytes(plan, {
        format: settings.format,
        quality: settings.quality,
        preset: spec.preset,
        gifColors: settings.gifColors,
        dither: settings.dither,
      })
    : null;
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
            {plan.duration.toFixed(1)} s · {plan.frames} frames ·{" "}
            <span data-testid="motion-size" data-refined={est !== null ? "true" : "false"}>
              {est !== null
                ? `≈ ${formatBytes(est)}`
                : rough
                  ? `≈ ${formatRange(rough)}`
                  : "sizing…"}
            </span>
          </>
        )}
      </div>
      {gif && est !== null && (
        <div className="motion-fit">
          {est <= GIF_TARGET ? (
            <span className="fit-badge fits" data-testid="gif-fit">
              <Icon name="check" size="xs" /> Under 5 MB: fine for a README or a post
            </span>
          ) : (
            <>
              <span className="fit-badge over" data-testid="gif-fit">
                <Icon name="alert" size="xs" /> Over 5 MB. MP4 is about ten times smaller.
              </span>
              <span className="guard-acts">
                {support.mp4 !== false && (
                  <button type="button" className="link" onClick={() => set({ format: "mp4" })}>
                    Use MP4
                  </button>
                )}
                {settings.gifSize > 480 && (
                  <button
                    type="button"
                    className="link"
                    onClick={() =>
                      set({
                        gifSize:
                          GIF_SIZES[GIF_SIZES.findIndex((g) => g.value === settings.gifSize) - 1]
                            ?.value ?? 480,
                      })
                    }
                  >
                    Smaller size
                  </button>
                )}
                {settings.dither && (
                  <button type="button" className="link" onClick={() => set({ dither: false })}>
                    Dither off
                  </button>
                )}
              </span>
            </>
          )}
        </div>
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
