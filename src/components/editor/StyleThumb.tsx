"use client";
/** A style preview rendered from the user's own screenshot (thumbnail worker). */
import { memo, useEffect, useRef, useState } from "react";
import { type Scene, type StylePatch, applyStylePatch, createScene, layoutScene } from "@/engine";
import { GHOST_ID } from "@/lib/ghost";
import { thumbScale } from "@/lib/thumbs/service";
import { useApp, useScene, useUi } from "./context";

function hashString(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

export const StyleThumb = memo(function StyleThumb({
  styleKey,
  patch,
  aspect,
  target,
  priority = 0,
}: {
  styleKey: string;
  patch: StylePatch;
  aspect: [number, number];
  /** Longest side in CSS px the tile displays. */
  target: number;
  priority?: number;
}) {
  const app = useApp();
  const contentId = useScene((s) =>
    s.scene.content.kind === "image" ? (s.scene.content.assetId ?? null) : null,
  );
  const frameText = useScene((s) => `${s.scene.card.frame.title}|${s.scene.card.frame.url}`);
  const assetsVersion = useUi((s) => s.assetsVersion);
  const fonts = useUi((s) => s.fontsReady);
  const ref = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  const [aw, ah] = aspect;
  const content = contentId && app.library.has(contentId) ? contentId : GHOST_ID;
  const hasSource = content === GHOST_ID ? !!app.ghost : true;

  useEffect(() => {
    const thumbs = app.thumbs;
    if (!thumbs || !hasSource) return;
    const [title, url] = frameText.split("|");
    let scene: Scene = createScene({ content: { kind: "image", assetId: content } });
    scene = applyStylePatch(scene, patch);
    scene = {
      ...scene,
      canvas: { ...scene.canvas, size: { kind: "aspect", ratioW: aw, ratioH: ah } },
      card: {
        ...scene.card,
        frame: { ...scene.card.frame, title: title ?? "", url: url || "shotcandy.vercel.app" },
      },
    };
    const layout = layoutScene(scene, app.resolver);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const long = Math.max(layout.canvas.width, layout.canvas.height);
    const scale = thumbScale(long, target * dpr);
    const key = `${styleKey}|${hashString(JSON.stringify(patch))}|${content}|${aw}:${ah}|${scale.toFixed(4)}|${fonts}|${hashString(frameText)}`;
    let alive = true;
    const draw = (bmp: ImageBitmap) => {
      const c = ref.current;
      if (!alive || !c) return;
      if (c.width !== bmp.width) c.width = bmp.width;
      if (c.height !== bmp.height) c.height = bmp.height;
      const g = c.getContext("2d");
      g?.clearRect(0, 0, c.width, c.height);
      g?.drawImage(bmp, 0, 0);
      setReady(true);
    };
    const hit = thumbs.get(key);
    if (hit) draw(hit);
    else
      thumbs.request(key, scene, scale, priority).then(draw, () => {
        /* cancelled or failed: keep the skeleton */
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app, content, hasSource, styleKey, patch, aw, ah, target, fonts, assetsVersion, frameText]);

  return (
    <>
      {!ready && <span className="skeleton" aria-hidden="true" />}
      <canvas
        ref={ref}
        width={4}
        height={3}
        aria-hidden="true"
        style={{ opacity: ready ? 1 : 0 }}
      />
    </>
  );
});
