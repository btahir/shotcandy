/**
 * Frame system types.
 *
 * Frames are data: a FrameSpec says *what* a frame looks like (proportions and
 * colours per theme) and mirrors `brand/frames/frames.json`, the design team's
 * single source of truth. A FrameKind knows *how* to lay out and draw one
 * family of frames (window, browser, device, laptop). Specs can be refined or
 * added without touching drawing code, and new families can be registered.
 */
import type { Radii, Rect, Size } from "../math/geometry";
import type { Ctx2D } from "../render/env";
import type { FrameRef, FrameTheme } from "../scene/types";

/** A rounded-rect silhouette in card units. */
export interface Shape {
  rect: Rect;
  radii: Radii;
  smoothing: number;
}

export interface FrameGeometry {
  /** Bounding box of the whole frame (including buttons, laptop deck, etc.). */
  size: Size;
  /** Where the screen/content plate sits. */
  screen: Rect;
  /** Clip radii for the screen area. */
  screenRadii: Radii;
  screenSmoothing: number;
  /** Silhouette used for shadows and the border ring (buttons excluded). */
  outline: Shape[];
}

export interface FrameLayoutInput {
  /** Size of the plate (content + inset) in card units. */
  plate: Size;
  /** Size of the content alone, in card units. */
  content: Size;
  /** The user's corner radius (cu); window-like frames use it for their corners. */
  radius: number;
  smoothing: number;
}

export interface FrameDrawInput {
  ref: FrameRef;
  geometry: FrameGeometry;
  /** Size of the content alone, in card units. */
  content: Size;
  /** Length of one output pixel at 1x, in card units (for hairlines). */
  onePx: number;
  fontFamily: string;
}

// ----------------------------------------------------------------------------
// Specs per family (mirroring brand/frames/frames.json)
// ----------------------------------------------------------------------------

export interface LightColor {
  fill: string;
  stroke: string;
}

export interface TrafficLightsSpec {
  /** All in chrome units (ch). */
  diameter: number;
  spacing: number;
  firstCenterX: number;
  stroke: number;
  colors: LightColor[];
  mono: LightColor[];
}

export interface WindowTheme {
  barTop: string;
  barBottom: string;
  separator: string;
  border: string;
  title: string;
  topHighlight: string | null;
}

/**
 * macOS-style window. Lengths are chrome units:
 * 1 ch = min(1, 1.6 * contentWidth / contentLongSide) cu.
 */
export interface WindowSpec {
  kind: "window";
  id: string;
  label: string;
  barHeight: number;
  hairline: number;
  trafficLights: TrafficLightsSpec;
  title: { size: number; weight: number; maxWidthFraction: number };
  themes: Record<FrameTheme, WindowTheme>;
}

export interface BrowserTheme {
  barTop: string;
  barBottom: string;
  separator: string;
  border: string;
  field: string;
  fieldBorder: string;
  url: string;
  lock: string;
  nav: string;
  topHighlight: string | null;
}

export interface BrowserSpec {
  kind: "browser";
  id: string;
  label: string;
  barHeight: number;
  hairline: number;
  trafficLights: TrafficLightsSpec;
  nav: { backX: number; forwardX: number; size: number; stroke: number };
  address: {
    widthFraction: number;
    maxWidth: number;
    height: number;
    radius: number;
    textSize: number;
    lockSize: number;
    lockGap: number;
  };
  themes: Record<FrameTheme, BrowserTheme>;
}

export interface DeviceTheme {
  /** Horizontal rim gradient stops (evenly spaced). */
  rim: string[];
  rimHighlight: string;
  bezel: string;
  button: string;
  camera: string;
  lens: string;
}

export interface DeviceButton {
  side: "left" | "right" | "top";
  /** Fractions of body height (left/right) or body width (top). */
  from: number;
  to: number;
}

/** Phones and tablets. Lengths are fractions of the unit side (see `unit`). */
export interface DeviceSpec {
  kind: "device";
  id: string;
  label: string;
  /** "width": fractions of the screen width (phone); "short": of the shorter side (tablet). */
  unit: "width" | "short";
  bezel: number;
  rim: number;
  screenRadius: number;
  buttonProtrusion: number;
  /** Reserve button room on all four sides (true) or only left/right (false). */
  padAllSides: boolean;
  camera: { placement: "screen" | "bezel"; diameter: number; offset?: number };
  buttons: DeviceButton[];
  smoothing: number;
  themes: Record<FrameTheme, DeviceTheme>;
}

export interface LaptopTheme {
  rim: string;
  bezel: string;
  camera: string;
  hinge: string;
  deckTop: string;
  deckBottom: string;
  deckHighlight: string;
  notch: string;
}

/** Laptops. Lengths are fractions of the screen width. */
export interface LaptopSpec {
  kind: "laptop";
  id: string;
  label: string;
  bezelSide: number;
  bezelTop: number;
  bezelBottom: number;
  rim: number;
  lidRadiusTop: number;
  lidRadiusBottom: number;
  screenRadiusTop: number;
  camera: { diameter: number };
  hinge: { widthRatio: number; height: number };
  deck: {
    widthRatio: number;
    height: number;
    /** Fraction of deck height. */
    bottomRadius: number;
    notchWidth: number;
    /** Fraction of deck height. */
    notchDepth: number;
  };
  themes: Record<FrameTheme, LaptopTheme>;
}

export type FrameSpec = WindowSpec | BrowserSpec | DeviceSpec | LaptopSpec;

/** Implementation of one frame family. */
export interface FrameKind<S extends FrameSpec = FrameSpec> {
  kind: S["kind"];
  /** Whether the card inset plate applies inside this frame (devices: no). */
  supportsInset: boolean;
  /** Whether card.radius shapes this frame's corners (windows: yes). */
  usesCardRadius: boolean;
  layout(spec: S, input: FrameLayoutInput): FrameGeometry;
  /** Draw everything behind the content (body, bars, bezels). */
  drawBack(ctx: Ctx2D, spec: S, input: FrameDrawInput): void;
  /** Draw everything on top of the content (cameras, hairline borders). */
  drawFront?(ctx: Ctx2D, spec: S, input: FrameDrawInput): void;
}
