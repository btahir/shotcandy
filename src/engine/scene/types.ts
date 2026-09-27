/**
 * The Shotcandy scene model.
 *
 * A Scene is plain, JSON-serialisable data that fully describes one output
 * image. The renderer is a pure function of (scene, assets, scale): the same
 * inputs always produce the same pixels.
 *
 * Units
 * -----
 * Lengths that belong to the card (radius, border, inset, shadows, frame chrome,
 * annotation stroke widths and font sizes, and padding) are in *card units*
 * ("cu"): the screenshot's reference side is always 1000 cu. The reference side
 * is the longer side, capped at 1.8x the shorter one, so ordinary captures
 * (up to 16:9) measure 1000 cu on their long side, while very tall or very
 * wide captures scale padding, radius and shadows from their short side
 * instead of drowning in margins (layout/layout.ts `referenceSide`). A design therefore
 * looks identical at every output size; switching from a 1200x630 Open Graph
 * canvas to a 1080x1920 story rescales the whole card instead of changing its
 * proportions. Positions of annotations are normalized (0..1) to their anchor
 * box. Output pixels only appear at the very end, in layout.
 */

/** Normalized hex colour: `#rrggbb` or `#rrggbbaa`. */
export type Color = string;

export const SCENE_VERSION = 2 as const;

export interface Scene {
  /** Schema version; see scene/migrate.ts. */
  version: typeof SCENE_VERSION;
  canvas: CanvasSpec;
  background: BackgroundSpec;
  content: Content;
  card: CardStyle;
  annotations: Annotation[];
  meta: SceneMeta;
  /**
   * Motion for animated export (GIF/MP4/WebM). Absent = a still image. The
   * scene itself is the rest pose; animation/timeline.ts evaluates frames.
   */
  animation?: AnimationSpec;
}

// ---------------------------------------------------------------------------
// Animation
// ---------------------------------------------------------------------------

/** Named easing curves (animation/easing.ts). */
export type MotionEasing = "smooth" | "snappy" | "gentle" | "bounce" | "linear";

/**
 * How a non-periodic motion plays: "once" moves, then holds the rest pose;
 * "boomerang" moves there and back so the file loops seamlessly. Periodic
 * motions (float, sweep, drift) always loop seamlessly and ignore this.
 */
export type MotionLoop = "once" | "boomerang";

export interface AnimationSpec {
  /** Motion preset id (animation/presets.ts). */
  preset: string;
  /** Length of one loop in seconds (1..20). */
  duration: number;
  /** Frames per second of the preview and exports (10..60). */
  fps: number;
  easing: MotionEasing;
  loop: MotionLoop;
  /** Scales the size of the movement (0.25..2). */
  intensity: number;
  /** Draw annotations on in turn: arrows draw, highlights pop, text types. */
  annotations: boolean;
  /** Point the "focus" motion zooms into, normalized to the content (0..1). */
  focusX: number;
  focusY: number;
}

export interface SceneMeta {
  /** Display name, also used by the export filename pattern. */
  name: string;
  /** Id of the style preset last applied, if any (informational). */
  stylePresetId?: string;
}

// ---------------------------------------------------------------------------
// Canvas
// ---------------------------------------------------------------------------

export type CanvasSize =
  /** Canvas hugs the card: card + padding, at the screenshot's native resolution. */
  | { kind: "auto" }
  /** Auto size grown along one axis to reach an aspect ratio (e.g. 16:9). */
  | { kind: "aspect"; ratioW: number; ratioH: number; presetId?: string }
  /** Exact output dimensions at 1x (e.g. Open Graph 1200x630). */
  | { kind: "fixed"; width: number; height: number; presetId?: string };

export interface CanvasSpec {
  size: CanvasSize;
  /** Minimum space around the card, in card units. */
  padding: number;
  /**
   * How the card fills a fixed or aspect canvas. "auto" (default): contain,
   * but when that would leave wide empty bands the card grows (up to ~1.45x)
   * and bleeds off one edge. "contain": always fully visible. "fill": grow
   * until the loose axis is filled with padding, bleeding the rest.
   */
  fit?: CanvasFit;
  /** 9-grid position of the card; with bleed the card runs off the opposite edge. */
  anchor?: CanvasAnchor;
  /** Fraction of the card (0..0.7) cut off by the canvas edge opposite the anchor. */
  bleed?: number;
  /**
   * Small sources (long side under 1000 px) are upscaled by a whole number in
   * auto and aspect canvases so exports are usable ("auto", default); "off"
   * keeps native pixels.
   */
  upscale?: "auto" | "off";
}

