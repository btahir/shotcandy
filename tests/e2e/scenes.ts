/**
 * Reference scenes for visual regression: the eight sample screenshots across
 * the built-in styles, size presets and feature-specific scenes (annotations,
 * frames options, tilt, wallpapers). Rendered at <= 720 px on the long side to
 * keep baselines small.
 */
import {
  applyStylePatch,
  createAnnotation,
  createScene,
  getSizePreset,
  getStylePreset,
  setIn,
  type CanvasSize,
  type Scene,
} from "../../src/engine";

export interface ReferenceScene {
  name: string;
  scene: Scene;
  /** Render scale so the long side is ~720 px. */
  scale: number;
}

const size = (id: string): CanvasSize => getSizePreset(id)!.size;
const fixed = (width: number, height: number): CanvasSize => ({ kind: "fixed", width, height });

function styled(
  asset: string,
  styleId: string,
  canvas: CanvasSize,
  extra: (s: Scene) => Scene = (s) => s,
): Scene {
  const style = getStylePreset(styleId);
  if (!style) throw new Error(`unknown style ${styleId}`);
  let s = createScene({ content: { kind: "image", assetId: asset }, meta: { name: styleId } });
  s = applyStylePatch(s, style.patch, style.id);
  s = setIn(s, ["canvas", "size"], canvas);
  return extra(s);
}

function scaleFor(canvas: CanvasSize, asset: string): number {
  const dims: Record<string, [number, number]> = {
    dashboard: [2880, 1800],
    editor: [2880, 1800],
    mobile: [786, 1704],
    landing: [2880, 1800],
    terminal: [2400, 1520],
    kanban: [2880, 1800],
    tablet: [2360, 1640],
    settings: [2200, 1440],
  };
  if (canvas.kind === "fixed") return 720 / Math.max(canvas.width, canvas.height);
  const [w, h] = dims[asset]!;
  return 600 / Math.max(w, h); // auto/aspect canvases are a bit larger than the shot
}

const ref = (
  name: string,
  asset: string,
  styleId: string,
  canvas: CanvasSize,
  extra?: (s: Scene) => Scene,
): ReferenceScene => ({
  name,
  scene: styled(asset, styleId, canvas, extra),
  scale: scaleFor(canvas, asset),
});

