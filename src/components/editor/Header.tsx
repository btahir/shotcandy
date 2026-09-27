"use client";
/** Editor header: brand, size chip + menu, undo/redo, more menu, Copy and the Export split button. */
import Link from "next/link";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import {
  type CanvasSize,
  type ExportFormat,
  type SizePreset,
  PROJECT_EXTENSION,
  SIZE_PRESETS,
  getSizePreset,
  layoutScene,
  maxExportScale,
  rotateSize,
} from "@/engine";
import { GITHUB_URL, SUPPORT_URL } from "@/config/site";
import { useModKey } from "@/lib/platform";
import { setTheme, useThemePref } from "@/lib/theme";
import { Icon, LogoMark } from "../icons";
import { Popover, Segmented, Switch, menuKeys } from "../ui/controls";
import { Slider } from "../ui/Slider";
import { formatBytes } from "./app";
import { useApp, useScene, useUi } from "./context";
import { openFilePicker } from "./EmptyState";
import { MotionExportPanel } from "./MotionExport";
import {
  COPY_MAX_LONG,
  DESTINATIONS,
  type FitVerdict,
  type ScaleChoice,
  exportTag,
  fitVerdict,
  getDestination,
  ratioOk,
} from "./export-plan";
import { ModeSwitch } from "./ModeSwitch";
import { APPSTORE_SIZES, setCanvasSize } from "@/engine";
import { useStore } from "@/lib/store";

const RATIO_HINT: Record<string, string> = {
  "16x9": "widescreen",
  "4x3": "classic",
  "1x1": "square",
  "4x5": "portrait",
  "9x16": "story",
};

export function sizeLabel(size: CanvasSize): string {
  if (size.kind === "auto") return "Auto";
  const p = size.presetId ? SIZE_PRESETS.find((x) => x.id === size.presetId) : undefined;
  if (p) return p.label.replace('"', "″");
  return size.kind === "aspect" ? `${size.ratioW}:${size.ratioH}` : "Custom";
}

function Glyph({ w, h }: { w: number; h: number }) {
  const m = 18 / Math.max(w, h);
  return (
    <span className="ratio-glyph" aria-hidden="true">
      <i style={{ width: w * m, height: h * m }} />
    </span>
  );
}

function presetDims(p: SizePreset): [number, number] {
  if (p.size.kind === "fixed") return [p.size.width, p.size.height];
  if (p.size.kind === "aspect") return [p.size.ratioW, p.size.ratioH];
  return [16, 10];
}

function useCanvasSize() {
  const app = useApp();
  const scene = useScene((s) => s.scene);
  const v = useUi((s) => s.assetsVersion);
  const f = useUi((s) => s.fontsReady);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => layoutScene(scene, app.library), [scene, app, v, f]);
}

