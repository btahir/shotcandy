"use client";
/**
 * App Store mode inspector: the set (size, orientation, flowing background,
 * device placement), set styles with live thumbnails, the selected slide
 * (screenshot, headline, subhead, order) and the headline style.
 */
import { memo, useMemo } from "react";
import {
  APPSTORE_SIZES,
  SET_MAX_SLIDES,
  SET_MIN_SLIDES,
  SET_STYLES,
  applyStylePatch,
  headlineLineCount,
  setCanvasSize,
  slideScene,
} from "@/engine";
import { useStore } from "@/lib/store";
import { Icon } from "../icons";
import { Segmented, Switch } from "../ui/controls";
import { Slider } from "../ui/Slider";
import { useApp, useScene, useUi } from "./context";
import { openFilePicker } from "./EmptyState";
import { ColourButton } from "./Inspector";
import { SceneThumb } from "./SceneThumb";

function useSet() {
  const app = useApp();
  return useStore(app.sets.state, (s) => s);
}

export const SetTray = memo(function SetTray({ bare = false }: { bare?: boolean }) {
  const app = useApp();
  const { set } = useSet();
  const size = setCanvasSize(set);
  const phones = APPSTORE_SIZES.filter((p) => p.id.includes("iphone"));
  const tablets = APPSTORE_SIZES.filter((p) => p.id.includes("ipad"));
  const pick = (id: string) => {
    const tablet = id.includes("ipad");
    app.sets.update({ sizePresetId: id });
    // Match the device frame to the size family.
    const f = app.scene.card.frame.id;
    if (tablet && f === "phone") app.set(["card", "frame", "id"], "tablet");
    if (!tablet && f === "tablet") app.set(["card", "frame", "id"], "phone");
  };
  const body = (
    <>
      <div className="size-grid" role="radiogroup" aria-label="App Store size">
        {[...phones, ...tablets].map((p) => {
          const on = set.sizePresetId === p.id;
          const dims = p.size.kind === "fixed" ? `${p.size.width}×${p.size.height}` : "";
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={on}
              className={`size-opt${on ? " on" : ""}`}
              onClick={() => pick(p.id)}
            >
              <Icon name={p.id.includes("ipad") ? "frameTablet" : "framePhone"} size="sm" />
              <b>{p.label.replace('"', "″")}</b>
              <span className="mono">{dims}</span>
            </button>
          );
        })}
      </div>
      <div className="set-row">
        <Segmented
          label="Orientation"
          value={set.landscape ? "landscape" : "portrait"}
          onChange={(v) => app.sets.update({ landscape: v === "landscape" })}
          options={[
            { value: "portrait", label: "Portrait" },
            { value: "landscape", label: "Landscape" },
          ]}
        />
        <Segmented
          label="Device placement"
          value={set.device}
          onChange={(device) => app.sets.update({ device })}
          options={[
            { value: "fit", label: "Fit" },
            { value: "bleed", label: "Bleed" },
          ]}
        />
      </div>
      <div className="toggle-row">
        <span className="label">
          Flow background across slides
          <small>One wide background, split between slides</small>
        </span>
        <Switch
          checked={set.flow}
          label="Flow background across slides"
          onChange={(flow) => app.sets.update({ flow })}
        />
      </div>
      <p className="note" style={{ marginTop: 4 }}>
        {set.slides.length} slides · {size.width} × {size.height} · no transparency (App Store rule)
      </p>
    </>
  );
  if (bare) return <div className="tray">{body}</div>;
  return (
    <section className="tray" aria-labelledby="t-set" data-testid="set-tray">
      <div className="tray-head">
        <h2 id="t-set">App Store set</h2>
        <span className="meta">
          {SET_MIN_SLIDES}–{SET_MAX_SLIDES} slides
        </span>
      </div>
      {body}
    </section>
  );
});