export const REFERENCE_SCENES: ReferenceScene[] = [
  // Every sample with a style that suits it.
  ref("01-dashboard-sherbet-auto", "dashboard", "sherbet", size("auto")),
  ref("02-editor-midnight-16x9", "editor", "midnight", size("16x9")),
  ref("03-mobile-phone-sorbet-story", "mobile", "phone-sorbet", size("instagram-story")),
  ref("04-landing-laptop-caramel-og", "landing", "laptop-caramel", size("og")),
  ref("05-terminal-retro-pop-4x3", "terminal", "retro-pop", size("4x3")),
  ref("06-kanban-aurora-x-post", "kanban", "aurora", size("x-post")),
  ref("07-tablet-seaglass-1x1", "tablet", "tablet-seaglass", size("1x1")),
  ref("08-settings-from-your-shot-linkedin", "settings", "from-your-shot", size("linkedin-post")),
  // Styles x sizes.
  ref("09-dashboard-mint-julep-og", "dashboard", "mint-julep", size("og")),
  ref("10-kanban-lemonade-browser", "kanban", "lemonade", fixed(1600, 1000), (s) =>
    setIn(s, ["card", "frame", "url"], "marmalade.app/board"),
  ),
  ref("11-landing-tangerine-4x5", "landing", "tangerine", size("4x5")),
  ref("12-editor-cotton-candy-ig-square", "editor", "cotton-candy", size("instagram-square")),
  ref("13-dashboard-sea-glass-9x16", "dashboard", "sea-glass", size("9x16")),
  ref("14-terminal-bubblegum-auto", "terminal", "bubblegum", size("auto")),
  ref("15-settings-paper-4x3", "settings", "paper", size("4x3")),
  ref("16-kanban-snow-linkedin-square", "kanban", "snow", size("linkedin-square")),
  ref("17-editor-grape-soda-x-card", "editor", "grape-soda", size("x-card")),
  ref("18-landing-licorice-16x9", "landing", "licorice", size("16x9")),
  ref("19-dashboard-aurora-pop-og", "dashboard", "aurora-pop", size("og")),
  ref("20-mobile-your-shot-soft-9x16", "mobile", "your-shot-soft", size("9x16")),
  ref("21-kanban-tilted-taffy-16x9", "kanban", "tilted-taffy", size("16x9")),
  ref("22-dashboard-gummy-appstore-ipad", "dashboard", "gummy", size("appstore-ipad-13")),
  ref("23-mobile-phone-appstore-iphone", "mobile", "phone-sorbet", size("appstore-iphone-69")),
  // Feature scenes.
  ref("24-annotations", "dashboard", "snow", fixed(1600, 1000), (s) => ({
    ...s,
    annotations: [
      { ...createAnnotation("arrow", "a1"), x1: 0.62, y1: 0.08, x2: 0.46, y2: 0.24, curve: 0.3 },
      {
        ...createAnnotation("text", "t1"),
        x: 0.75,
        y: 0.06,
        text: "New!",
        background: "#ffe066",
        size: 36,
      },
      { ...createAnnotation("rect", "r1"), x: 0.2, y: 0.28, w: 0.28, h: 0.16 },
      {
        ...createAnnotation("rect", "r2"),
        style: "fill",
        x: 0.52,
        y: 0.28,
        w: 0.2,
        h: 0.16,
        color: "#34d399",
      },
      { ...createAnnotation("redact", "b1"), x: 0.22, y: 0.72, w: 0.2, h: 0.08 },
      {
        ...createAnnotation("redact", "p1"),
        mode: "pixelate",
        x: 0.5,
        y: 0.72,
        w: 0.2,
        h: 0.08,
        strength: 14,
      },
      {
        ...createAnnotation("text", "t2"),
        anchor: "canvas",
        x: 0.5,
        y: 0.05,
        text: "Canvas caption",
        color: "#ffffff",
        size: 30,
      },
    ],
  })),
  ref("25-spotlight", "kanban", "sherbet", fixed(1600, 1000), (s) => ({
    ...s,
    annotations: [
      { ...createAnnotation("rect", "s1"), style: "spotlight", x: 0.3, y: 0.2, w: 0.3, h: 0.5 },
    ],
  })),
  ref("26-browser-dark-long-url", "editor", "lemonade", fixed(1600, 1000), (s) =>
    setIn(
      setIn(s, ["card", "frame", "theme"], "dark"),
      ["card", "frame", "url"],
      `fernleaf.app/${"very-long-path/".repeat(20)}`,
    ),
  ),
  ref("27-macos-mono-title-border-inset-grain", "landing", "sherbet", fixed(1600, 1000), (s) =>
    setIn(
      setIn(
        setIn(
          setIn(s, ["card", "frame"], {
            ...s.card.frame,
            lights: "mono",
            title: "Brightpond — Home",
          }),
          ["card", "border"],
          { width: 16, color: "#ffffff80" },
        ),
        ["card", "inset"],
        { width: 30, color: "auto" },
      ),
      ["background", "grain"],
      { amount: 0.35, size: 1, seed: 11 },
    ),
  ),
  ref("28-wallpaper-blur-tint", "dashboard", "sherbet", fixed(1600, 1000), (s) =>
    setIn(s, ["background", "fill"], {
      kind: "image",
      assetId: "wallpaper",
      fit: "cover",
      blur: 30,
      tint: -0.1,
      focusX: 0.5,
      focusY: 0.5,
    }),
  ),
  ref("29-tilt-steep-rotate", "tablet", "tilted-taffy", fixed(1600, 1000), (s) =>
    setIn(s, ["card", "tilt"], { rotateX: 25, rotateY: 30, rotateZ: -6, perspective: 2 }),
  ),
  ref("30-transparent-rotated", "settings", "retro-pop", fixed(1600, 1000), (s) =>
    setIn(setIn(s, ["background", "fill"], { kind: "none" }), ["card", "tilt", "rotateZ"], 8),
  ),
  // Output-beauty features: adaptive chrome, long captures, device safe areas, composition.
  ref("31-dark-app-auto-chrome", "editor", "sherbet", size("auto")),
  ref("32-long-capture-top-fade", "landing", "sherbet", fixed(1600, 1000), (s) =>
    setIn(s, ["content"], {
      kind: "image",
      assetId: "landing",
      crop: { x: 0.5, y: 0, width: 0.5, height: 1 },
      tall: "top",
    }),
  ),
  ref("33-phone-landscape-safe-area", "dashboard", "phone-sorbet", size("16x9")),
  ref("34-fill-peek-story", "kanban", "sherbet", size("instagram-story"), (s) =>
    setIn(s, ["canvas", "fit"], "fill"),
  ),
  ref("35-desk-tilt-candy-silk", "landing", "candy-silk", size("auto")),
  ref("36-photo-pile-paper", "tablet", "polaroid", size("4x3")),
  ref("37-spotlight-vignette-laptop", "dashboard", "laptop-caramel", size("auto")),
];
