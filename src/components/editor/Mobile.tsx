"use client";
/** Narrow layout (< 768 px): compact header, stage, bottom sheet with tabs, export sheet. */
import { useEffect, useRef, useState } from "react";
import { type ExportFormat, getStylePreset, layoutScene } from "@/engine";
import { Icon, LogoMark, type IconName } from "../icons";
import { Segmented } from "../ui/controls";
import { AnnotationInspector, Colours } from "./AnnotationInspector";
import { type MobileTab, formatBytes, styleName } from "./app";
import { useApp, useScene, useUi } from "./context";
import { TOOLS } from "./Dock";
import {
  DestinationChips,
  SetExportPanel,
  SizeChip,
  sizeLabel,
  useExportPlan,
  useExportResult,
} from "./Header";
import { type ScaleChoice, fitVerdict, getDestination } from "./export-plan";
import { BackgroundTray, FrameTray, LayoutTray, useStyleRow } from "./Inspector";
import { Stage } from "./Stage";
import { MotionTray } from "./MotionTray";
import { MotionExportPanel } from "./MotionExport";
import { CodeTray, ThemesTray, WindowTray } from "./CodeInspector";
import { CardTray, PostStylesTray, PostTray } from "./PostInspector";
import { HeadlineTray, SetStylesTray, SetTray, SlideTray } from "./AppStoreInspector";
import { MobileModeButton } from "./ModeSwitch";
import { StyleThumb } from "./StyleThumb";
import { BatchStrip } from "./BatchStrip";
import { useBatch } from "./batch-ui";

type TabDef = { id: MobileTab; label: string; icon: IconName };

const CODE_TABS: TabDef[] = [
  { id: "code", label: "Code", icon: "code" },
  { id: "theme", label: "Theme", icon: "sparkle" },
  { id: "motion", label: "Motion", icon: "motion" },
  { id: "background", label: "Background", icon: "image" },
  { id: "window", label: "Window", icon: "frameMac" },
  { id: "draw", label: "Draw", icon: "arrow" },
];

const POST_TABS: TabDef[] = [
  { id: "post", label: "Card", icon: "message" },
  { id: "theme", label: "Style", icon: "sparkle" },
  { id: "motion", label: "Motion", icon: "motion" },
  { id: "background", label: "Background", icon: "image" },
  { id: "layout", label: "Layout", icon: "sliders" },
  { id: "draw", label: "Draw", icon: "arrow" },
];

const APPSTORE_TABS: TabDef[] = [
  { id: "slides", label: "Slide", icon: "phones" },
  { id: "theme", label: "Style", icon: "sparkle" },
  { id: "layout", label: "Set", icon: "sliders" },
  { id: "background", label: "Background", icon: "image" },
  { id: "frame", label: "Device", icon: "framePhone" },
];

export function useMobileTabs(): TabDef[] {
  const mode = useUi((s) => s.mode);
  if (mode === "code") return CODE_TABS;
  if (mode === "post") return POST_TABS;
  if (mode === "appstore") return APPSTORE_TABS;
  return TABS;
}

const TABS: TabDef[] = [
  { id: "styles", label: "Styles", icon: "sparkle" },
  { id: "motion", label: "Motion", icon: "motion" },
  { id: "background", label: "Background", icon: "image" },
  { id: "layout", label: "Layout", icon: "sliders" },
  { id: "frame", label: "Frame", icon: "frameBrowser" },
  { id: "draw", label: "Draw", icon: "arrow" },
];

function MobileHeader() {
  const app = useApp();
  const mode = useUi((s) => s.mode);
  const hasContent = useUi((s) => s.hasContent);
  const canUndo = useScene((s) => s.canUndo);
  return (
    <header className="m-top">
      <a href="/about/" aria-label="About Shotcandy" className="brand">
        <LogoMark className="mark" />
      </a>
      <MobileModeButton />
      {mode !== "appstore" && <SizeChip compact />}
      <div style={{ flex: 1 }} />
      {hasContent && (
        <button
          type="button"
          className="icon-btn"
          aria-label="Undo"
          disabled={!canUndo}
          onClick={() => app.store.undo()}
        >
          <Icon name="undo" />
        </button>
      )}
      <button
        type="button"
        className="btn btn-primary"
        disabled={!hasContent}
        data-testid="export"
        onClick={() => app.ui.set({ mobileExport: true })}
      >
        <Icon name="download" /> Export
      </button>
    </header>
  );
}