export const SetStylesTray = memo(function SetStylesTray({ bare = false }: { bare?: boolean }) {
  const app = useApp();
  const { set, selected } = useSet();
  const template = useScene((s) => s.scene);
  const scenes = useMemo(
    () =>
      SET_STYLES.map((st) => {
        const tpl = applyStylePatch(template, st.patch);
        const s = { ...set, text: { ...set.text, ...st.text }, flow: false };
        return { id: st.id, name: st.name, scene: slideScene(s, tpl, selected, app.resolver) };
      }),
    [set, template, selected, app],
  );
  const grid = (
    <div className={bare ? "rail" : "presets set-styles"}>
      {scenes.map(({ id, name, scene }) => (
        <button
          key={id}
          type="button"
          className={`preset${set.styleId === id ? " on" : ""}`}
          aria-pressed={set.styleId === id}
          aria-label={`${name} set style`}
          onClick={() => app.sets.applyStyle(id)}
        >
          <div className="thumb tall">
            <SceneThumb scene={scene} target={bare ? 120 : 110} priority={6} />
          </div>
          <span className="name">{name}</span>
        </button>
      ))}
    </div>
  );
  if (bare) return grid;
  return (
    <section className="tray" aria-labelledby="t-set-styles" data-testid="set-styles-tray">
      <div className="tray-head">
        <h2 id="t-set-styles">Styles</h2>
      </div>
      {grid}
    </section>
  );
});

export const SlideTray = memo(function SlideTray({ bare = false }: { bare?: boolean }) {
  const app = useApp();
  const { set, selected } = useSet();
  const slide = set.slides[selected];
  useUi((u) => u.assetsVersion);
  if (!slide) return null;
  const n = set.slides.length;
  const mismatch = app.sets.slideMismatch(selected);
  const lines = headlineLineCount(set, slide);
  const body = (
    <>
      <div className="slide-shot">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          data-testid="slide-image"
          onClick={() => openFilePicker((f) => void app.sets.setSlideImage(selected, f))}
        >
          <Icon name="image" size="sm" /> {slide.assetId ? "Replace screenshot" : "Add screenshot"}
        </button>
        {slide.assetId && (
          <button
            type="button"
            className="link quiet"
            onClick={() => app.sets.updateSlide(selected, { assetId: null })}
          >
            Remove
          </button>
        )}
      </div>
      {mismatch && (
        <div className="warn-note slide-guard" data-testid="slide-guard" role="status">
          <Icon name="alert" size="sm" />
          <span>
            This screenshot is {set.landscape ? "portrait" : "landscape"}; in a{" "}
            {set.landscape ? "landscape" : "portrait"} set it shows tiny.
            <span className="guard-acts">
              <button type="button" className="link" onClick={() => app.sets.rotateSet()}>
                Rotate device
              </button>
              <button
                type="button"
                className="link"
                onClick={() => app.sets.cropToDevice(selected)}
              >
                Crop to {set.sizePresetId.includes("ipad") ? "tablet" : "phone"}
              </button>
            </span>
          </span>
        </div>
      )}
      {slide.crop && (
        <p className="note">
          Showing a device-shaped part of the screenshot.{" "}
          <button
            type="button"
            className="link quiet"
            onClick={() => app.sets.updateSlide(selected, { crop: undefined })}
          >
            Show all
          </button>
        </p>
      )}
      <label className="field-stack">
        <span className="field-label">Headline</span>
        <span className="input">
          <input
            value={slide.headline}
            placeholder="Say the big idea"
            data-testid="slide-headline"
            onChange={(e) => app.sets.updateSlide(selected, { headline: e.target.value })}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </span>
      </label>
      {lines > 3 && (
        <p className="note warn-text" data-testid="headline-long">
          This headline needs {lines} lines{lines > 4 ? " and gets cut off" : ""}. Keep it to 3 so
          every slide lines up.
        </p>
      )}
      <label className="field-stack">
        <span className="field-label">Subhead</span>
        <span className="input area">
          <textarea
            value={slide.subhead}
            rows={2}
            placeholder="A few supporting words"
            data-testid="slide-subhead"
            onChange={(e) => app.sets.updateSlide(selected, { subhead: e.target.value })}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </span>
      </label>
      <div className="slide-actions">
        <button
          type="button"
          className="icon-btn"
          aria-label="Move slide left"
          title="Move left (⌥←)"
          disabled={selected === 0}
          onClick={() => app.sets.moveSlide(selected, -1)}
        >
          <Icon name="arrowLeft" />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Move slide right"
          title="Move right (⌥→)"
          disabled={selected === n - 1}
          onClick={() => app.sets.moveSlide(selected, 1)}
        >
          <Icon name="arrowRight" />
        </button>
        <span className="sep" aria-hidden="true" />
        <button
          type="button"
          className="icon-btn"
          aria-label="Duplicate slide"
          title="Duplicate"
          disabled={n >= SET_MAX_SLIDES}
          onClick={() => app.sets.duplicateSlide(selected)}
        >
          <Icon name="duplicate" />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Delete slide"
          title={n <= SET_MIN_SLIDES ? `A set needs at least ${SET_MIN_SLIDES} slides` : "Delete"}
          disabled={n <= SET_MIN_SLIDES}
          onClick={() => app.sets.removeSlide(selected)}
        >
          <Icon name="trash" />
        </button>
      </div>
    </>
  );
  if (bare) return <div className="tray">{body}</div>;
  return (
    <section className="tray" aria-labelledby="t-slide" data-testid="slide-tray">
      <div className="tray-head">
        <h2 id="t-slide">
          Slide {selected + 1} <span className="muted">of {n}</span>
        </h2>
      </div>
      {body}
    </section>
  );
});

