"use client";
/**
 * The inspector: Styles → Background → Layout (+ 3D tilt) → Frame, or the
 * contextual annotation inspector when a tool or annotation is active.
 * Every control writes the scene directly; the preview re-renders live.
 */
import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  type BackgroundFill,
  type BackgroundPreset,
  BACKGROUND_PRESETS,
  GRADIENT_PRESETS,
  MESH_PRESETS,
  WALLPAPER_PRESETS,
  getBackgroundPreset,
  getStylePreset,
  importImage,
  resolveFrame,
} from "@/engine";
import { SUPPORT_URL } from "@/config/site";
import { fillToCss } from "@/lib/fill-css";
import { Icon, type IconName } from "../icons";
import { ColorPicker } from "../ui/ColorPicker";
import { Popover, Segmented, Switch } from "../ui/controls";
import { Slider } from "../ui/Slider";
import { AnnotationInspector } from "./AnnotationInspector";
import { styleName } from "./app";
import { useApp, useScene, useUi } from "./context";
import { openFilePicker } from "./EmptyState";
import { StyleThumb } from "./StyleThumb";
import { MotionTray } from "./MotionTray";
import { CodeTray, ThemesTray, WindowTray } from "./CodeInspector";
import { CardTray, PostStylesTray, PostTray } from "./PostInspector";

const DEFAULT_ROW = ["sherbet", "mint-julep", "grape-soda", "paper", "midnight", "satin"];

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