export type CanvasFit = "auto" | "contain" | "fill";

export type CanvasAnchor =
  | "center"
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

// ---------------------------------------------------------------------------
// Background
// ---------------------------------------------------------------------------

export interface GradientStop {
  /** 0..1 */
  offset: number;
  color: Color;
}

export interface MeshPoint {
  /** 0..1 across the canvas */
  x: number;
  y: number;
  color: Color;
  /** Influence radius as a fraction of the canvas diagonal (0.05..1.5). */
  radius: number;
}

export type BackgroundFill =
  | { kind: "none" }
  | { kind: "solid"; color: Color }
  /** CSS-style angle: 0deg points up, 90deg points right. */
  | { kind: "linear"; angle: number; stops: GradientStop[] }
  /** Centre is normalized; radius is a fraction of the canvas half-diagonal. */
  | { kind: "radial"; cx: number; cy: number; radius: number; stops: GradientStop[] }
  /** Angle 0deg starts at the top, clockwise (matches CSS conic-gradient). */
  | { kind: "conic"; cx: number; cy: number; angle: number; stops: GradientStop[] }
  | { kind: "mesh"; base: Color; points: MeshPoint[] }
  | {
      kind: "image";
      assetId: string;
      fit: "cover" | "contain" | "stretch";
      /** Blur radius in card units (0 = sharp). */
      blur: number;
      /** -1 (black) .. 0 .. 1 (white) overlay to tame busy images. */
      tint: number;
      /** Focus point for cover cropping, 0..1. */
      focusX: number;
      focusY: number;
    }
  /**
   * Derived from the content screenshot's palette at render time. `variant`
   * indexes suggestBackgrounds(palette); resolution is deterministic.
   */
  | { kind: "auto"; style: AutoBackgroundStyle; variant: number };

export type AutoBackgroundStyle = "mesh" | "linear" | "radial" | "solid" | "soft";

export interface GrainSpec {
  /** 0 (off) .. 1 (heavy). */
  amount: number;
  /** Grain cell size in output pixels at 1x (1..4). */
  size: number;
  /** Seed so the pattern is stable across renders. */
  seed: number;
}

export interface BackgroundSpec {
  fill: BackgroundFill;
  grain: GrainSpec;
  /**
   * App Store sets: this canvas is slide `index` of `count` slides laid side
   * by side, and the background is painted across all of them, so it flows
   * from one slide into the next. Absent = the background fits this canvas.
   */
  span?: { index: number; count: number };
  /** Surface texture over the fill (paper fibres, canvas weave). Absent = none. */
  texture?: TextureSpec | null;
  /** Darkened edges and a soft light behind the card. Absent = none. */
  vignette?: VignetteSpec | null;
}

export interface TextureSpec {
  kind: "paper" | "canvas" | "halftone";
  /** 0..1 */
  amount: number;
  seed: number;
}

export interface VignetteSpec {
  /** Edge darkening, 0..1. */
  amount: number;
  /** Soft light pooled behind the card, 0..1. */
  spotlight: number;
  /** Vignette colour (usually a deep tone of the background). */
  color: Color;
}

// ---------------------------------------------------------------------------
// Content (what sits on the card)
// ---------------------------------------------------------------------------