function StyleRail() {
  const app = useApp();
  const { current } = useStyleRow();
  const ids = [
    "sherbet",
    "mint-julep",
    "grape-soda",
    "phone-sorbet",
    "paper",
    "midnight",
    "tangerine",
    "satin",
    "aurora-pop",
    "cotton-candy",
    "licorice",
    "from-your-shot",
  ];
  const list =
    current && !ids.includes(current) && getStylePreset(current) ? [current, ...ids] : ids;
  return (
    <div className="rail" role="group" aria-label="Styles">
      <button
        type="button"
        className="preset shuffle-tile"
        onClick={() => app.shuffle()}
        aria-label="Candy Shuffle: a whole new look"
      >
        <div className="thumb">
          <Icon name="shuffle" />
        </div>
        <span className="name">Shuffle</span>
      </button>
      {list.map((id) => {
        const p = getStylePreset(id);
        if (!p) return null;
        return (
          <button
            key={id}
            type="button"
            className={`preset${current === id ? " on" : ""}`}
            aria-pressed={current === id}
            onClick={() => app.applyStyle(id)}
          >
            <div className="thumb">
              <StyleThumb
                styleKey={id}
                patch={p.patch}
                aspect={[4, 5]}
                target={130}
                priority={10}
              />
            </div>
            <span className="name">{p.name}</span>
          </button>
        );
      })}
      <button
        type="button"
        className="preset"
        onClick={() => app.ui.set({ modal: "gallery" })}
        aria-label="All styles"
      >
        <div
          className="thumb"
          style={{ display: "grid", placeItems: "center", color: "var(--sc-ink-2)" }}
        >
          <Icon name="plus" />
        </div>
        <span className="name">All styles</span>
      </button>
    </div>
  );
}

function FrameQuick() {
  const app = useApp();
  const id = useScene((s) => s.scene.card.frame.id);
  return (
    <div className="mini-row">
      <Segmented
        label="Frame"
        value={["none", "phone", "browser", "macos"].includes(id) ? id : null}
        onChange={(v) => app.set(["card", "frame", "id"], v)}
        options={[
          { value: "none", label: "None" },
          { value: "phone", label: "Phone" },
          { value: "browser", label: "Browser" },
          { value: "macos", label: "macOS" },
        ]}
      />
    </div>
  );
}

function DrawTools() {
  const app = useApp();
  const tool = useUi((s) => s.tool);
  return (
    <div className="draw-tools" role="toolbar" aria-label="Annotation tools">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`tool${tool === t.id ? " on" : ""}`}
          aria-label={t.label}
          aria-pressed={tool === t.id}
          onClick={() => app.setTool(t.id)}
        >
          <Icon name={t.icon} />
        </button>
      ))}
    </div>
  );
}

/** The annotation colour row, right under the tools so it fits the peeking sheet (P2-24). */
function QuickColours() {
  const app = useApp();
  const tool = useUi((s) => s.tool);
  const annColor = useUi((s) => s.annColor);
  const a = useScene((s) => s.scene.annotations.find((x) => x.id === s.selection));
  if (a?.kind === "redact" || (a?.kind === "rect" && a.style === "spotlight")) return null;
  if (!a && tool === "redact") return null;
  const value = a && "color" in a ? a.color : annColor;
  return (
    <div className="m-quick-colours">
      <Colours
        value={value}
        onPick={(c, f) => {
          if (a) app.updateAnnotation(a.id, { color: c }, f ? undefined : `ann:${a.id}:color`);
          else app.ui.set({ annColor: c });
        }}
      />
    </div>
  );
}

