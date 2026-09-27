"use client";
/**
 * Small notes that float at the top of the stage when the screenshot needs a
 * decision: a long page shown from the top, a small image that was upscaled,
 * a transparent PNG sitting on a window. Plus the code-line layer (click a
 * line of code on the stage to highlight it).
 */
import { useEffect, useMemo, useState } from "react";
import {
  type CodeContent,
  type SceneLayout,
  canvasToContent,
  codeLayout,
  contentToCanvas,
  effectiveCrop,
  sourceAdvice,
} from "@/engine";
import { Icon } from "../icons";
import { useApp, useScene, useUi } from "./context";

/** Whether an image has transparent pixels (sampled at 64 px, cached per asset). */
const alphaCache = new Map<string, boolean>();
function sampleAlpha(id: string, img: CanvasImageSource, w: number, h: number): boolean {
  const hit = alphaCache.get(id);
  if (hit !== undefined) return hit;
  let found = false;
  try {
    const s = 64 / Math.max(w, h);
    const cw = Math.max(1, Math.round(w * s));
    const ch = Math.max(1, Math.round(h * s));
    const c = document.createElement("canvas");
    c.width = cw;
    c.height = ch;
    const g = c.getContext("2d", { willReadFrequently: true })!;
    g.drawImage(img, 0, 0, cw, ch);
    const d = g.getImageData(0, 0, cw, ch).data;
    let clear = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i]! < 200) clear++;
    found = clear > (cw * ch) / 50;
  } catch {
    found = false;
  }
  alphaCache.set(id, found);
  return found;
}

export function StageNotes({ narrow = false }: { narrow?: boolean }) {
  const app = useApp();
  const content = useScene((s) => s.scene.content);
  const frameId = useScene((s) => s.scene.card.frame.id);
  const sizeKind = useScene((s) => s.scene.canvas.size.kind);
  const upscale = useScene((s) => s.scene.canvas.upscale ?? "auto");
  const fillKind = useScene((s) => s.scene.background.fill.kind);
  const inset = useScene((s) => s.scene.card.inset.width);
  const mode = useUi((s) => s.mode);
  useUi((s) => s.assetsVersion);
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});
  const image = content.kind === "image" && content.assetId ? content : null;
  const asset = image ? app.library.get(image.assetId!) : undefined;
  const aw = asset?.width ?? 0;
  const ah = asset?.height ?? 0;
  const size = useMemo(() => (aw ? { width: aw, height: ah } : null), [aw, ah]);

  const tall = useMemo(() => {
    if (!image || !size) return null;
    const auto = effectiveCrop({ ...image, tall: "auto" }, size, frameId);
    const now = effectiveCrop(image, size, frameId);
    if (!auto.capped && image.tall !== "top") return null;
    return { capped: now.capped };
  }, [image, size, frameId]);

  const advice = size ? sourceAdvice(size) : null;
  const alpha = useMemo(() => {
    if (!asset || !image) return false;
    const img = asset.images[0];
    return img
      ? sampleAlpha(asset.id, img.image as CanvasImageSource, img.width, img.height)
      : false;
  }, [asset, image]);

  if (mode !== "screenshot" || !image || !asset) return null;
  const notes: React.ReactNode[] = [];
  const key = asset.id;

  if (tall) {
    notes.push(
      <div className="stage-note" key="tall" data-testid="note-tall">
        <Icon name="screenshot" size="sm" />
        <span>{tall.capped ? "Long page: showing the top" : "Showing the whole page"}</span>
        <button
          type="button"
          className="note-act"
          onClick={() => {
            app.set(["content", "tall"], tall.capped ? "full" : "auto");
            app.announce(tall.capped ? "Showing the whole page" : "Showing the top of the page");
          }}
        >
          {tall.capped ? "Show all" : "Top only"}
        </button>
      </div>,
    );
  }
  if (advice?.small && sizeKind !== "fixed" && !dismissed[`small:${key}`]) {
    const on = upscale !== "off";
    const smooth = image.sampling === "smooth";
    notes.push(
      <div className="stage-note" key="small" data-testid="note-small">
        <Icon name="sparkle" size="sm" />
        <span>
          {on
            ? `Small image: upscaled ${advice.upscale}× ${smooth ? "smoothly" : "with crisp pixels"}`
            : `Small image at its own size (${size!.width} × ${size!.height})`}
        </span>
        {on && (
          <button
            type="button"
            className="note-act"
            onClick={() => app.set(["content", "sampling"], smooth ? "auto" : "smooth")}
          >
            {smooth ? "Crisp" : "Smooth"}
          </button>
        )}
        <button
          type="button"
          className="note-act"
          onClick={() => app.set(["canvas", "upscale"], on ? "off" : "auto")}
        >
          {on ? "Keep original size" : `Upscale ${advice.upscale}×`}
        </button>
        <button
          type="button"
          className="note-x"
          aria-label="Dismiss"
          onClick={() => setDismissed((d) => ({ ...d, [`small:${key}`]: true }))}
        >
          <Icon name="x" size="xs" />
        </button>
      </div>,
    );
  }
  const onPlate = frameId !== "none" || fillKind !== "none" || inset > 0;
  if (alpha && onPlate && !dismissed[`alpha:${key}`]) {
    notes.push(
      <div className="stage-note" key="alpha" data-testid="note-alpha">
        <Icon name="image" size="sm" />
        <span>This image is transparent</span>
        <button
          type="button"
          className="note-act"
          onClick={() => {
            app.store.update((s) => ({
              ...s,
              background: { ...s.background, fill: { kind: "none" } },
              card: {
                ...s.card,
                frame: { ...s.card.frame, id: "none" },
                inset: { ...s.card.inset, width: 0 },
                shadow: { ...s.card.shadow, preset: "none" },
              },
            }));
            app.announce("Kept the transparency: no frame, no background");
          }}
        >
          Keep transparency
        </button>
        <button
          type="button"
          className="note-x"
          aria-label="Dismiss"
          onClick={() => setDismissed((d) => ({ ...d, [`alpha:${key}`]: true }))}
        >
          <Icon name="x" size="xs" />
        </button>
      </div>,
    );
  }
  if (!notes.length) return null;
  return (
    <div className={`stage-notes${narrow ? " narrow" : ""}`} role="group" aria-label="Notes">
      {notes}
    </div>
  );
}