export interface CropRect {
  /** Normalized to the source image, 0..1. */
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Discriminated union so phase 2 can add `{ kind: "code" }`, `{ kind: "post" }`
 * etc. through the content registry (render/content.ts) without touching the
 * rest of the pipeline.
 */
export type Content =
  | ImageContent
  | { kind: "placeholder"; width: number; height: number; color: Color }
  | CodeContent
  | PostContent;

export interface ImageContent {
  kind: "image";
  assetId: string | null;
  crop?: CropRect;
  /**
   * Long captures: "auto" (default) shows the top of captures taller than 3:1,
   * "top" always caps the height, "full" shows everything.
   */
  tall?: "auto" | "top" | "full";
  /** Fade the bottom of a capped capture into its own background (0..0.5 of its height; default 0.18 when capped). */
  fade?: number;
  /** Upscaling filter: "auto" keeps small sources crisp (nearest neighbour) when magnified 2x or more. */
  sampling?: "auto" | "smooth" | "pixel";
}

/**
 * Syntax-highlighting result stored with the code so rendering stays
 * synchronous, deterministic and worker-safe (no highlighter needed to draw).
 * Each token is [text, category]; categories are listed in code/themes.ts.
 */
export interface CodeTokens {
  /** Hash of (code, language) the tokens were computed for. */
  key: string;
  /** Resolved language id the tokens were computed with. */
  language: string;
  lines: [string, number][][];
}

/** A code snippet drawn as a window (a ray.so-style code image). */
export interface CodeContent {
  kind: "code";
  code: string;
  /** Language id (code/languages.ts) or "auto" to detect it. */
  language: string;
  /** Code theme id (code/themes.ts). */
  theme: string;
  /** Font size in px at 1x (10..32). */
  fontSize: number;
  lineNumbers: boolean;
  /** 1-based line numbers to highlight. */
  highlight: number[];
  /** Window title, usually a file name. Empty hides it. */
  title: string;
  /** Window controls: coloured dots, a quiet title bar, or none. */
  chrome: "mac" | "minimal" | "none";
  /** Space around the code, px at 1x. */
  padding: number;
  /** Window width in px at 1x (never narrower than the code needs); absent = hug the code. */
  width?: number;
  tokens?: CodeTokens | null;
}

/** A social post or testimonial card (typed in by the user; no network). */
export interface PostContent {
  kind: "post";
  variant: "social" | "testimonial";
  name: string;
  /** Handle or role line, e.g. "@maya" or "Head of Design, Quokka". */
  handle: string;
  /** Uploaded avatar asset, or null for an initials avatar. */
  avatarAssetId: string | null;
  text: string;
  /** Free text date, e.g. "Sep 26, 2026". Empty hides it. */
  date: string;
  /** Card theme id (post/themes.ts). */
  theme: string;
  /** 0 hides the stars (testimonial only). */
  rating: number;
  /** Social post footer numbers (free text, e.g. "1.2K"); empty hides the footer. */
  metrics: { replies: string; reposts: string; likes: string };
  /** Card width in px at 1x (320..900). */
  width: number;
  /** Accent colour for the quote mark, links and hashtags. */
  accent: Color;
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

export type FrameTheme = "light" | "dark";

export interface FrameRef {
  /** Registry id: "none", "macos", "browser", "phone", ... (see frames/). */
  id: string;
  /**
   * Chrome colour. "auto" matches the screenshot: window and browser frames
   * sample the luminance of its top rows; devices default to dark.
   */
  theme: FrameTheme | "auto";
  /** Window title (macOS window) */
  title: string;
  /** Address bar text (browser) */
  url: string;
  /** Window traffic lights in colour (default) or monochrome. */
  lights?: "color" | "mono";
  /** Device camera dot (default true). */
  camera?: boolean;
}

export interface BorderSpec {
  /** Ring width outside the card, in cu. 0 disables it. */
  width: number;
  color: Color;
}

export interface InsetSpec {
  /** Plate width around the screenshot, in cu. 0 disables it. */
  width: number;
  /** Plate colour, or "auto" to extend the screenshot's own edge colour. */
  color: Color | "auto";
}

export interface ShadowLayer {
  x: number;
  y: number;
  blur: number;
  spread: number;
  /** 0..1 before strength is applied */
  opacity: number;
}

export interface ShadowSpec {
  /** Built-in preset id (presets/shadows.ts) or "custom" to use `layers`. */
  preset: string;
  /** Multiplies every layer's opacity (0..2). */
  strength: number;
  color: Color;
  /** Only used when preset === "custom". Lengths in cu. */
  layers?: ShadowLayer[];
}

export interface TiltSpec {
  rotateX: number;
  rotateY: number;
  rotateZ: number;
  /** Camera distance as a multiple of the card's larger side (1.2..10). */
  perspective: number;
}

export interface CardTransform {
  /** Relative to the auto-fit size (0.2..2). */
  scale: number;
  /** Offset of the card centre as a fraction of canvas width/height (-0.5..0.5). */
  offsetX: number;
  offsetY: number;
}

/** Ghost cards stacked behind the card, each with its own shadow. */
export interface StackSpec {
  /** Number of ghost cards (0..3). */
  count: number;
  /** Offset per ghost in cu (x, y) and rotation per ghost in degrees. */
  x: number;
  y: number;
  rotate: number;
  /** Shrink per ghost (0..0.2). */
  shrink: number;
  /** Ghost colour, or "auto" for the screenshot's own edge colour. */
  color: Color | "auto";
}

/** A mirror image of the card on a glossy floor. */
export interface ReflectionSpec {
  /** Opacity at the card's bottom edge (0..1). */
  opacity: number;
  /** Fraction of the card height the reflection fades over (0.05..1). */
  height: number;
  /** Gap between card and reflection, in cu. */
  gap: number;
}

export interface CardStyle {
  frame: FrameRef;
  /** Corner radius in cu (card outer corners, or window corners). */
  radius: number;
  /** Continuous-corner smoothing, 0 (circular) .. 1; 0.6 matches iOS. */
  smoothing: number;
  border: BorderSpec;
  inset: InsetSpec;
  shadow: ShadowSpec;
  tilt: TiltSpec;
  transform: CardTransform;
  stack?: StackSpec | null;
  reflection?: ReflectionSpec | null;
}

// ---------------------------------------------------------------------------
// Annotations
// ---------------------------------------------------------------------------

/**
 * "content": coordinates normalized to the screenshot; moves and tilts with it.
 * "canvas": coordinates normalized to the whole canvas; drawn on top.
 */
export type AnnotationAnchor = "content" | "canvas";

interface AnnotationBase {
  id: string;
  anchor: AnnotationAnchor;
  /**
   * Render-time draw-on progress (0..1) set by the animation timeline; never
   * persisted. Absent = fully drawn. Redactions ignore it (always applied).
   */
  reveal?: number;
}

export interface TextAnnotation extends AnnotationBase {
  kind: "text";
  x: number;
  y: number;
  text: string;
  /** Font registry id (render/fonts.ts). */
  font: string;
  /** In cu. */
  size: number;
  weight: number;
  color: Color;
  align: "left" | "center" | "right";
  /** Optional pill behind the text. */
  background: Color | null;
}

export interface ArrowAnnotation extends AnnotationBase {
  kind: "arrow";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: Color;
  /** Stroke width in cu. */
  width: number;
  /** -1..1: bend of the shaft (0 = straight). */
  curve: number;
  head: "triangle" | "line" | "none";
}

export interface RectAnnotation extends AnnotationBase {
  kind: "rect";
  x: number;
  y: number;
  w: number;
  h: number;
  /** outline: stroked box. fill: translucent marker. spotlight: dims everything else. */
  style: "outline" | "fill" | "spotlight";
  color: Color;
  /** Stroke width in cu. */
  width: number;
  /** Corner radius in cu. */
  radius: number;
}

export interface RedactAnnotation extends AnnotationBase {
  kind: "redact";
  /** Redaction is always content-anchored. */
  anchor: "content";
  x: number;
  y: number;
  w: number;
  h: number;
  mode: "blur" | "pixelate";
  /** Blur sigma or pixel block size, in cu. */
  strength: number;
}

export type Annotation = TextAnnotation | ArrowAnnotation | RectAnnotation | RedactAnnotation;
export type AnnotationKind = Annotation["kind"];

/** Style-only subset of a scene, used by style presets. */
export interface StylePatch {
  canvas?: { padding?: number; fit?: CanvasFit; anchor?: CanvasAnchor; bleed?: number };
  background?: {
    fill?: BackgroundFill;
    grain?: Partial<GrainSpec>;
    texture?: TextureSpec | null;
    vignette?: VignetteSpec | null;
  };
  card?: {
    frame?: Partial<FrameRef>;
    radius?: number;
    smoothing?: number;
    border?: Partial<BorderSpec>;
    inset?: Partial<InsetSpec>;
    shadow?: Partial<ShadowSpec>;
    tilt?: Partial<TiltSpec>;
    transform?: Partial<CardTransform>;
    stack?: StackSpec | null;
    reflection?: ReflectionSpec | null;
  };
}
