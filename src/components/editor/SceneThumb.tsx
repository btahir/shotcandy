"use client";
/**
 * A live thumbnail of any scene (code themes, post styles, App Store slides),
 * rendered by the thumbnail worker with the real engine. Cached by a hash of
 * the scene, so unchanged tiles never re-render.
 */
import { memo, useEffect, useRef, useState } from "react";
import { type Scene, layoutScene } from "@/engine";
import { thumbScale } from "@/lib/thumbs/service";
import { useApp, useUi } from "./context";

export function hashString(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

export const SceneThumb = memo(function SceneThumb({
  scene,
  target,
  priority = 0,
  className,
}: {
  scene: Scene;
  /** Longest side in CSS px the tile displays. */
  target: number;
  priority?: number;
  className?: string;
}) {
  const app = useApp();
  const fonts = useUi((s) => s.fontsReady);
  const assetsVersion = useUi((s) => s.assetsVersion);
  const ref = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const thumbs = app.thumbs;
    if (!thumbs) return;
    const layout = layoutScene(scene, app.resolver);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const scale = thumbScale(Math.max(layout.canvas.width, layout.canvas.height), target * dpr);
    const key = `scene|${hashString(JSON.stringify(scene))}|${scale.toFixed(4)}|${fonts}`;
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
    else thumbs.request(key, scene, scale, priority).then(draw, () => undefined);
    return () => {
      alive = false;
    };
  }, [app, scene, target, priority, fonts, assetsVersion]);

  return (
    <>
      {!ready && <span className="skeleton" aria-hidden="true" />}
      <canvas
        ref={ref}
        width={4}
        height={3}
        aria-hidden="true"
        className={className}
        style={{ opacity: ready ? 1 : 0 }}
      />
    </>
  );
});