/**
 * Code mode: hover a line of code on the stage to see it, click to toggle its
 * highlight (the same list as the "Highlight lines" field).
 */
export function CodeLineLayer({
  layout,
  zoom,
  left,
  top,
}: {
  layout: SceneLayout;
  zoom: number;
  left: number;
  top: number;
}) {
  const app = useApp();
  const code = useScene((s) => (s.scene.content.kind === "code" ? s.scene.content : null));
  const tool = useUi((s) => s.tool);
  const selection = useScene((s) => s.selection);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => setHover(null), [code?.code]);
  if (!code || tool !== "select" || selection || layout.perspective) return null;
  const L = codeLayout(code as CodeContent);
  const lineAt = (clientX: number, clientY: number, el: HTMLElement): number | null => {
    const r = el.getBoundingClientRect();
    const p = canvasToContent(layout, (clientX - r.left) / zoom, (clientY - r.top) / zoom);
    if (!p || p.x < 0 || p.x > 1) return null;
    const i = Math.floor((p.y * L.height - L.codeY) / L.lineHeight);
    return i >= 0 && i < Math.max(1, L.lines.length) ? i + 1 : null;
  };
  const band = (n: number) => {
    const y0 = (L.codeY + (n - 1) * L.lineHeight) / L.height;
    const a = contentToCanvas(layout, 0, y0);
    const b = contentToCanvas(layout, 1, y0 + L.lineHeight / L.height);
    return {
      left: Math.min(a.x, b.x) * zoom,
      top: Math.min(a.y, b.y) * zoom,
      width: Math.abs(b.x - a.x) * zoom,
      height: Math.abs(b.y - a.y) * zoom,
    };
  };
  const on = hover !== null && code.highlight.includes(hover);
  return (
    <div
      className="code-lines"
      style={{
        left,
        top,
        width: layout.canvas.width * zoom,
        height: layout.canvas.height * zoom,
        cursor: hover ? "pointer" : undefined,
      }}
      onPointerMove={(e) => setHover(lineAt(e.clientX, e.clientY, e.currentTarget))}
      onPointerLeave={() => setHover(null)}
      onPointerDown={(e) => {
        const n = lineAt(e.clientX, e.clientY, e.currentTarget);
        if (n === null) return;
        e.stopPropagation();
        const has = code.highlight.includes(n);
        const next = has
          ? code.highlight.filter((x) => x !== n)
          : [...code.highlight, n].sort((a, b) => a - b);
        app.setCode({ highlight: next }, "code:highlight-click");
        app.announce(`Line ${n} ${has ? "no longer highlighted" : "highlighted"}`);
      }}
      data-testid="code-lines"
      aria-hidden="true"
    >
      {hover !== null && (
        <div className={`code-line-hover${on ? " on" : ""}`} style={band(hover)}>
          <span className="code-line-tip">
            {on ? "Click to unhighlight" : "Click to highlight"} · line {hover}
          </span>
        </div>
      )}
    </div>
  );
}