function MobileSheet() {
  const app = useApp();
  const tabs = useMobileTabs();
  const mode = useUi((s) => s.mode);
  const rawTab = useUi((s) => s.mobileTab);
  const tab = tabs.some((t) => t.id === rawTab) ? rawTab : tabs[0]!.id;
  const expanded = useUi((s) => s.mobileExpanded);
  const selection = useScene((s) => s.selection);
  const ref = useRef<HTMLElement>(null);
  const drag = useRef<{ y: number; h: number } | null>(null);
  const [dragH, setDragH] = useState<number | null>(null);

  useEffect(() => {
    if (selection && tab !== "draw") app.ui.set({ mobileTab: "draw" });
  }, [selection, tab, app]);

  const peek = tab === "styles" ? undefined : 250;
  const height = dragH ?? (expanded ? "62dvh" : peek);

  const onDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, h: ref.current!.getBoundingClientRect().height };
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const h = Math.max(
      160,
      Math.min(window.innerHeight * 0.8, drag.current.h - (e.clientY - drag.current.y)),
    );
    setDragH(h);
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const moved = Math.abs(e.clientY - d.y);
    if (moved < 6) app.ui.set({ mobileExpanded: !expanded });
    else app.ui.set({ mobileExpanded: (dragH ?? d.h) > window.innerHeight * 0.45 });
    setDragH(null);
  };

  return (
    <section
      ref={ref}
      className={`m-sheet${dragH !== null ? " dragging" : ""}`}
      style={{ height }}
      aria-label="Edit"
    >
      <div
        className="grab"
        role="button"
        tabIndex={0}
        aria-label={expanded ? "Collapse panel" : "Expand panel"}
        aria-expanded={expanded}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            app.ui.set({ mobileExpanded: !expanded });
          }
        }}
      />
      <div className="m-body" role="tabpanel" aria-label={tabs.find((t) => t.id === tab)?.label}>
        {tab === "code" && <CodeTray bare />}
        {tab === "theme" && mode === "code" && <ThemesTray bare />}
        {tab === "theme" && mode === "post" && (
          <>
            <PostStylesTray bare />
            <CardTray bare />
          </>
        )}
        {tab === "post" && <PostTray bare />}
        {tab === "slides" && <SlideTray bare />}
        {tab === "theme" && mode === "appstore" && (
          <>
            <SetStylesTray bare />
            <HeadlineTray bare />
          </>
        )}
        {tab === "window" && <WindowTray bare />}
        {tab === "styles" && (
          <>
            <StyleRail />
            <FrameQuick />
          </>
        )}
        {tab === "motion" && <MotionTray bare />}
        {tab === "background" && <BackgroundTray bare />}
        {tab === "layout" && mode !== "appstore" && <LayoutTray bare />}
        {tab === "layout" && mode === "appstore" && <SetTray bare />}
        {tab === "frame" && <FrameTray bare />}
        {tab === "draw" && (
          <>
            <DrawTools />
            <QuickColours />
            <div className="m-draw">
              <AnnotationInspector quickColours />
            </div>
          </>
        )}
      </div>
      <nav className="m-tabs" role="tablist" aria-label="Panels">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => app.ui.set({ mobileTab: t.id })}
          >
            {t.id === "frame" ? (
              <Icon name="frameBrowser" style={{ width: 22, height: 18 }} />
            ) : (
              <Icon name={t.icon} />
            )}
            {t.label}
          </button>
        ))}
      </nav>
    </section>
  );
}