export function useStyleRow(max = 6) {
  const current = useScene((s) => s.scene.meta.stylePresetId);
  const [row, setRow] = useState<string[]>(DEFAULT_ROW.slice(0, max));
  useEffect(() => {
    if (!current || row.includes(current)) return;
    // A style applied from elsewhere (gallery, shortcuts) joins the front of the row.
    setRow((r) => [current, ...r.filter((x) => x !== current)].slice(0, max));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);
  return { row, current };
}

export const StylesTray = memo(function StylesTray() {
  const app = useApp();
  const { row, current } = useStyleRow();
  const custom = useUi((s) => s.customPresets);
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const btns = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("button.preset"));
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    const d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 3, ArrowUp: -3 }[e.key];
    if (!d) return;
    e.preventDefault();
    btns[Math.max(0, Math.min(btns.length - 1, i + d))]?.focus();
  };
  return (
    <section className="tray" aria-labelledby="t-styles" data-testid="styles-tray">
      <div className="tray-head">
        <h2 id="t-styles">Styles</h2>
        <button type="button" className="link" onClick={() => app.ui.set({ modal: "gallery" })}>
          All styles <span className="kbd">G</span>
        </button>
      </div>
      <div className="presets" onKeyDown={onKey}>
        {row.map((id, i) => {
          const p = getStylePreset(id);
          const c = custom.find((x) => x.id === id);
          const patch = p?.patch ?? c?.patch;
          if (!patch) return null;
          const name = p?.name ?? c?.name ?? id;
          return (
            <button
              key={id}
              type="button"
              className={`preset${current === id ? " on" : ""}`}
              aria-pressed={current === id}
              aria-label={`${name} style (${i + 1})`}
              onClick={() => {
                app.applyStyle(id);
                app.announce(`Style: ${name}`);
              }}
            >
              <div className="thumb">
                <StyleThumb styleKey={id} patch={patch} aspect={[4, 3]} target={96} priority={10} />
              </div>
              <span className="name">{name}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
});

// ---------------------------------------------------------------------------
// Background
// ---------------------------------------------------------------------------

const FEATURED = [
  "sherbet",
  "sherbet-linear",
  "tangerine-dream",
  "lemonade",
  "mint-julep",
  "blueberry-soda",
  "grape-soda",
  "cotton-candy",
  "peach-fizz",
  "sea-glass",
  "dusk-candy",
  "aurora-pop",
  "licorice-gradient",
  "cream",
];

type BgTab = "gradient" | "mesh" | "solid" | "image";

function sameFill(a: BackgroundFill, b: BackgroundFill): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function presetFor(fill: BackgroundFill): BackgroundPreset | undefined {
  return BACKGROUND_PRESETS.find((b) => sameFill(b.fill, fill));
}

function tabFor(fill: BackgroundFill): BgTab {
  const p = presetFor(fill);
  if (p && FEATURED.includes(p.id)) return "gradient";
  switch (fill.kind) {
    case "mesh":
      return "mesh";
    case "solid":
    case "none":
      return "solid";
    case "image":
      return "image";
    default:
      return "gradient";
  }
}

function bgName(fill: BackgroundFill): string {
  if (fill.kind === "auto") return "From your shot";
  if (fill.kind === "none") return "Transparent";
  const p = presetFor(fill);
  if (p) return p.label;
  if (fill.kind === "image") return "Your image";
  if (fill.kind === "solid") return fill.color.toUpperCase();
  return "Custom";
}

function Swatch({
  fill,
  label,
  on,
  onClick,
  palette,
  small,
}: {
  fill: BackgroundFill;
  label: string;
  on: boolean;
  onClick: () => void;
  palette?: Parameters<typeof fillToCss>[1];
  small?: boolean;
}) {
  return (
    <button
      type="button"
      className={`sw${on ? " on" : ""}${small ? " sm" : ""}${fill.kind === "none" ? " transparent" : ""}`}
      style={fill.kind === "none" ? undefined : { background: fillToCss(fill, palette ?? null) }}
      aria-label={label}
      aria-pressed={on}
      title={label}
      onClick={onClick}
    />
  );
}

/** A colour dot that opens the colour picker. */
export function ColourButton({
  value,
  onChange,
  label,
  alpha,
  className = "colour-dot",
  size,
}: {
  value: string;
  onChange: (hex: string, final: boolean) => void;
  label: string;
  alpha?: boolean;
  className?: string;
  size?: number;
}) {
  const app = useApp();
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const palette = useScene((s) => {
    const c = s.scene.content;
    return c.kind === "image" && c.assetId ? c.assetId : null;
  });
  const colours = useMemo(() => {
    const p = palette ? app.library.get(palette)?.palette : null;
    return p ? p.swatches.slice(0, 8).map((s) => s.hex) : [];
  }, [palette, app]);
  return (
    <>
      <button
        ref={ref}
        type="button"
        className={className}
        style={{
          ...(className.includes("rainbow") && !className.includes(" on")
            ? {}
            : { background: value }),
          ...(size ? { width: size, height: size } : {}),
        }}
        aria-label={`${label}: ${value}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      />
      <Popover
        open={open}
        anchor={ref}
        onClose={() => setOpen(false)}
        label={label}
        className="picker-pop"
        align="center"
      >
        {open && (
          <ColorPicker
            value={value}
            onChange={onChange}
            palette={colours}
            alpha={alpha}
            label={label}
          />
        )}
      </Popover>
    </>
  );
}

export const BackgroundTray = memo(function BackgroundTray({ bare = false }: { bare?: boolean }) {
  const app = useApp();
  const fill = useScene((s) => s.scene.background.fill);
  const grain = useScene((s) => s.scene.background.grain.amount);
  const contentId = useScene((s) =>
    s.scene.content.kind === "image" ? s.scene.content.assetId : null,
  );
  const hasContent = useUi((s) => s.hasContent);
  useUi((s) => s.assetsVersion);
  const palette = contentId ? (app.library.get(contentId)?.palette ?? null) : null;
  const [tab, setTab] = useState<BgTab>(() => tabFor(fill));
  const [allGradients, setAllGradients] = useState(false);
  const [adjust, setAdjust] = useState(false);
  const lastFill = useRef(fill);
  useEffect(() => {
    // Follow style changes that move the fill to another tab.
    if (lastFill.current !== fill) {
      const p = presetFor(fill);
      if (!p || !FEATURED.includes(p.id) || tab !== "gradient") {
        const t = tabFor(fill);
        if (t !== tab && fill.kind !== "auto") setTab(t);
      }
      lastFill.current = fill;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fill]);

  const setFill = (f: BackgroundFill, grainAmt?: number) => {
    app.store.update((s) => ({
      ...s,
      background: {
        fill: f,
        grain:
          grainAmt === undefined ? s.background.grain : { ...s.background.grain, amount: grainAmt },
      },
    }));
  };
  const pickPreset = (b: BackgroundPreset) => setFill(b.fill, b.grain.amount);

  const list =
    tab === "gradient"
      ? [
          ...FEATURED.map((id) => getBackgroundPreset(id)!).filter(Boolean),
          ...(allGradients ||
          GRADIENT_PRESETS.some((g) => !FEATURED.includes(g.id) && sameFill(g.fill, fill))
            ? GRADIENT_PRESETS.filter((g) => !FEATURED.includes(g.id))
            : []),
        ]
      : tab === "mesh"
        ? MESH_PRESETS
        : tab === "solid"
          ? BACKGROUND_PRESETS.filter((b) => b.group === "solid")
          : [];

  const autoStyles = [
    { style: "mesh" as const, label: "Mesh from your shot" },
    { style: "linear" as const, label: "Gradient from your shot" },
    { style: "soft" as const, label: "Soft colour from your shot" },
  ];
  const dots = palette
    ? [...palette.swatches]
        .sort((a, b) => b.lch.C * Math.sqrt(b.weight) - a.lch.C * Math.sqrt(a.weight))
        .slice(0, 3)
        .map((s) => s.hex)
    : ["var(--sc-line-strong)", "var(--sc-line)", "var(--sc-well-hover)"];

  const uploadBg = () =>
    openFilePicker(async (f) => {
      try {
        const img = await importImage(f);
        app.library.add(img);
        void app.db?.assets
          .put({
            id: img.id,
            blob: img.blob,
            mime: img.mime,
            width: img.width,
            height: img.height,
            role: "background",
            createdAt: Date.now(),
          })
          .catch(() => undefined);
        setFill({
          kind: "image",
          assetId: img.id,
          fit: "cover",
          blur: 0,
          tint: 0,
          focusX: 0.5,
          focusY: 0.5,
        });
        app.ui.set((u) => ({ assetsVersion: u.assetsVersion + 1 }));
      } catch {
        app.toast({
          kind: "error",
          title: "Couldn't use that image",
          detail: "Try PNG, JPEG or WebP.",
          prose: true,
        });
      }
    });

  return (
    <section className="tray" aria-labelledby="t-bg" data-testid="background-tray">
      {!bare && (
        <div className="tray-head">
          <h2 id="t-bg">Background</h2>
          <span className="meta">{bgName(fill)}</span>
        </div>
      )}
      <div className="auto-row">
        <div className="dots" aria-hidden="true">
          {dots.map((c, i) => (
            <i key={i} style={{ background: c }} />
          ))}
        </div>
        <div className="txt">
          From your shot
          <small>{hasContent && palette ? "3 colours picked" : "Paste an image to unlock"}</small>
        </div>
        {hasContent && palette && (
          <div className="sws">
            {autoStyles.map((a) => {
              const on = fill.kind === "auto" && fill.style === a.style;
              return (
                <Swatch
                  key={a.style}
                  fill={{ kind: "auto", style: a.style, variant: on ? fill.variant : 0 }}
                  label={on ? `${a.label} (click again for another mix)` : a.label}
                  on={on}
                  palette={palette}
                  onClick={() =>
                    setFill(
                      {
                        kind: "auto",
                        style: a.style,
                        variant: on && fill.kind === "auto" ? (fill.variant + 1) % 6 : 0,
                      },
                      0,
                    )
                  }
                />
              );
            })}
          </div>
        )}
      </div>
      <Segmented<BgTab>
        label="Background type"
        role="tablist"
        value={tab}
        onChange={setTab}
        style={{ marginBottom: 12 }}
        options={[
          { value: "gradient", label: "Gradient" },
          { value: "mesh", label: "Mesh" },
          { value: "solid", label: "Solid" },
          { value: "image", label: "Image" },
        ]}
      />
      {tab !== "image" ? (
        <div className="swatches" role="group" aria-label={`${tab} backgrounds`}>
          {list.map((b) => (
            <Swatch
              key={b.id}
              fill={b.fill}
              label={b.label}
              on={sameFill(b.fill, fill)}
              onClick={() => pickPreset(b)}
            />
          ))}
          {tab === "solid" && (
            <>
              <Swatch
                fill={{ kind: "none" }}
                label="Transparent"
                on={fill.kind === "none"}
                onClick={() => setFill({ kind: "none" })}
              />
              <ColourButton
                className={`sw add rainbow${fill.kind === "solid" && !presetFor(fill) ? " on" : ""}`}
                value={fill.kind === "solid" ? fill.color : "#ff8fab"}
                label="Custom colour"
                onChange={(c) =>
                  app.store.update(
                    (s) => ({
                      ...s,
                      background: { ...s.background, fill: { kind: "solid", color: c } },
                    }),
                    { coalesce: "bg-solid" },
                  )
                }
              />
            </>
          )}
        </div>
      ) : (
        <div className="wall-grid" role="group" aria-label="Wallpapers">
          {WALLPAPER_PRESETS.map((w) => {
            const id = w.fill.kind === "image" ? w.fill.assetId.slice(8) : "";
            const on =
              fill.kind === "image" && w.fill.kind === "image" && fill.assetId === w.fill.assetId;
            return (
              <button
                key={w.id}
                type="button"
                className={`wall${on ? " on" : ""}`}
                style={{ backgroundImage: `url(/backgrounds/thumbs/${id}.webp)` }}
                aria-label={w.label}
                aria-pressed={on}
                title={w.label}
                onClick={() =>
                  setFill(
                    fill.kind === "image" && on
                      ? fill
                      : { ...(w.fill as Extract<BackgroundFill, { kind: "image" }>) },
                    0,
                  )
                }
              />
            );
          })}
          <button type="button" className="wall upload" onClick={uploadBg}>
            <span style={{ display: "grid", placeItems: "center", gap: 2 }}>
              <Icon name="upload" size="sm" />
              Upload
            </span>
          </button>
        </div>
      )}
      {fill.kind === "image" && <ImageDetails fill={fill} />}
      <div
        style={{ display: "flex", justifyContent: "space-between", marginTop: 8, marginBottom: -4 }}
      >
        {tab === "gradient" && list.length <= FEATURED.length ? (
          <button type="button" className="link quiet" onClick={() => setAllGradients(true)}>
            More gradients
          </button>
        ) : (
          <span />
        )}
        {fill.kind !== "none" && (
          <button
            type="button"
            className="link quiet"
            aria-expanded={adjust}
            onClick={() => setAdjust((a) => !a)}
          >
            <Icon name="sliders" size="xs" /> {adjust ? "Hide adjustments" : "Adjust"}
          </button>
        )}
      </div>
      {adjust && <BackgroundDetails fill={fill} grain={grain} />}
    </section>
  );
});

function ImageDetails({ fill }: { fill: Extract<BackgroundFill, { kind: "image" }> }) {
  const app = useApp();
  return (
    <div style={{ marginTop: 10 }}>
      <Slider
        label="Blur"
        value={fill.blur}
        min={0}
        max={80}
        onChange={(v) => app.set(["background", "fill", "blur"], v)}
      />
      <Slider
        label="Tint"
        value={fill.tint}
        min={-1}
        max={1}
        step={0.05}
        centered
        format={(v) => (v === 0 ? "0" : v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2))}
        valueText={(v) => (v < 0 ? "darker" : v > 0 ? "lighter" : "none")}
        onChange={(v) => app.set(["background", "fill", "tint"], v)}
      />
    </div>
  );
}

function BackgroundDetails({ fill, grain }: { fill: BackgroundFill; grain: number }) {
  const app = useApp();
  const set = (path: (string | number)[], v: unknown, key?: string) => app.set(path, v, key);
  return (
    <div style={{ marginTop: 10 }}>
      {fill.kind === "linear" && (
        <>
          <Slider
            label="Angle"
            value={fill.angle}
            min={0}
            max={360}
            format={(v) => `${Math.round(v)}°`}
            onChange={(v) => set(["background", "fill", "angle"], v)}
          />
          <div className="toggle-row">
            <span className="label">Colours</span>
            {fill.stops.map((s, i) => (
              <ColourButton
                key={i}
                value={s.color}
                label={`Gradient colour ${i + 1}`}
                onChange={(c) => set(["background", "fill", "stops", i, "color"], c, `stop${i}`)}
              />
            ))}
          </div>
        </>
      )}
      {fill.kind !== "none" && (
        <Slider
          label="Grain"
          value={Math.round(grain * 100)}
          min={0}
          max={100}
          onChange={(v) => set(["background", "grain", "amount"], v / 100, "grain")}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layout (padding, corners, shadow, border, inset, 3D tilt)
// ---------------------------------------------------------------------------

const SHADOWS: { id: string; label: string; icon: IconName }[] = [
  { id: "none", label: "None", icon: "shNone" },
  { id: "soft", label: "Soft", icon: "shSoft" },
  { id: "float", label: "Float", icon: "shFloat" },
  { id: "deep", label: "Deep", icon: "shDeep" },
  { id: "solid", label: "Solid", icon: "shSolid" },
  { id: "glow", label: "Glow", icon: "shGlow" },
];

const PAD_STOPS = [
  { value: 0 },
  { value: 40, label: "S" },
  { value: 80, label: "M" },
  { value: 120, label: "L" },
  { value: 160, label: "XL" },
];
const RADIUS_STOPS = [
  { value: 0 },
  { value: 12, label: "Soft" },
  { value: 24, label: "Round" },
  { value: 48 },
];
const padName = (v: number) =>
  v === 0
    ? "no padding"
    : v < 60
      ? "small padding"
      : v < 100
        ? "medium padding"
        : v < 140
          ? "large padding"
          : "extra large padding";

export const LayoutTray = memo(function LayoutTray({ bare = false }: { bare?: boolean }) {
  const app = useApp();
  const padding = useScene((s) => s.scene.canvas.padding);
  const card = useScene((s) => s.scene.card);
  const style = useScene((s) => s.scene.meta.stylePresetId);
  const custom = useUi((s) => s.customPresets);
  const [tilt, setTilt] = useState(false);
  const frame = resolveFrame(card.frame.id);
  const usesRadius = frame ? frame.kind.usesCardRadius !== false : true;
  const supportsInset = frame ? frame.kind.supportsInset !== false : true;
  const t = card.tilt;
  const tilted = t.rotateX !== 0 || t.rotateY !== 0 || t.rotateZ !== 0;
  const strength = Math.round(card.shadow.strength * 50);

  const reset = () => {
    const patch = style
      ? (getStylePreset(style)?.patch ?? custom.find((p) => p.id === style)?.patch)
      : undefined;
    if (!patch) return;
    app.store.update((s) => ({
      ...s,
      canvas: { ...s.canvas, padding: patch.canvas?.padding ?? s.canvas.padding },
      card: {
        ...s.card,
        radius: patch.card?.radius ?? s.card.radius,
        shadow: { ...s.card.shadow, ...patch.card?.shadow },
        border: { ...s.card.border, ...patch.card?.border },
        inset: { ...s.card.inset, ...patch.card?.inset },
        tilt: { ...s.card.tilt, ...patch.card?.tilt },
        transform: { ...s.card.transform, ...patch.card?.transform },
      },
    }));
    app.announce(`Layout reset to ${styleName(style, custom)}`);
  };

  const setTiltPreset = (x: number, y: number, z: number) =>
    app.store.update((s) => ({
      ...s,
      card: { ...s.card, tilt: { ...s.card.tilt, rotateX: x, rotateY: y, rotateZ: z } },
    }));

  return (
    <section className="tray" aria-labelledby="t-layout" data-testid="layout-tray">
      {!bare && (
        <div className="tray-head">
          <h2 id="t-layout">Layout</h2>
          <button type="button" className="link quiet" onClick={reset}>
            Reset
          </button>
        </div>
      )}
      <Slider
        label="Padding"
        value={padding}
        min={0}
        max={160}
        typedMax={400}
        stops={PAD_STOPS}
        valueText={(v) => `${Math.round(v)}, ${padName(v)}`}
        onChange={(v) => app.set(["canvas", "padding"], v)}
      />
      <Slider
        label="Corners"
        value={card.radius}
        min={0}
        max={48}
        typedMax={200}
        stops={RADIUS_STOPS}
        disabled={!usesRadius}
        onChange={(v) => app.set(["card", "radius"], v)}
      />
      {!usesRadius && <p className="note">Corners are set by the device frame.</p>}
      <div className="sub" style={{ marginTop: 14 }}>
        Shadow{" "}
        <span className="mono muted">
          {card.shadow.preset === "hug" ? "hug · " : ""}strength {strength}
        </span>
      </div>
      <div className="opts" role="radiogroup" aria-label="Shadow">
        {SHADOWS.map((s) => {
          const on = card.shadow.preset === s.id || (s.id === "none" && card.shadow.strength === 0);
          return (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={on}
              className={`opt${on ? " on" : ""}`}
              onClick={() =>
                app.store.update((sc) => ({
                  ...sc,
                  card: {
                    ...sc.card,
                    shadow: {
                      ...sc.card.shadow,
                      preset: s.id,
                      strength:
                        s.id === "none" ? sc.card.shadow.strength : sc.card.shadow.strength || 1,
                    },
                  },
                }))
              }
            >
              <Icon name={s.icon} />
              {s.label}
            </button>
          );
        })}
      </div>
      <div style={{ marginTop: 6 }}>
        <Slider
          label="Strength"
          value={strength}
          min={0}
          max={100}
          disabled={card.shadow.preset === "none"}
          onChange={(v) => app.set(["card", "shadow", "strength"], v / 50)}
        />
      </div>
      <div className="toggle-row">
        <span className="label" id="lbl-border">
          Border
        </span>
        <ColourButton
          value={card.border.color}
          alpha
          label="Border colour"
          onChange={(c) => app.set(["card", "border", "color"], c, "border-color")}
        />
        <Switch
          checked={card.border.width > 0}
          label="Border"
          onChange={(v) => app.set(["card", "border", "width"], v ? 10 : 0)}
        />
      </div>
      {card.border.width > 0 && (
        <Slider
          label="Width"
          value={card.border.width}
          min={1}
          max={40}
          onChange={(v) => app.set(["card", "border", "width"], v, "border-width")}
        />
      )}
      <div className="toggle-row">
        <span className="label">Inset plate</span>
        {card.inset.width > 0 && supportsInset && (
          <ColourButton
            value={card.inset.color === "auto" ? "#ffffff" : card.inset.color}
            label="Inset colour"
            onChange={(c) => app.set(["card", "inset", "color"], c, "inset-color")}
          />
        )}
        <Switch
          checked={card.inset.width > 0 && supportsInset}
          label="Inset plate"
          disabled={!supportsInset}
          onChange={(v) => app.set(["card", "inset", "width"], v ? 24 : 0)}
        />
      </div>
      {card.inset.width > 0 && supportsInset && (
        <>
          <Slider
            label="Plate"
            value={card.inset.width}
            min={4}
            max={120}
            onChange={(v) => app.set(["card", "inset", "width"], v, "inset-width")}
          />
          {card.inset.color !== "auto" && (
            <button
              type="button"
              className="link quiet"
              style={{ marginLeft: 80 }}
              onClick={() => app.set(["card", "inset", "color"], "auto")}
            >
              Match the screenshot’s edge
            </button>
          )}
        </>
      )}
      <div className="hr" />
      <button
        type="button"
        className="disclosure"
        aria-expanded={tilt}
        aria-controls="tilt-panel"
        onClick={() => setTilt((o) => !o)}
      >
        3D tilt &amp; position
        <span className="meta">
          {tilted
            ? `${Math.round(t.rotateX)}° · ${Math.round(t.rotateY)}°${t.rotateZ ? ` · ${Math.round(t.rotateZ)}°` : ""}`
            : "flat"}
          <Icon name="chevronDown" size="sm" />
        </span>
      </button>
      {tilt && (
        <div id="tilt-panel" style={{ paddingTop: 2 }}>
          <div
            className="opts"
            style={{ gridTemplateColumns: "repeat(4, minmax(0,1fr))", marginBottom: 6 }}
          >
            {(
              [
                ["Flat", 0, 0, 0],
                ["Left", 8, -18, 0],
                ["Right", 8, 18, 0],
                ["Lean", 24, 0, 0],
              ] as const
            ).map(([label, x, y, z]) => {
              const on = t.rotateX === x && t.rotateY === y && t.rotateZ === z;
              return (
                <button
                  key={label}
                  type="button"
                  className={`opt${on ? " on" : ""}`}
                  style={{ height: 40 }}
                  aria-pressed={on}
                  onClick={() => setTiltPreset(x, y, z)}
                >
                  <Icon name={label === "Flat" ? "rect" : "cube"} size="sm" />
                  {label}
                </button>
              );
            })}
          </div>
          <Slider
            label="Tilt X"
            value={t.rotateX}
            min={-45}
            max={45}
            centered
            format={(v) => `${Math.round(v)}°`}
            onChange={(v) => app.set(["card", "tilt", "rotateX"], v)}
          />
          <Slider
            label="Tilt Y"
            value={t.rotateY}
            min={-45}
            max={45}
            centered
            format={(v) => `${Math.round(v)}°`}
            onChange={(v) => app.set(["card", "tilt", "rotateY"], v)}
          />
          <Slider
            label="Rotate"
            value={t.rotateZ}
            min={-30}
            max={30}
            centered
            format={(v) => `${Math.round(v)}°`}
            onChange={(v) => app.set(["card", "tilt", "rotateZ"], v)}
          />
          <Slider
            label="Depth"
            value={t.perspective}
            min={1.2}
            max={10}
            step={0.1}
            disabled={!tilted}
            format={(v) => v.toFixed(1)}
            valueText={(v) => `camera distance ${v.toFixed(1)}`}
            onChange={(v) => app.set(["card", "tilt", "perspective"], v)}
          />
          <Slider
            label="Size"
            value={Math.round(card.transform.scale * 100)}
            min={20}
            max={200}
            format={(v) => `${Math.round(v)}%`}
            onChange={(v) => app.set(["card", "transform", "scale"], v / 100)}
          />
          <Slider
            label="Move X"
            value={Math.round(card.transform.offsetX * 100)}
            min={-50}
            max={50}
            centered
            format={(v) => `${Math.round(v)}`}
            onChange={(v) => app.set(["card", "transform", "offsetX"], v / 100)}
          />
          <Slider
            label="Move Y"
            value={Math.round(card.transform.offsetY * 100)}
            min={-50}
            max={50}
            centered
            format={(v) => `${Math.round(v)}`}
            onChange={(v) => app.set(["card", "transform", "offsetY"], v / 100)}
          />
        </div>
      )}
    </section>
  );
});

// ---------------------------------------------------------------------------
// Frame
// ---------------------------------------------------------------------------

export const FRAMES: { id: string; label: string; icon: IconName }[] = [
  { id: "none", label: "No frame", icon: "frameNone" },
  { id: "macos", label: "macOS window", icon: "frameMac" },
  { id: "browser", label: "Browser", icon: "frameBrowser" },
  { id: "phone", label: "Phone", icon: "framePhone" },
  { id: "tablet", label: "Tablet", icon: "frameTablet" },
  { id: "laptop", label: "Laptop", icon: "frameLaptop" },
];

export const FrameTray = memo(function FrameTray({ bare = false }: { bare?: boolean }) {
  const app = useApp();
  const frame = useScene((s) => s.scene.card.frame);
  const device = ["phone", "tablet", "laptop"].includes(frame.id);
  const label = FRAMES.find((f) => f.id === frame.id)?.label ?? frame.id;
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const i = FRAMES.findIndex((f) => f.id === frame.id);
    const next = FRAMES[(i + d + FRAMES.length) % FRAMES.length]!;
    app.set(["card", "frame", "id"], next.id);
    requestAnimationFrame(() =>
      e.currentTarget.querySelector<HTMLButtonElement>(`[data-frame="${next.id}"]`)?.focus(),
    );
  };
  return (
    <section className="tray" aria-labelledby="t-frame" data-testid="frame-tray">
      {!bare && (
        <div className="tray-head">
          <h2 id="t-frame">Frame</h2>
          <span className="meta">{frame.id === "none" ? "None" : label}</span>
        </div>
      )}
      <div className="frames" role="radiogroup" aria-label="Frame" onKeyDown={onKey}>
        {FRAMES.map((f) => (
          <button
            key={f.id}
            type="button"
            role="radio"
            data-frame={f.id}
            aria-checked={frame.id === f.id}
            tabIndex={frame.id === f.id ? 0 : -1}
            className={`tile${frame.id === f.id ? " on" : ""}`}
            aria-label={f.label}
            title={f.label}
            onClick={() => app.set(["card", "frame", "id"], f.id)}
          >
            <Icon name={f.icon} />
          </button>
        ))}
      </div>
      {frame.id !== "none" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: device ? "1fr 1fr" : "1fr 1.3fr",
            gap: 8,
            marginTop: 10,
          }}
        >
          <Segmented
            label="Frame theme"
            value={frame.theme}
            onChange={(v) => app.set(["card", "frame", "theme"], v)}
            options={[
              { value: "light", label: "Light", icon: <Icon name="sun" size="sm" /> },
              { value: "dark", label: "Dark", icon: <Icon name="moon" size="sm" /> },
            ]}
          />
          {frame.id === "macos" && (
            <label className="input">
              <span className="sr-only">Window title</span>
              <input
                placeholder="Window title"
                value={frame.title}
                onChange={(e) => app.set(["card", "frame", "title"], e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
              />
            </label>
          )}
          {frame.id === "browser" && (
            <label className="input">
              <span className="sr-only">Address bar URL</span>
              <input
                placeholder="yoursite.com"
                value={frame.url}
                onChange={(e) => app.set(["card", "frame", "url"], e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
              />
            </label>
          )}
          {device && (
            <Segmented
              label="Camera"
              value={frame.camera === false ? "none" : "dot"}
              onChange={(v) => app.set(["card", "frame", "camera"], v === "dot")}
              options={[
                { value: "dot", label: "Camera" },
                { value: "none", label: "None" },
              ]}
            />
          )}
        </div>
      )}
      {frame.id === "macos" && (
        <div className="toggle-row" style={{ marginTop: 4 }}>
          <span className="label">Colour window buttons</span>
          <Switch
            checked={frame.lights !== "mono"}
            label="Colour window buttons"
            onChange={(v) => app.set(["card", "frame", "lights"], v ? "color" : "mono")}
          />
        </div>
      )}
    </section>
  );
});

// ---------------------------------------------------------------------------
// Inspector
// ---------------------------------------------------------------------------

function ModeTrays() {
  const mode = useUi((s) => s.mode);
  if (mode === "code")
    return (
      <>
        <CodeTray />
        <ThemesTray />
        <MotionTray />
        <WindowTray />
        <BackgroundTray />
        <LayoutTray />
      </>
    );
  if (mode === "post")
    return (
      <>
        <PostTray />
        <PostStylesTray />
        <CardTray />
        <MotionTray />
        <BackgroundTray />
        <LayoutTray />
      </>
    );
  return (
    <>
      <StylesTray />
      <MotionTray />
      <BackgroundTray />
      <LayoutTray />
      <FrameTray />
    </>
  );
}

export function Inspector() {
  const tool = useUi((s) => s.tool);
  const selection = useScene((s) => s.selection);
  const annotating = tool !== "select" || !!selection;
  return (
    <aside
      className="inspector"
      aria-label={annotating ? "Annotation settings" : "Style settings"}
      data-testid="inspector"
    >
      {annotating ? (
        <div className="inspector-pane" key="ann">
          <AnnotationInspector />
        </div>
      ) : (
        <div className="inspector-pane" key="style">
          <ModeTrays />
          <div className="foot-note">
            Free and open source ·{" "}
            <a href={SUPPORT_URL} target="_blank" rel="noreferrer">
              <Icon name="heart" size="xs" /> Support
            </a>
          </div>
        </div>
      )}
    </aside>
  );
}
