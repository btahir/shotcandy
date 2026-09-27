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
  layoutScene,
  maxExportScale,
  rotateSize,
} from "@/engine";
import { GITHUB_URL, SUPPORT_URL } from "@/config/site";
import { useModKey } from "@/lib/platform";
import { setTheme, useThemePref } from "@/lib/theme";
import { Icon, LogoMark } from "../icons";
import { Popover, Segmented, menuKeys } from "../ui/controls";
import { Slider } from "../ui/Slider";
import { formatBytes } from "./app";
import { useApp, useScene, useUi } from "./context";
import { openFilePicker } from "./EmptyState";

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => layoutScene(scene, app.library), [scene, app, v]);
}

export function SizeChip({ compact = false }: { compact?: boolean }) {
  const app = useApp();
  const size = useScene((s) => s.scene.canvas.size);
  const hasImage = useUi((s) => s.hasImage);
  const open = useUi((s) => s.popover === "size");
  const layout = useCanvasSize();
  const ref = useRef<HTMLButtonElement>(null);
  const meta =
    size.kind === "fixed"
      ? `${size.width} × ${size.height}`
      : hasImage
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
        {!compact && <span className="mono">{meta}</span>}
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
        <span className="mono">
          {hint ?? (p.size.kind === "fixed" ? `${dims[0]} × ${dims[1]}` : p.hint)}
        </span>
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
              {item(g("free")[0]!, "hugs your image")}
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

export function useExportEstimate(active: boolean) {
  const app = useApp();
  const scene = useScene((s) => s.scene);
  const settings = useUi((s) => s.exportSettings);
  const [bpp, setBpp] = useState<number | null>(null);
  useEffect(() => {
    if (!active || !app.ui.get().hasImage) return;
    let alive = true;
    const t = setTimeout(() => {
      app
        .runExport(settings.format, 1, settings.quality)
        .then((r) => alive && setBpp(r.blob.size / (r.width * r.height)))
        .catch(() => undefined);
    }, 350);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [active, app, scene, settings.format, settings.quality]);
  return bpp;
}

export function ExportPanel({
  onDone,
  compact = false,
}: {
  onDone?: () => void;
  compact?: boolean;
}) {
  const app = useApp();
  const mod = useModKey();
  const settings = useUi((s) => s.exportSettings);
  const size = useScene((s) => s.scene.canvas.size);
  const fill = useScene((s) => s.scene.background.fill.kind);
  const layout = useCanvasSize();
  const bpp = useExportEstimate(true);
  const [tokensOpen, setTokensOpen] = useState(false);
  const tokRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const max = Math.max(1, maxExportScale(layout));
  const W = layout.canvas.width;
  const H = layout.canvas.height;
  const oW = W * settings.scale;
  const oH = H * settings.scale;
  const est = bpp ? bpp * oW * oH * (settings.format === "png" ? 0.85 : 0.9) : null;
  const preview = app.filenameFor({ width: oW, height: oH }, settings);
  const appstore = size.kind === "fixed" && size.presetId?.startsWith("appstore");
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
      {!compact && (
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginBottom: 14,
          }}
        >
          <h2
            style={{
              font: "700 17px/22px var(--sc-font-display)",
              letterSpacing: "-.015em",
            }}
          >
            Export
          </h2>
          <span className="mono muted">
            {W} × {H} at 1×
          </span>
        </div>
      )}
      <div className="sub">Format</div>
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
        Size{" "}
        <span className="mono muted" data-testid="export-dims">
          {oW} × {oH} px{est ? ` · ≈ ${formatBytes(est)}` : ""}
        </span>
      </div>
      <Segmented
        label="Scale"
        value={String(settings.scale)}
        onChange={(v) => app.setExportSettings({ scale: Number(v) })}
        options={[1, 2, 3, 4].map((s) => ({
          value: String(s),
          label: `${s}×`,
          disabled: s > max,
          title: s > max ? "Too large for this browser's canvas limit" : undefined,
        }))}
      />
      <div style={{ marginTop: 10 }}>
        <Slider
          label="Quality"
          value={settings.format === "png" ? 100 : Math.round(settings.quality * 100)}
          min={30}
          max={100}
          disabled={settings.format === "png"}
          valueLabel={settings.format === "png" ? "Lossless" : undefined}
          format={(v) => `${Math.round(v)}`}
          onChange={(v) => app.setExportSettings({ quality: v / 100 })}
        />
      </div>
      {!compact && (
        <>
          <div className="sub" style={{ marginTop: 8 }}>
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
            style={{ margin: "6px 2px 16px" }}
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
      {settings.format === "jpeg" && fill === "none" && !appstore && (
        <p className="note">JPEG has no transparency, so the background becomes white.</p>
      )}
      {!compact && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 8 }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={(e) => {
              app.copy(e.currentTarget);
              onDone?.();
            }}
          >
            <Icon name="copy" /> Copy
          </button>
          <button
            type="button"
            className="btn btn-primary"
            data-testid="download"
            onClick={(e) => {
              void app.download(e.currentTarget);
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
  const hasImage = useUi((s) => s.hasImage);
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
            disabled={!hasImage}
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
          <Link role="menuitem" className="menu-item" href="/about/" onClick={close}>
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
  const hasImage = useUi((s) => s.hasImage);
  const popover = useUi((s) => s.popover);
  const copyState = useUi((s) => s.copyState);
  const exportBusy = useUi((s) => s.exportBusy);
  const settings = useUi((s) => s.exportSettings);
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
      <Link className="brand" href="/about/" aria-label="Shotcandy — about this project">
        <LogoMark className="mark" />
        <span className="word">shotcandy</span>
      </Link>
      <div className="centre">
        <SizeChip />
      </div>
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
        className={`btn btn-secondary copy-btn${copyState === "done" ? " copied pop" : ""}${copyState === "busy" ? " shimmer-busy" : ""}`}
        disabled={!hasImage}
        data-copy-anchor
        data-testid="copy"
        title={hasImage ? "Copy image (⌘C)" : "Paste a screenshot first"}
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
          className={`btn btn-primary${exportBusy ? " pressed" : ""}`}
          disabled={!hasImage}
          data-testid="export"
          title={hasImage ? "Download (⌘S)" : "Paste a screenshot first"}
          onClick={(e) => void app.download(e.currentTarget)}
        >
          <Icon name="download" /> Export{" "}
          {hasImage && (
            <span className="tag">
              {slow && exportBusy ? (
                <span className="ring-spinner" aria-label="Exporting" />
              ) : (
                <>
                  {settings.format === "jpeg" ? "JPG" : settings.format.toUpperCase()} ·{" "}
                  {settings.scale}×
                </>
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
          disabled={!hasImage}
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
        {popover === "export" && <ExportPanel onDone={() => app.ui.set({ popover: null })} />}
      </Popover>
    </header>
  );
}