export function SizeChip({ compact = false }: { compact?: boolean }) {
  const app = useApp();
  const size = useScene((s) => s.scene.canvas.size);
  const hasContent = useUi((s) => s.hasContent);
  const open = useUi((s) => s.popover === "size");
  const layout = useCanvasSize();
  const ref = useRef<HTMLButtonElement>(null);
  const meta =
    size.kind === "fixed"
      ? `${size.width} × ${size.height}`
      : hasContent
        ? `${layout.canvas.width} × ${layout.canvas.height}`
        : size.kind === "auto"
          ? "fits your image"
          : `${size.ratioW}:${size.ratioH}`;
  return (
    <>
      <button
        ref={ref}
        type="button"
        className={`chip${open ? " on" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="size-chip"
        aria-label={`Canvas size: ${sizeLabel(size)}, ${meta}. Change size (K)`}
        onClick={() => app.ui.set({ popover: open ? null : "size" })}
      >
        <Icon name="ratio" size="sm" /> {sizeLabel(size)}
        {!compact && <span className={/\d/.test(meta) ? "mono" : "meta-txt"}>{meta}</span>}
        <Icon name="chevronDown" size="sm" />
      </button>
      <SizeMenu anchor={ref} open={open} />
    </>
  );
}

function SizeMenu({ anchor, open }: { anchor: RefObject<HTMLElement | null>; open: boolean }) {
  const app = useApp();
  const size = useScene((s) => s.scene.canvas.size);
  const [landscape, setLandscape] = useState(false);
  const layout = useCanvasSize();
  const [cw, setCw] = useState("1600");
  const [ch, setCh] = useState("1000");
  const current = size.kind === "auto" ? "auto" : (size.presetId ?? null);
  const close = () => app.ui.set({ popover: null });
  const pick = (p: SizePreset) => {
    const s = landscape && p.group === "appstore" ? rotateSize(p.size) : p.size;
    app.setSize(s);
    app.announce(`Size: ${p.label} ${p.hint}`);
    close();
  };
  const item = (p: SizePreset, hint?: string) => {
    const [w, h] = presetDims(p);
    const dims = landscape && p.group === "appstore" ? [h, w] : [w, h];
    return (
      <button
        key={p.id}
        type="button"
        role="radio"
        aria-checked={current === p.id}
        className={`menu-item${current === p.id ? " current" : ""}`}
        onClick={() => pick(p)}
      >
        <Glyph w={dims[0]!} h={dims[1]!} />
        {p.label.replace(/"/g, "″")}
        {(() => {
          const h = hint ?? (p.size.kind === "fixed" ? `${dims[0]} × ${dims[1]}` : p.hint);
          return <span className={/^\d/.test(h) ? "mono" : "meta-txt"}>{h}</span>;
        })()}
      </button>
    );
  };
  const g = (group: string) => SIZE_PRESETS.filter((p) => p.group === group);
  useEffect(() => {
    if (open) {
      setCw(String(layout.canvas.width));
      setCh(String(layout.canvas.height));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const setCustom = () => {
    const w = Math.round(Number(cw));
    const h = Math.round(Number(ch));
    if (w >= 16 && h >= 16 && w <= 8192 && h <= 8192) {
      app.setSize({ kind: "fixed", width: w, height: h });
      close();
    }
  };
  return (
    <Popover
      open={open}
      anchor={anchor}
      onClose={close}
      label="Canvas size"
      role="dialog"
      className="size-menu"
    >
      <div onKeyDown={menuKeys}>
        <div className="cols">
          <div>
            <div className="menu-label" id="sz-fit">
              Fit
            </div>
            <div role="radiogroup" aria-labelledby="sz-fit">
              {item(g("free")[0]!, "fits your image")}
            </div>
            <div className="menu-label" id="sz-ratio">
              Ratio
            </div>
            <div role="radiogroup" aria-labelledby="sz-ratio">
              {g("ratio").map((p) => item(p, RATIO_HINT[p.id]))}
            </div>
          </div>
          <div>
            <div className="menu-label" id="sz-social">
              Social
            </div>
            <div role="radiogroup" aria-labelledby="sz-social">
              {g("social").map((p) => item(p))}
            </div>
          </div>
          <div>
            <div className="menu-label" id="sz-app">
              App Store
            </div>
            <div role="radiogroup" aria-labelledby="sz-app">
              {g("appstore").map((p) => item(p))}
            </div>
            <div className="menu-label">Orientation</div>
            <div style={{ padding: "2px 6px" }}>
              <Segmented
                label="App Store orientation"
                value={landscape ? "landscape" : "portrait"}
                onChange={(v) => setLandscape(v === "landscape")}
                options={[
                  { value: "portrait", label: "Portrait" },
                  { value: "landscape", label: "Landscape" },
                ]}
              />
            </div>
            <p className="note" style={{ padding: "0 10px" }}>
              App Store screenshots can’t have transparency.
            </p>
          </div>
        </div>
        <div className="custom">
          <span style={{ fontWeight: 600, color: "var(--sc-ink-2)", fontSize: 13, flex: 1 }}>
            Custom
          </span>
          <label className="input mono-input">
            <span className="sr-only">Custom width</span>
            <input
              value={cw}
              inputMode="numeric"
              onChange={(e) => setCw(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && setCustom()}
            />
          </label>
          <span className="muted">×</span>
          <label className="input mono-input">
            <span className="sr-only">Custom height</span>
            <input
              value={ch}
              inputMode="numeric"
              onChange={(e) => setCh(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && setCustom()}
            />
          </label>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            style={{ height: 32 }}
            onClick={setCustom}
          >
            Set
          </button>
        </div>
      </div>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Export popover
// ---------------------------------------------------------------------------

const TOKENS = [
  ["{name}", "name"],
  ["{style}", "style"],
  ["{w}", "width"],
  ["{h}", "height"],
  ["{scale}", "scale"],
  ["{date}", "date"],
  ["{time}", "time"],
  ["{preset}", "size preset"],
] as const;

export interface ExportPreview {
  width: number;
  height: number;
  bytes: number;
  format: ExportFormat;
  fitted: boolean;
}

/**
 * The file the current export settings save, encoded for real (debounced,
 * cached in the app so Download reuses it). Null while it's being made.
 */
export function useExportResult(active: boolean): ExportPreview | null {
  const app = useApp();
  const scene = useScene((s) => s.scene);
  const settings = useUi((s) => s.exportSettings);
  const v = useUi((s) => s.assetsVersion);
  const [res, setRes] = useState<{ key: unknown; value: ExportPreview } | null>(null);
  const key = useMemo(() => [scene, settings, v], [scene, settings, v]);
  useEffect(() => {
    if (!active || !app.ui.get().hasContent || app.ui.get().mode === "appstore") return;
    let alive = true;
    const t = setTimeout(() => {
      app
        .previewExport(settings)
        .then((r) => {
          if (!alive) return;
          const format: ExportFormat = r.mime.includes("jpeg")
            ? "jpeg"
            : r.mime.includes("webp")
              ? "webp"
              : "png";
          setRes({
            key,
            value: {
              width: r.width,
              height: r.height,
              bytes: r.blob.size,
              format,
              fitted: r.fitted,
            },
          });
        })
        .catch(() => undefined);
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [active, app, key, settings]);
  return res && res.key === key ? res.value : null;
}

/** App Store mode: what the set exports to. */
export function SetChip() {
  const app = useApp();
  const set = useStore(app.sets.state, (s) => s.set);
  const p = APPSTORE_SIZES.find((x) => x.id === set.sizePresetId);
  const size = setCanvasSize(set);
  return (
    <span className="chip static" data-testid="set-chip">
      <Icon name="phones" size="sm" /> {p?.label.replace('"', "″")}
      <span className="mono">
        {size.width} × {size.height} · {set.slides.length} slides
      </span>
    </span>
  );
}

export function SetExportPanel({
  onDone,
  mobile = false,
}: {
  onDone?: () => void;
  mobile?: boolean;
}) {
  const app = useApp();
  const settings = useUi((s) => s.exportSettings);
  const set = useStore(app.sets.state, (s) => s.set);
  const selected = useStore(app.sets.state, (s) => s.selected);
  const packing = useStore(app.sets.state, (s) => s.packing);
  useUi((s) => s.assetsVersion);
  const [includeEmpty, setIncludeEmpty] = useState(false);
  const size = setCanvasSize(set);
  const fmt = settings.format === "jpeg" ? "jpeg" : "png";
  const empty = app.sets.emptySlides(set);
  const count = set.slides.length - (includeEmpty ? 0 : empty.length);
  return (
    <div className="export-panel" data-testid="set-export">
      <div className="export-head">
        {mobile ? <span /> : <h2>Export set</h2>}
        <span className="mono muted">
          {set.slides.length} × {size.width} × {size.height}
        </span>
      </div>
      <div className="sub">Format</div>
      <Segmented
        label="Format"
        value={fmt}
        onChange={(format) => app.setExportSettings({ format })}
        options={[
          { value: "png", label: "PNG (no alpha)" },
          { value: "jpeg", label: "JPEG" },
        ]}
      />
      <p className="note">
        Exact App Store Connect sizes, opaque, numbered in order. Upload up to 10 per device size.
      </p>
      {empty.length > 0 && (
        <div className="warn-note set-empty" data-testid="set-empty" role="status">
          <Icon name="alert" size="sm" />
          <span>
            {empty.length === 1
              ? `Slide ${empty[0]! + 1} has no screenshot.`
              : `${empty.length} slides have no screenshot.`}
            <Segmented
              label="Slides without a screenshot"
              className="set-empty-seg"
              value={includeEmpty ? "include" : "skip"}
              onChange={(v) => setIncludeEmpty(v === "include")}
              options={[
                { value: "skip", label: "Skip them" },
                { value: "include", label: "Export anyway" },
              ]}
            />
          </span>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 8, marginTop: 14 }}>
        {mobile ? (
          <button
            type="button"
            className="btn btn-secondary"
            data-testid="save-slide"
            onClick={() => {
              void app.sets.saveSlide(selected, fmt);
              onDone?.();
            }}
          >
            <Icon name="download" /> Save slide {selected + 1}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={(e) => {
              app.copy(e.currentTarget);
              onDone?.();
            }}
          >
            <Icon name="copy" /> Copy slide
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary"
          data-testid="export-zip"
          disabled={!!packing || count === 0}
          onClick={() => {
            void app.sets.exportZip(fmt, { includeEmpty });
            onDone?.();
          }}
        >
          <Icon name="zip" /> Export ZIP{count !== set.slides.length ? ` (${count})` : ""}
        </button>
      </div>
    </div>
  );
}

/** The Export popover: Image or Video/GIF tabs. */
export function ExportPopover({ onDone }: { onDone?: () => void }) {
  const app = useApp();
  const mode = useUi((s) => s.mode);
  const kind = useUi((s) => s.exportSettings.kind);
  const hasMotion = useScene((s) => !!s.scene.animation);
  const tab = kind === "motion" ? "motion" : "image";
  if (mode === "appstore") return <SetExportPanel onDone={onDone} />;
  return (
    <div>
      <div className="export-head">
        <h2>Export</h2>
        <Segmented
          label="Export type"
          role="tablist"
          value={tab}
          onChange={(v) => app.setExportSettings({ kind: v })}
          options={[
            { value: "image", label: "Image", icon: <Icon name="image" size="xs" /> },
            {
              value: "motion",
              label: "Video",
              icon: <Icon name="film" size="xs" />,
              title: hasMotion ? "MP4, WebM or GIF" : "Pick a motion first",
            },
          ]}
        />
      </div>
      {tab === "motion" ? (
        <MotionExportPanel onDone={onDone} />
      ) : (
        <ExportPanel onDone={onDone} titled={false} />
      )}
    </div>
  );
}

/** The plan the current export settings produce (size, format, scale). */
export function useExportPlan(copy = false) {
  const app = useApp();
  const scene = useScene((s) => s.scene);
  const settings = useUi((s) => s.exportSettings);
  const v = useUi((s) => s.assetsVersion);
  const mode = useUi((s) => s.mode);
  return useMemo(
    () => app.exportPlan(settings, { copy }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [app, scene, settings, v, mode, copy],
  );
}

function FitBadge({ verdict }: { verdict: FitVerdict }) {
  if (verdict.kind === "none") return null;
  return (
    <span className={`fit-badge ${verdict.kind}`} data-testid="fit-badge">
      <Icon name={verdict.kind === "fits" ? "check" : "alert"} size="xs" />
      {verdict.label}
    </span>
  );
}

/** Destination chips: each picks format, scale and size for a place. */
export function DestinationChips() {
  const app = useApp();
  const dest = useUi((s) => s.exportSettings.destination);
  return (
    <div className="dest-chips" role="radiogroup" aria-label="Export for">
      {DESTINATIONS.map((d) => (
        <button
          key={d.id}
          type="button"
          role="radio"
          aria-checked={dest === d.id}
          className={`chip dest${dest === d.id ? " on" : " soft"}`}
          title={d.blurb}
          onClick={() => app.setExportSettings({ destination: d.id })}
          onKeyDown={(e) => {
            const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
            if (!dir) return;
            e.preventDefault();
            const i = DESTINATIONS.findIndex((x) => x.id === dest);
            const next = DESTINATIONS[(i + dir + DESTINATIONS.length) % DESTINATIONS.length]!;
            app.setExportSettings({ destination: next.id });
            const root = e.currentTarget.parentElement;
            requestAnimationFrame(() =>
              root?.querySelector<HTMLButtonElement>(`[data-dest="${next.id}"]`)?.focus(),
            );
          }}
          data-dest={d.id}
          tabIndex={dest === d.id ? 0 : -1}
        >
          {d.label}
        </button>
      ))}
    </div>
  );
}

export function ExportPanel({
  onDone,
  compact = false,
  titled = true,
}: {
  onDone?: () => void;
  compact?: boolean;
  titled?: boolean;
}) {
  const app = useApp();
  const mod = useModKey();
  const settings = useUi((s) => s.exportSettings);
  const copyState = useUi((s) => s.copyState);
  const exportBusy = useUi((s) => s.exportBusy);
  const size = useScene((s) => s.scene.canvas.size);
  const fill = useScene((s) => s.scene.background.fill.kind);
  const layout = useCanvasSize();
  const plan = useExportPlan();
  const copyPlan = useExportPlan(true);
  const dest = getDestination(settings.destination);
  const result = useExportResult(true);
  const [tokensOpen, setTokensOpen] = useState(false);
  const tokRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const max = Math.max(1, maxExportScale(layout));
  const W = layout.canvas.width;
  const H = layout.canvas.height;
  const est = result?.bytes ?? null;
  const outFormat = result?.format ?? plan.format;
  const outW = result?.width ?? plan.width;
  const outH = result?.height ?? plan.height;
  const verdict = fitVerdict(dest, est, outFormat, result?.fitted);
  const heavy = dest.id === "original" && est !== null && est > 5 * 1024 * 1024;
  const preview = app.filenameFor(
    { width: outW, height: outH },
    { ...settings, format: outFormat },
    plan.scale,
  );
  const appstore = size.kind === "fixed" && size.presetId?.startsWith("appstore");
  const ratioBad = !ratioOk(dest, W, H);
  const fullLong = Math.max(W, H) * (settings.scale || plan.autoScale || 1);
  const insert = (tok: string) => {
    const el = inputRef.current;
    const v = settings.pattern;
    const at = el?.selectionStart ?? v.length;
    const end = el?.selectionEnd ?? v.length;
    app.setExportSettings({ pattern: v.slice(0, at) + tok + v.slice(end) });
    setTokensOpen(false);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + tok.length, at + tok.length);
    });
  };
  return (
    <div className="export-panel">
      {!compact && titled && (
        <div className="export-head">
          <h2>Export</h2>
        </div>
      )}
      <div className="sub">For</div>
      <DestinationChips />
      <div className="export-summary" data-testid="export-summary">
        <div className="dims">
          <span className="mono" data-testid="export-dims">
            {outW} × {outH}
          </span>
          <span className="fmt" data-testid="export-format">
            {outFormat === "jpeg" ? "JPEG" : outFormat.toUpperCase()}
          </span>
          <span className="mono est" data-testid="export-size" aria-live="polite">
            {est !== null ? formatBytes(est) : "sizing…"}
          </span>
        </div>
        <div className="why">
          {verdict.kind !== "none" ? (
            <FitBadge verdict={verdict} />
          ) : heavy ? (
            <span className="fit-badge switch">
              <Icon name="alert" size="xs" /> Over 5 MB: pick X or LinkedIn to fit
            </span>
          ) : (
            <span className="blurb">
              {dest.id === "original"
                ? settings.scale === 0
                  ? plan.autoScale === 1
                    ? "Auto: your screenshot’s own pixels, nothing upscaled."
                    : `Auto: ${plan.autoScale}× so text stays crisp on retina screens.`
                  : `${settings.scale}× the canvas.`
                : dest.blurb}
            </span>
          )}
        </div>
        {ratioBad && dest.ratio && (
          <div className="why">
            <span className="fit-badge switch">
              <Icon name="alert" size="xs" /> {dest.label} crops this shape
            </span>
            <button
              type="button"
              className="link"
              onClick={() => {
                const p = getSizePreset(dest.ratio!.fix);
                if (p) app.setSize(p.size);
              }}
            >
              {dest.ratio.fixLabel}
            </button>
          </div>
        )}
      </div>
      {dest.id === "original" && (
        <>
          <div className="sub" style={{ marginTop: 14 }}>
            Format
          </div>
          <Segmented<ExportFormat>
            label="Format"
            value={settings.format}
            onChange={(format) => app.setExportSettings({ format })}
            options={[
              { value: "png", label: "PNG" },
              { value: "jpeg", label: "JPEG" },
              { value: "webp", label: "WebP" },
            ]}
          />
          <div className="sub" style={{ marginTop: 14 }}>
            Scale
          </div>
          <Segmented
            label="Scale"
            value={String(settings.scale)}
            onChange={(v) => app.setExportSettings({ scale: Number(v) as ScaleChoice })}
            options={[0, 1, 2, 3, 4].map((s) => ({
              value: String(s),
              label: s === 0 ? `Auto ${plan.autoScale ?? 1}×` : `${s}×`,
              disabled: s > max,
              title:
                s === 0
                  ? "1× when your screenshot is already at full resolution"
                  : s > max
                    ? "Too large for this browser's canvas limit"
                    : undefined,
            }))}
          />
          {settings.format === "png" ? (
            <p className="quality-line">
              Quality <span>Lossless (PNG)</span>
            </p>
          ) : (
            <div style={{ marginTop: 10 }}>
              <Slider
                label="Quality"
                value={Math.round(settings.quality * 100)}
                min={30}
                max={100}
                format={(v) => `${Math.round(v)}`}
                onChange={(v) => app.setExportSettings({ quality: v / 100 })}
              />
            </div>
          )}
        </>
      )}
      {dest.id === "original" && fullLong > COPY_MAX_LONG && (
        <div className="toggle-row">
          <span className="label">
            Copy at full size
            <small>
              {settings.copyFull
                ? `Copies ${plan.width} × ${plan.height}`
                : `Copies ${copyPlan.width} × ${copyPlan.height}, light enough to paste`}
            </small>
          </span>
          <Switch
            checked={settings.copyFull}
            label="Copy at full size"
            onChange={(v) => app.setExportSettings({ copyFull: v })}
          />
        </div>
      )}
      {!compact && (
        <>
          <div className="sub" style={{ marginTop: 10 }}>
            File name
          </div>
          <div className="input mono-input">
            <label className="sr-only" htmlFor="sc-pattern">
              File name pattern
            </label>
            <input
              id="sc-pattern"
              ref={inputRef}
              value={settings.pattern}
              spellCheck={false}
              onChange={(e) => app.setExportSettings({ pattern: e.target.value })}
              onKeyDown={(e) => e.stopPropagation()}
            />
            <button
              ref={tokRef}
              type="button"
              className="kbd"
              style={{ cursor: "pointer" }}
              aria-label="Insert a name token"
              aria-expanded={tokensOpen}
              onClick={() => setTokensOpen((o) => !o)}
            >
              {"{ }"}
            </button>
          </div>
          <Popover
            open={tokensOpen}
            anchor={tokRef}
            onClose={() => setTokensOpen(false)}
            label="Name tokens"
            role="menu"
            align="end"
            className="menu"
          >
            <div onKeyDown={menuKeys}>
              {TOKENS.map(([t, d]) => (
                <button
                  key={t}
                  type="button"
                  role="menuitem"
                  className="menu-item"
                  onClick={() => insert(t)}
                >
                  <span className="mono" style={{ margin: 0, color: "var(--sc-ink)" }}>
                    {t}
                  </span>
                  <span className="meta">{d}</span>
                </button>
              ))}
            </div>
          </Popover>
          <div
            className="mono muted"
            style={{ margin: "6px 2px 16px", overflowWrap: "anywhere" }}
            data-testid="filename-preview"
          >
            → {preview}
          </div>
        </>
      )}
      {appstore && fill === "none" && (
        <div className="warn-note">
          <Icon name="alert" size="sm" /> App Store screenshots can’t be transparent. Pick a
          background, or export JPEG.
        </div>
      )}
      {plan.format === "jpeg" && fill === "none" && !appstore && (
        <p className="note">JPEG has no transparency, so the background becomes white.</p>
      )}
      {!compact && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 8 }}>
          <button
            type="button"
            className={`btn btn-secondary${copyState === "busy" ? " pressed shimmer-busy" : ""}`}
            aria-busy={copyState === "busy"}
            onClick={(e) => {
              app.copy(e.currentTarget);
              onDone?.();
            }}
          >
            <Icon name="copy" /> Copy
          </button>
          <button
            type="button"
            className={`btn btn-primary${exportBusy ? " pressed shimmer-busy" : ""}`}
            aria-busy={exportBusy}
            data-testid="download"
            onClick={(e) => {
              void app.downloadImage(e.currentTarget);
              onDone?.();
            }}
          >
            <Icon name="download" /> Download{" "}
            <span className="tag">{mod === "⌘" ? "⌘S" : "Ctrl S"}</span>
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// More menu
// ---------------------------------------------------------------------------

function MoreMenu({ anchor, open }: { anchor: RefObject<HTMLElement | null>; open: boolean }) {
  const app = useApp();
  const hasContent = useUi((s) => s.hasContent);
  const recents = useUi((s) => s.recents.length);
  const theme = useThemePref();
  const close = () => app.ui.set({ popover: null });
  const run = (fn: () => void) => () => {
    close();
    fn();
  };
  return (
    <Popover
      open={open}
      anchor={anchor}
      onClose={close}
      label="More"
      role="dialog"
      align="end"
      className="menu"
      width={280}
    >
      <div onKeyDown={menuKeys}>
        <div role="menu" aria-label="File">
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={run(() => openFilePicker((f) => void app.loadBlob(f, { source: "file" })))}
          >
            <Icon name="image" size="sm" /> Open image… <span className="meta mono">⌘O</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={run(() => void app.pasteFromClipboard())}
          >
            <Icon name="clipboard" size="sm" /> Paste from clipboard{" "}
            <span className="meta mono">⌘V</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            disabled={recents === 0}
            onClick={run(() => app.ui.set({ modal: "recents" }))}
          >
            <Icon name="clock" size="sm" /> Recent designs
            <span className="meta mono">{recents || ""}</span>
          </button>
          <div className="menu-sep" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            disabled={!hasContent}
            onClick={run(() => void app.saveProject())}
          >
            <Icon name="save" size="sm" /> Save project file
          </button>
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={run(() =>
              openFilePicker(
                (f) => void app.openProject(f),
                `.${PROJECT_EXTENSION},application/json,application/vnd.shotcandy.project+json`,
              ),
            )}
          >
            <Icon name="folder" size="sm" /> Open project file…
          </button>
          <div className="menu-sep" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={run(() => app.ui.set({ modal: "shortcuts" }))}
          >
            <Icon name="keyboard" size="sm" /> Keyboard shortcuts{" "}
            <span className="meta mono">?</span>
          </button>
        </div>
        <div className="menu-label">Theme</div>
        <div style={{ padding: "0 6px 6px" }}>
          <Segmented
            label="Theme"
            value={theme}
            onChange={(v) => setTheme(v)}
            options={[
              { value: "system", label: "System", icon: <Icon name="monitor" size="xs" /> },
              { value: "light", label: "Light", icon: <Icon name="sun" size="xs" /> },
              { value: "dark", label: "Dark", icon: <Icon name="moon" size="xs" /> },
            ]}
          />
        </div>
        <div className="menu-sep" role="separator" />
        <div role="menu" aria-label="Project">
          <Link
            role="menuitem"
            className="menu-item"
            href="/about/"
            prefetch={false}
            onClick={close}
          >
            <LogoMark className="i-sm" /> About Shotcandy
          </Link>
          <a
            role="menuitem"
            className="menu-item"
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
          >
            <Icon name="github" size="sm" /> Source on GitHub
          </a>
          <a
            role="menuitem"
            className="menu-item"
            href={SUPPORT_URL}
            target="_blank"
            rel="noreferrer"
            style={{ color: "var(--sc-accent-text)", fontWeight: 700 }}
          >
            <Icon name="heart" size="sm" style={{ color: "var(--sc-accent-text)" }} /> Support this
            project
          </a>
        </div>
      </div>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

export function Header() {
  const app = useApp();
  const mod = useModKey();
  const canUndo = useScene((s) => s.canUndo);
  const canRedo = useScene((s) => s.canRedo);
  const hasContent = useUi((s) => s.hasContent);
  const popover = useUi((s) => s.popover);
  const copyState = useUi((s) => s.copyState);
  const exportBusy = useUi((s) => s.exportBusy);
  const settings = useUi((s) => s.exportSettings);
  const motionJob = useUi((s) => s.motionExport);
  const mode = useUi((s) => s.mode);
  const packing = useStore(app.sets.state, (s) => s.packing);
  const hasMotion = useScene((s) => !!s.scene.animation);
  const motionKind = settings.kind === "motion" && hasMotion;
  const m = settings.motion;
  const motionTag =
    m.format === "gif"
      ? `GIF · ${m.gifSize}`
      : `${m.format.toUpperCase()} · ${m.videoRes === 2160 ? "4K" : `${m.videoRes}p`}`;
  const plan = useExportPlan();
  const tag = exportTag(plan, getDestination(settings.destination), settings.scale);
  const moreRef = useRef<HTMLButtonElement>(null);
  const exportRef = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLButtonElement>(null);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!exportBusy && copyState !== "busy") return setSlow(false);
    const t = setTimeout(() => setSlow(true), 300);
    return () => clearTimeout(t);
  }, [exportBusy, copyState]);

  return (
    <header className="header">
      <Link
        className="brand"
        href="/about/"
        prefetch={false}
        aria-label="Shotcandy — about this project"
      >
        <LogoMark className="mark" />
        <span className="word">shotcandy</span>
      </Link>
      <ModeSwitch />
      <div className="centre">{mode === "appstore" ? <SetChip /> : <SizeChip />}</div>
      <div className="spacer" />
      <button
        type="button"
        className="icon-btn"
        aria-label="Undo (⌘Z)"
        title="Undo (⌘Z)"
        disabled={!canUndo}
        onClick={() => app.store.undo()}
      >
        <Icon name="undo" />
      </button>
      <button
        type="button"
        className="icon-btn"
        aria-label="Redo (⇧⌘Z)"
        title="Redo (⇧⌘Z)"
        disabled={!canRedo}
        onClick={() => app.store.redo()}
      >
        <Icon name="redo" />
      </button>
      <button
        ref={moreRef}
        type="button"
        className="icon-btn"
        aria-label="More"
        aria-haspopup="menu"
        aria-expanded={popover === "more"}
        onClick={() => app.ui.set({ popover: popover === "more" ? null : "more" })}
      >
        <Icon name="more" />
      </button>
      <MoreMenu anchor={moreRef} open={popover === "more"} />
      <span className="sep" aria-hidden="true" />
      <button
        type="button"
        className={`btn btn-secondary copy-btn${copyState === "done" ? " copied pop" : ""}${copyState === "busy" ? " pressed shimmer-busy" : ""}`}
        disabled={!hasContent}
        aria-busy={copyState === "busy"}
        data-copy-anchor
        data-testid="copy"
        title={hasContent ? "Copy image (⌘C)" : "Paste a screenshot first"}
        onClick={(e) => app.copy(e.currentTarget)}
      >
        {copyState === "done" ? (
          <>
            <Icon name="check" /> Copied
          </>
        ) : (
          <>
            <Icon name="copy" /> Copy <span className="kbd">{mod === "⌘" ? "⌘C" : "Ctrl C"}</span>
          </>
        )}
      </button>
      <div className="split">
        <button
          ref={mainRef}
          type="button"
          className={`btn btn-primary${exportBusy || motionJob ? " pressed" : ""}${exportBusy ? " shimmer-busy" : ""}`}
          disabled={!hasContent}
          aria-busy={!!motionJob || exportBusy}
          data-testid="export"
          title={
            hasContent
              ? motionKind
                ? "Export the clip (⌘S)"
                : "Download (⌘S)"
              : "Paste a screenshot first"
          }
          onClick={(e) => void app.download(e.currentTarget)}
        >
          <Icon name={motionKind ? "film" : "download"} /> Export{" "}
          {hasContent && (
            <span className="tag">
              {motionJob ? (
                `${motionJob.total ? Math.round((motionJob.done / motionJob.total) * 100) : 0}%`
              ) : packing ? (
                `${packing.done}/${packing.total}`
              ) : mode === "appstore" ? (
                `ZIP · ${settings.format === "jpeg" ? "JPG" : "PNG"}`
              ) : slow && exportBusy ? (
                <span className="ring-spinner" aria-label="Exporting" />
              ) : motionKind ? (
                motionTag
              ) : (
                tag
              )}
            </span>
          )}
        </button>
        <button
          ref={exportRef}
          type="button"
          className={`btn btn-primary${popover === "export" ? " pressed" : ""}`}
          aria-label="Export options (⇧⌘S)"
          aria-haspopup="dialog"
          aria-expanded={popover === "export"}
          disabled={!hasContent}
          data-testid="export-options"
          onClick={() => app.ui.set({ popover: popover === "export" ? null : "export" })}
        >
          <Icon name="chevronDown" />
        </button>
      </div>
      <Popover
        open={popover === "export"}
        anchor={exportRef}
        onClose={() => app.ui.set({ popover: null })}
        label="Export options"
        align="end"
        width={348}
      >
        {popover === "export" && <ExportPopover onDone={() => app.ui.set({ popover: null })} />}
      </Popover>
    </header>
  );
}
