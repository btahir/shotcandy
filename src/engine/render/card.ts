/**
 * The card: border ring, frame, inset plate, content, frame overlays and
 * content-anchored annotations. Drawn in card units; the caller sets the
 * context transform (card units -> device pixels) before calling.
 */
import type { AssetResolver } from "../assets/types";
import { resolveFrame } from "../frames/registry";
import type { ResolvedFrameRef } from "../frames/types";
import { type SceneLayout, contentFade, effectiveCrop } from "../layout/layout";
import type { Palette } from "../palette/extract";
import { roundedRectPath } from "../math/path";
import type { Scene } from "../scene/types";
import { drawAnnotation } from "./annotations";
import type { RenderCache } from "./cache";
import { getContentRenderer } from "./content";
import { toCss } from "../math/color";
import { clipPath, fillPath, fillRoundedRect, shapePath, withState } from "./draw";
import type { Ctx2D, RenderEnvironment } from "./env";
import { UI_FONT_ID, fontStack } from "./fonts";

export interface CardDeps {
  env: RenderEnvironment;
  cache: RenderCache;
  assets: AssetResolver;
  palette: Palette | null;
  /** Device pixels per card unit at the current transform. */
  pixelRatio: number;
}

export function drawCard(ctx: Ctx2D, scene: Scene, layout: SceneLayout, deps: CardDeps): void {
  const { card } = layout;
  const style = scene.card;

  // 1. Border ring (outside the silhouette).
  if (card.borderOutline) {
    card.borderOutline.forEach((outer, i) => {
      const inner = card.outline[i]!;
      fillPath(ctx, [...shapePath(outer), ...shapePath(inner)], style.border.color, "evenodd");
    });
  }

  // 2. Frame body.
  const frame = card.frame ? resolveFrame(card.frame.id) : null;
  const ref: ResolvedFrameRef = {
    ...style.frame,
    theme: style.frame.theme === "auto" ? "light" : style.frame.theme,
  };
  const frameInput = card.frame
    ? {
        ref,
        geometry: card.frame.geometry,
        content: { width: card.content.width, height: card.content.height },
        onePx: 1 / layout.k,
        fontFamily: fontStack(UI_FONT_ID),
      }
    : null;
  if (frame && card.frame && frameInput) {
    withState(ctx, () => {
      ctx.translate(card.frame!.origin.x, card.frame!.origin.y);
      frame.kind.drawBack(ctx, frame.spec, frameInput);
    });
  }

  // 3. Letterboxed screens show the screenshot's own edge colour around it.
  if (card.frame?.geometry.screenFill === "edge" && card.frame.geometry.content) {
    const g = card.frame.geometry;
    const o = card.frame.origin;
    fillRoundedRect(
      ctx,
      { ...g.screen, x: g.screen.x + o.x, y: g.screen.y + o.y },
      g.screenRadii,
      deps.palette?.edge ?? "#ffffff",
      g.screenSmoothing,
    );
  }

  // 3b. Inset plate.
  if (card.inset > 0) {
    const color =
      style.inset.color === "auto" ? (deps.palette?.edge ?? "#ffffff") : style.inset.color;
    fillRoundedRect(ctx, card.plate, card.plateRadii, color, card.smoothing);
  }

  // 4. Content, clipped to its rounded rect.
  const renderer = getContentRenderer(scene.content.kind);
  withState(ctx, () => {
    clipPath(ctx, roundedRectPath(card.content, card.contentRadii, card.smoothing));
    renderer?.draw(ctx, scene.content, {
      env: deps.env,
      cache: deps.cache,
      assets: deps.assets,
      scene,
      rect: card.content,
      pixelRatio: deps.pixelRatio,
    });
    // A long capture capped to its top fades into its own background.
    const c = scene.content;
    const src = c.kind === "image" && c.assetId ? deps.assets.get(c.assetId) : undefined;
    if (c.kind === "image" && src) {
      const { capped } = effectiveCrop(c, src, style.frame.id);
      const fade = contentFade(c, capped);
      if (fade > 0) {
        const r = card.content;
        const y0 = r.y + r.height * (1 - fade);
        const edge = deps.palette?.edge ?? "#ffffff";
        const g = ctx.createLinearGradient(0, y0, 0, r.y + r.height);
        g.addColorStop(0, toCss(edge, 0));
        g.addColorStop(0.55, toCss(edge, 0.7));
        g.addColorStop(1, toCss(edge, 1));
        ctx.fillStyle = g;
        ctx.fillRect(r.x, y0, r.width, r.y + r.height - y0);
      }
    }
  });

  // 5. Frame overlays (islands, hairline outlines).
  if (frame?.kind.drawFront && card.frame && frameInput) {
    withState(ctx, () => {
      ctx.translate(card.frame!.origin.x, card.frame!.origin.y);
      frame.kind.drawFront!(ctx, frame.spec, frameInput);
    });
  }

  // 6. Content-anchored annotations.
  for (const a of scene.annotations) {
    if (a.anchor !== "content" || a.kind === "redact") continue;
    drawAnnotation(ctx, a, {
      rect: card.content,
      unit: 1,
      clip: { rect: card.content, radii: card.contentRadii, smoothing: card.smoothing },
    });
  }
}