export const HeadlineTray = memo(function HeadlineTray({ bare = false }: { bare?: boolean }) {
  const app = useApp();
  const { set } = useSet();
  const t = set.text;
  const body = (
    <>
      <div className="set-row">
        <Segmented
          label="Text position"
          value={t.position}
          onChange={(position) => app.sets.updateText({ position })}
          options={[
            { value: "top", label: "Top" },
            { value: "bottom", label: "Bottom" },
          ]}
        />
        <Segmented
          label="Text alignment"
          value={t.align}
          onChange={(align) => app.sets.updateText({ align })}
          options={[
            {
              value: "center",
              label: "",
              icon: <Icon name="alignCenter" size="sm" />,
              title: "Centre",
            },
            { value: "left", label: "", icon: <Icon name="alignLeft" size="sm" />, title: "Left" },
          ]}
        />
      </div>
      <div className="set-row" style={{ marginTop: 8 }}>
        <Segmented
          label="Headline font"
          value={t.font}
          onChange={(font) => app.sets.updateText({ font })}
          options={[
            { value: "display", label: "Display" },
            { value: "sans", label: "Sans" },
          ]}
        />
        <div className="colour-pair">
          <ColourButton
            value={t.color}
            label="Headline colour"
            onChange={(color) => app.sets.updateText({ color })}
          />
          <ColourButton
            value={t.subColor}
            label="Subhead colour"
            onChange={(subColor) => app.sets.updateText({ subColor })}
          />
        </div>
      </div>
      <div style={{ marginTop: 8 }}>
        <Slider
          label="Text size"
          value={Math.round(t.size * 100)}
          min={70}
          max={140}
          stops={[{ value: 100, label: "1×" }]}
          format={(v) => `${Math.round(v)}%`}
          onChange={(v) => app.sets.updateText({ size: v / 100 })}
        />
      </div>
    </>
  );
  if (bare) return <div className="tray">{body}</div>;
  return (
    <section className="tray" aria-labelledby="t-headline" data-testid="headline-tray">
      <div className="tray-head">
        <h2 id="t-headline">Headlines</h2>
        <span className="meta">all slides</span>
      </div>
      {body}
    </section>
  );
});