function CurrentThumb() {
  const app = useApp();
  const scene = useScene((s) => s.scene);
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const layout = layoutScene(scene, app.resolver);
    const scale = Math.min(1, 200 / Math.max(layout.canvas.width, layout.canvas.height));
    const key = `current:${JSON.stringify(scene).length}:${Date.now()}`;
    let alive = true;
    app.thumbs?.request(key, scene, scale, 20).then(
      (b) => {
        const c = ref.current;
        if (!alive || !c) return;
        c.width = b.width;
        c.height = b.height;
        c.getContext("2d")?.drawImage(b, 0, 0);
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [app, scene]);
  return (
    <canvas
      ref={ref}
      style={{ display: "block", width: "100%", height: "auto" }}
      aria-hidden="true"
    />
  );
}

function MobileExport() {
  const app = useApp();
  const mode = useUi((s) => s.mode);
  const open = useUi((s) => s.mobileExport);
  const settings = useUi((s) => s.exportSettings);
  const busy = useUi((s) => s.exportBusy);
  const scene = useScene((s) => s.scene);
  const custom = useUi((s) => s.customPresets);
  const plan = useExportPlan();
  const result = useExportResult(open && mode !== "appstore");
  const [closing, setClosing] = useState(false);
  const sheetRef = useRef<HTMLElement>(null);
  // Esc closes the sheet wherever focus is; focus moves into it when it opens.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      app.ui.set({ mobileExport: false });
    };
    window.addEventListener("keydown", onKey, true);
    const raf = requestAnimationFrame(() =>
      sheetRef.current?.querySelector<HTMLElement>("[data-autofocus], button")?.focus(),
    );
    return () => {
      window.removeEventListener("keydown", onKey, true);
      cancelAnimationFrame(raf);
    };
  }, [open, app]);
  if (!open && !closing) return null;
  const oW = result?.width ?? plan.width;
  const oH = result?.height ?? plan.height;
  const outFormat = result?.format ?? plan.format;
  const dest = getDestination(settings.destination);
  const est = result?.bytes ?? null;
  const verdict = fitVerdict(dest, est, outFormat, result?.fitted);
  const close = () => {
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      app.ui.set({ mobileExport: false });
    }, 200);
  };
  const file = app.filenameFor(
    { width: oW, height: oH },
    { ...settings, format: outFormat },
    plan.scale,
  );
  const motionTab = settings.kind === "motion" && !!scene.animation && mode !== "appstore";
  const appstore = mode === "appstore";
  return (
    <>
      <div className={`scrim${closing ? " closing" : ""}`} onClick={close} aria-hidden="true" />
      <section
        ref={sheetRef}
        className={`m-export${closing ? " closing" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="m-export-title"
        onKeyDown={(e) => e.key === "Escape" && close()}
      >
        <div className="grab" onClick={close} aria-hidden="true" />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 id="m-export-title">
            {appstore ? "Export set" : motionTab ? "Save your clip" : "Save your image"}
          </h2>
          {appstore ? null : scene.animation ? (
            <Segmented
              label="Export type"
              value={motionTab ? "motion" : "image"}
              onChange={(kind) => app.setExportSettings({ kind })}
              options={[
                { value: "image", label: "Image" },
                { value: "motion", label: "Video" },
              ]}
            />
          ) : (
            <span className="mono muted" data-testid="m-export-dims">
              {oW} × {oH}
            </span>
          )}
        </div>
        {appstore && (
          <div style={{ marginTop: 4 }}>
            <SetExportPanel mobile onDone={close} />
          </div>
        )}
        {motionTab && (
          <div style={{ marginTop: 12 }}>
            <MotionExportPanel onDone={close} />
          </div>
        )}
        {!motionTab && !appstore && (
          <>
            <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 12 }}>
              <div className="preview-img">
                <CurrentThumb />
              </div>
              <div
                style={{ fontSize: 13, color: "var(--sc-ink-2)", lineHeight: "19px", minWidth: 0 }}
              >
                <b style={{ color: "var(--sc-ink)" }}>
                  {styleName(scene.meta.stylePresetId, custom)}
                </b>
                <br />
                {sizeLabel(scene.canvas.size)}
                <br />
                <span className="mono muted" style={{ overflowWrap: "anywhere" }}>
                  {file}
                </span>
              </div>
            </div>
            <div className="sub">For</div>
            <DestinationChips />
            <div className="export-summary">
              <div className="dims">
                <span className="mono">
                  {oW} × {oH}
                </span>
                <span className="fmt">
                  {outFormat === "jpeg" ? "JPEG" : outFormat.toUpperCase()}
                </span>
                <span className="mono est">{est !== null ? formatBytes(est) : "sizing…"}</span>
              </div>
              {verdict.kind !== "none" && (
                <div className="why">
                  <span className={`fit-badge ${verdict.kind}`}>
                    <Icon name={verdict.kind === "fits" ? "check" : "alert"} size="xs" />
                    {verdict.label}
                  </span>
                </div>
              )}
            </div>
            {dest.id === "original" && (
              <>
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
                <div className="sub">Scale</div>
                <Segmented
                  label="Scale"
                  value={String(settings.scale)}
                  onChange={(v) => app.setExportSettings({ scale: Number(v) as ScaleChoice })}
                  options={[0, 1, 2, 3, 4].map((s) => ({
                    value: String(s),
                    label: s === 0 ? "Auto" : `${s}×`,
                  }))}
                />
              </>
            )}
            <button
              type="button"
              className={`btn btn-primary btn-block${busy ? " pressed shimmer-busy" : ""}`}
              aria-busy={busy}
              style={{ height: 52, marginTop: 18, fontSize: 15.5 }}
              onClick={() => void app.share("save")}
              data-autofocus
            >
              <Icon name="download" /> Save to Photos
            </button>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={(e) => app.copy(e.currentTarget)}
              >
                <Icon name="copy" /> Copy
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void app.share("share")}
              >
                <Icon name="link" /> Share…
              </button>
            </div>
          </>
        )}
      </section>
    </>
  );
}

export function MobileEditor() {
  const hasContent = useUi((s) => s.hasContent);
  const batch = useBatch();
  return (
    <div className="m" data-layout="narrow" data-batch={batch ? "" : undefined}>
      <MobileHeader />
      <Stage narrow />
      {batch && <BatchStrip />}
      {hasContent && <MobileSheet />}
      <MobileExport />
    </div>
  );
}
