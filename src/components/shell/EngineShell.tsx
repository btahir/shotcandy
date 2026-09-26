"use client";
/**
 * Minimal functional shell proving the engine end to end: load an image, tweak
 * a few raw controls, export/copy, save/load. Deliberately unstyled; the UI
 * builder replaces this component wholesale.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ACCEPT_ATTRIBUTE,
  AssetLibrary,
  DEFAULT_FILENAME_PATTERN,
  EXPORT_FORMATS,
  Exporter,
  BACKGROUND_PRESETS,
  DEFAULT_STYLE_ID,
  fetchBuiltinAsset,
  getStylePreset,
  isBuiltinAssetId,
  RenderCache,
  SHADOW_PRESETS,
  SIZE_PRESETS,
  STYLE_PRESETS,
  type Annotation,
  type BackgroundFill,
  type ExportFormat,
  type Scene,
  type ShotcandyStore,
  addAnnotation,
  applyStylePatch,
  copyImageToClipboard,
  createAnnotation,
  createProjectFile,
  createScene,
  formatFilename,
  imageFromClipboardEvent,
  imageFromDataTransfer,
  importImage,
  layoutScene,
  listFrames,
  openStore,
  outputSize,
  parseProject,
  projectToBlob,
  renderScene,
  sceneAssetIds,
  setIn,
} from "@/engine";
import { createExportWorker } from "@/engine/export/worker-factory";
import { createEditorStore } from "@/state/editor-store";
import { useEditor } from "@/state/react";

const PREVIEW_MAX = 960;

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function EngineShell() {
  const store = useMemo(
    () =>
      createEditorStore(
        applyStylePatch(createScene(), getStylePreset(DEFAULT_STYLE_ID)!.patch, DEFAULT_STYLE_ID),
      ),
    [],
  );
  const library = useMemo(() => new AssetLibrary(), []);
  const cache = useMemo(() => new RenderCache(), []);
  const exporter = useMemo(() => new Exporter({ createWorker: createExportWorker }), []);
  const scene = useEditor(store, (s) => s.scene);
  const canUndo = useEditor(store, (s) => s.canUndo);
  const canRedo = useEditor(store, (s) => s.canRedo);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState("Paste, drop or choose a screenshot.");
  const [renderMs, setRenderMs] = useState(0);
  const [format, setFormat] = useState<ExportFormat>("png");
  const [scale, setScale] = useState(2);
  const [pattern, setPattern] = useState(DEFAULT_FILENAME_PATTERN);
  const [db, setDb] = useState<ShotcandyStore | null>(null);
  const [designs, setDesigns] = useState<{ id: string; name: string }[]>([]);
  const [assetVersion, setAssetVersion] = useState(0);

  const update = useCallback(
    (path: (string | number)[], value: unknown, coalesce?: string) =>
      store.update((s) => setIn(s, path, value), { coalesce: coalesce ?? path.join(".") }),
    [store],
  );

  // Built-in wallpapers load on demand from public/backgrounds.
  useEffect(() => {
    const missing = sceneAssetIds(scene).filter((id) => isBuiltinAssetId(id) && !library.has(id));
    for (const id of missing) {
      void fetchBuiltinAsset(id)
        .then((blob) => importImage(blob))
        .then((img) => {
          library.add({ ...img, id });
          setAssetVersion((v) => v + 1);
        })
        .catch((e: unknown) => setStatus(String(e)));
    }
  }, [scene, library]);

  // Preview render.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const id = requestAnimationFrame(() => {
      const t0 = performance.now();
      const layout = layoutScene(scene, library);
      const fit = Math.min(1, PREVIEW_MAX / Math.max(layout.canvas.width, layout.canvas.height));
      const dpr = window.devicePixelRatio || 1;
      const s = fit * dpr;
      const size = outputSize(layout, s);
      canvas.width = size.width;
      canvas.height = size.height;
      canvas.style.width = `${size.width / dpr}px`;
      canvas.style.height = `${size.height / dpr}px`;
      renderScene(canvas.getContext("2d")!, scene, library, { scale: s, cache });
      setRenderMs(performance.now() - t0);
    });
    return () => cancelAnimationFrame(id);
  }, [scene, library, cache, assetVersion]);

  const loadBlob = useCallback(
    async (blob: Blob) => {
      try {
        setStatus("Importing…");
        const img = await importImage(blob);
        library.add(img);
        await db?.assets.put({
          id: img.id,
          blob: img.blob,
          mime: img.mime,
          width: img.width,
          height: img.height,
          role: "content",
          createdAt: Date.now(),
        });
        store.update((s) => ({ ...s, content: { kind: "image", assetId: img.id } }));
        setAssetVersion((v) => v + 1);
        setStatus(`Loaded ${img.width}×${img.height} (${img.mime})`);
      } catch (e) {
        setStatus(e instanceof Error ? e.message : String(e));
      }
    },
    [library, store, db],
  );

  // Paste and drop anywhere.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const f = imageFromClipboardEvent(e);
      if (f) {
        e.preventDefault();
        void loadBlob(f);
      }
    };
    const onDragOver = (e: DragEvent) => e.preventDefault();
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer && imageFromDataTransfer(e.dataTransfer);
      if (f) void loadBlob(f);
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
      }
    };
    document.addEventListener("paste", onPaste);
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("drop", onDrop);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("drop", onDrop);
      document.removeEventListener("keydown", onKey);
    };
  }, [loadBlob, store]);

  // Storage.
  const refreshDesigns = useCallback(async (s: ShotcandyStore) => {
    setDesigns((await s.designs.list()).map((d) => ({ id: d.id, name: d.name })));
  }, []);
  useEffect(() => {
    let alive = true;
    void openStore().then((s) => {
      if (!alive) return;
      setDb(s);
      void refreshDesigns(s);
    });
    exporter.prewarm();
    return () => {
      alive = false;
    };
  }, [exporter, refreshDesigns]);

  // Test hook for e2e (the real UI may keep or drop this).
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__shotcandy = {
      store,
      library,
      exporter,
      db,
      loadBlob,
    };
  }, [store, library, exporter, db, loadBlob]);

  const doExport = async () => {
    const t0 = performance.now();
    const result = await exporter.export(scene, library.exportAssets(sceneAssetIds(scene)), {
      format,
      scale,
    });
    const name = formatFilename(pattern, {
      name: scene.meta.name,
      preset: scene.canvas.size.kind !== "auto" ? scene.canvas.size.presetId : "auto",
      width: result.width,
      height: result.height,
      scale,
      format,
      now: new Date(),
    });
    download(result.blob, name);
    setStatus(
      `Exported ${name} (${result.width}×${result.height}, ${result.mime}) via ${result.via} in ${Math.round(performance.now() - t0)} ms`,
    );
  };

  const doCopy = () => {
    const png = exporter
      .export(scene, library.exportAssets(sceneAssetIds(scene)), { format: "png", scale })
      .then((r) => r.blob);
    copyImageToClipboard(png).then(
      () => setStatus("Copied PNG to clipboard"),
      (e: unknown) => setStatus(`Copy failed: ${e instanceof Error ? e.message : String(e)}`),
    );
  };

  const saveProject = async () => {
    const file = await createProjectFile(
      scene,
      library
        .exportAssets(sceneAssetIds(scene))
        .map((a) => ({ id: a.id, blob: a.blob, width: a.width, height: a.height })),
      { appVersion: "0.1.0", now: new Date() },
    );
    download(await projectToBlob(file), `${scene.meta.name || "shotcandy"}.shotcandy`);
  };

  const loadProject = async (file: File) => {
    try {
      const p = await parseProject(file);
      for (const a of p.assets) library.add(await importImage(a.blob));
      store.reset(p.scene);
      setAssetVersion((v) => v + 1);
      setStatus(p.issues.length ? `Loaded with notes: ${p.issues.join("; ")}` : "Project loaded");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
  };

  const saveDesign = async () => {
    if (!db) return;
    const now = Date.now();
    const id = `d_${now.toString(36)}`;
    await db.designs.put({
      id,
      name: scene.meta.name || "Untitled",
      scene,
      createdAt: now,
      updatedAt: now,
    });
    await refreshDesigns(db);
    setStatus("Design saved");
  };

  const openDesign = async (id: string) => {
    if (!db) return;
    const d = await db.designs.get(id);
    if (!d) return;
    for (const assetId of sceneAssetIds(d.scene)) {
      if (library.has(assetId)) continue;
      const rec = await db.assets.get(assetId);
      if (rec) library.add(await importImage(rec.blob));
    }
    store.reset(d.scene);
    setAssetVersion((v) => v + 1);
  };

  const addNote = (kind: Annotation["kind"]) => {
    const id = `${kind}-${scene.annotations.length + 1}`;
    store.update((s) => addAnnotation(s, createAnnotation(kind, id)));
  };

  const fills: { id: string; label: string; fill: BackgroundFill }[] = [
    ...BACKGROUND_PRESETS,
    { id: "none", label: "Transparent", fill: { kind: "none" } },
  ];

  const layout = layoutScene(scene, library);
  const label = "flex flex-col gap-1 text-sm";

  return (
    <main className="grid min-h-screen grid-cols-1 gap-4 p-4 lg:grid-cols-[320px_1fr]">
      <aside className="flex flex-col gap-3 text-sm" aria-label="Controls">
        <h1 className="text-lg font-semibold">Shotcandy engine shell</h1>
        <label className={label}>
          Screenshot
          <input
            type="file"
            accept={ACCEPT_ATTRIBUTE}
            onChange={(e) => e.target.files?.[0] && loadBlob(e.target.files[0])}
          />
        </label>
        <label className={label}>
          Style preset
          <select
            value={scene.meta.stylePresetId ?? ""}
            onChange={(e) => {
              const p = STYLE_PRESETS.find((s) => s.id === e.target.value);
              if (p) store.update((s) => applyStylePatch(s, p.patch, p.id));
            }}
          >
            <option value="">Custom</option>
            {STYLE_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Size
          <select
            value={scene.canvas.size.kind === "auto" ? "auto" : (scene.canvas.size.presetId ?? "")}
            onChange={(e) => {
              const p = SIZE_PRESETS.find((s) => s.id === e.target.value);
              if (p) update(["canvas", "size"], p.size);
            }}
          >
            {SIZE_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} ({p.hint})
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Background
          <select
            onChange={(e) => {
              const f = fills.find((x) => x.id === e.target.value);
              if (f) update(["background", "fill"], f.fill);
            }}
            defaultValue=""
          >
            <option value="" disabled>
              Choose…
            </option>
            {fills.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <Range
          label="Grain"
          min={0}
          max={1}
          step={0.01}
          value={scene.background.grain.amount}
          onChange={(v) => update(["background", "grain", "amount"], v)}
        />
        <label className={label}>
          Frame
          <select
            value={scene.card.frame.id}
            onChange={(e) => update(["card", "frame", "id"], e.target.value)}
          >
            <option value="none">None</option>
            {listFrames().map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Frame theme
          <select
            value={scene.card.frame.theme}
            onChange={(e) => update(["card", "frame", "theme"], e.target.value)}
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        <label className={label}>
          Window title / URL
          <input
            value={
              scene.card.frame.id === "browser" ? scene.card.frame.url : scene.card.frame.title
            }
            onChange={(e) =>
              update(
                ["card", "frame", scene.card.frame.id === "browser" ? "url" : "title"],
                e.target.value,
              )
            }
          />
        </label>
        <Range
          label="Padding"
          min={0}
          max={400}
          step={1}
          value={scene.canvas.padding}
          onChange={(v) => update(["canvas", "padding"], v)}
        />
        <Range
          label="Radius"
          min={0}
          max={120}
          step={1}
          value={scene.card.radius}
          onChange={(v) => update(["card", "radius"], v)}
        />
        <Range
          label="Corner smoothing"
          min={0}
          max={1}
          step={0.01}
          value={scene.card.smoothing}
          onChange={(v) => update(["card", "smoothing"], v)}
        />
        <label className={label}>
          Shadow
          <select
            value={scene.card.shadow.preset}
            onChange={(e) => update(["card", "shadow", "preset"], e.target.value)}
          >
            {SHADOW_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <Range
          label="Shadow strength"
          min={0}
          max={2}
          step={0.01}
          value={scene.card.shadow.strength}
          onChange={(v) => update(["card", "shadow", "strength"], v)}
        />
        <Range
          label="Inset"
          min={0}
          max={120}
          step={1}
          value={scene.card.inset.width}
          onChange={(v) => update(["card", "inset", "width"], v)}
        />
        <Range
          label="Border"
          min={0}
          max={40}
          step={1}
          value={scene.card.border.width}
          onChange={(v) => update(["card", "border", "width"], v)}
        />
        <Range
          label="Tilt X"
          min={-45}
          max={45}
          step={1}
          value={scene.card.tilt.rotateX}
          onChange={(v) => update(["card", "tilt", "rotateX"], v)}
        />
        <Range
          label="Tilt Y"
          min={-45}
          max={45}
          step={1}
          value={scene.card.tilt.rotateY}
          onChange={(v) => update(["card", "tilt", "rotateY"], v)}
        />
        <Range
          label="Rotate"
          min={-30}
          max={30}
          step={1}
          value={scene.card.tilt.rotateZ}
          onChange={(v) => update(["card", "tilt", "rotateZ"], v)}
        />
        <Range
          label="Scale"
          min={0.3}
          max={1.5}
          step={0.01}
          value={scene.card.transform.scale}
          onChange={(v) => update(["card", "transform", "scale"], v)}
        />
        <fieldset className="flex flex-wrap gap-2">
          <legend>Annotations</legend>
          <button type="button" onClick={() => addNote("text")}>
            + Text
          </button>
          <button type="button" onClick={() => addNote("arrow")}>
            + Arrow
          </button>
          <button type="button" onClick={() => addNote("rect")}>
            + Box
          </button>
          <button type="button" onClick={() => addNote("redact")}>
            + Blur
          </button>
          <button type="button" onClick={() => store.update((s) => ({ ...s, annotations: [] }))}>
            Clear
          </button>
        </fieldset>
        <fieldset className="flex flex-wrap items-end gap-2">
          <legend>Export</legend>
          <label className={label}>
            Format
            <select value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)}>
              {EXPORT_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {f.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            Scale
            <select value={scale} onChange={(e) => setScale(Number(e.target.value))}>
              {[1, 2, 3, 4].map((s) => (
                <option key={s} value={s}>
                  {s}×
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            Filename
            <input value={pattern} onChange={(e) => setPattern(e.target.value)} />
          </label>
          <button type="button" onClick={doExport}>
            Download
          </button>
          <button type="button" onClick={doCopy}>
            Copy
          </button>
        </fieldset>
        <fieldset className="flex flex-wrap gap-2">
          <legend>Project</legend>
          <button type="button" onClick={() => store.undo()} disabled={!canUndo}>
            Undo
          </button>
          <button type="button" onClick={() => store.redo()} disabled={!canRedo}>
            Redo
          </button>
          <button type="button" onClick={saveProject}>
            Save .shotcandy
          </button>
          <label>
            Open .shotcandy{" "}
            <input
              type="file"
              accept=".shotcandy,application/json"
              onChange={(e) => e.target.files?.[0] && loadProject(e.target.files[0])}
            />
          </label>
          <button type="button" onClick={saveDesign} disabled={!db}>
            Save design
          </button>
        </fieldset>
        {designs.length > 0 && (
          <ul aria-label="Saved designs">
            {designs.map((d) => (
              <li key={d.id}>
                <button type="button" onClick={() => openDesign(d.id)}>
                  {d.name} ({d.id})
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
      <section className="flex flex-col items-start gap-2" aria-label="Preview">
        <p role="status" data-testid="status">
          {status}
        </p>
        <p className="text-xs opacity-70" data-testid="meta">
          Output {layout.canvas.width}×{layout.canvas.height} at 1× · preview render{" "}
          {renderMs.toFixed(1)} ms
        </p>
        <canvas ref={canvasRef} data-testid="preview" className="max-w-full" />
      </section>
    </main>
  );
}

function Range(props: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span>
        {props.label}: {Number.isInteger(props.step) ? props.value : props.value.toFixed(2)}
      </span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
    </label>
  );
}

export type { Scene };
