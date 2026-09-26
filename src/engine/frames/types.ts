/**
 * Frame system types.
 *
 * Frames are data: a FrameSpec says *what* a frame looks like (proportions and
 * colours per theme); a FrameKind knows *how* to lay out and draw one family of
 * frames (window, browser, device, laptop). The design team can refine or add
 * frames by editing specs.ts without touching drawing code, and new families
 * can be registered at runtime.
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
  /** Bounding box of the whole frame (including buttons, laptop base, etc.). */
  size: Size;
  /** Where the screen/content plate sits. */
  screen: Rect;
  /** Clip radii for the screen area. */
  screenRadii: Radii;
  screenSmoothing: number;
  /** Silhouette used for shadows and the border ring. */
  outline: Shape[];
}

export interface FrameLayoutInput {
  /** Size of the plate (content + inset) in card units. */
  plate: Size;
  /** The user's corner radius (cu); window-like frames use it for their corners. */
  radius: number;
  smoothing: number;
}

export interface FrameDrawInput {
  ref: FrameRef;
  geometry: FrameGeometry;
  /** Card units -> the context's current units is already applied by the caller. */
  fontFamily: string;
}

// ----------------------------------------------------------------------------
// Specs per family (all lengths are in card units unless stated otherwise)
// ----------------------------------------------------------------------------

export interface WindowPalette {
  bar: string;
  barBottom: string;
  separator: string;
  body: string;
  outline: string;
  title: string;
  controls: [string, string, string];
  controlBorder: string;
}

export interface WindowSpec {
  kind: "window";
  id: string;
  label: string;
  /** Title bar height (cu). */
  barHeight: number;
  controlSize: number;
  controlGap: number;
  controlInset: number;
  titleSize: number;
  outlineWidth: number;
  themes: Record<FrameTheme, WindowPalette>;
}

export interface BrowserPalette extends WindowPalette {
  address: string;
  addressText: string;
  icon: string;
}

export interface BrowserSpec {
  kind: "browser";
  id: string;
  label: string;
  barHeight: number;
  controlSize: number;
  controlGap: number;
  controlInset: number;
  addressHeight: number;
  /** Address pill width as a fraction of the window width (0..1). */
  addressWidth: number;
  addressTextSize: number;
  outlineWidth: number;
  themes: Record<FrameTheme, BrowserPalette>;
}

export interface DevicePalette {
  body: string;
  bodyEdge: string;
  bezel: string;
  button: string;
  island: string;
  camera: string;
}

export interface DeviceButton {
  side: "left" | "right" | "top";
  /** Offset from the top (or left, for "top") of the body, as a fraction of body height (width). */
  at: number;
  /** Length as a fraction of body height (width). */
  length: number;
}

/** Phones and tablets. Lengths are fractions of the screen's shorter side. */
export interface DeviceSpec {
  kind: "device";
  id: string;
  label: string;
  /** Visible body rim outside the bezel. */
  rim: number;
  /** Black bezel between rim and screen. */
  bezel: number;
  /** Screen corner radius. */
  screenRadius: number;
  smoothing: number;
  island: { width: number; height: number; top: number } | null;
  camera: { size: number } | null;
  buttons: DeviceButton[];
  buttonThickness: number;
  themes: Record<FrameTheme, DevicePalette>;
}

export interface LaptopPalette extends DevicePalette {
  base: string;
  baseEdge: string;
  baseShadow: string;
}

/** Laptops. Lengths are fractions of the screen's width. */
export interface LaptopSpec {
  kind: "laptop";
  id: string;
  label: string;
  bezelTop: number;
  bezelSide: number;
  bezelBottom: number;
  lidRadius: number;
  screenRadius: number;
  /** Base (keyboard deck) height as a fraction of screen width. */
  baseHeight: number;
  /** How far the base extends past the lid on each side. */
  baseOverhang: number;
  notchWidth: number;
  notchDepth: number;
  camera: { size: number } | null;
  themes: Record<FrameTheme, LaptopPalette>;
}

export type FrameSpec = WindowSpec | BrowserSpec | DeviceSpec | LaptopSpec;

/** Implementation of one frame family. */
export interface FrameKind<S extends FrameSpec = FrameSpec> {
  kind: S["kind"];
  layout(spec: S, input: FrameLayoutInput): FrameGeometry;
  /** Draw everything behind the content (body, bars, bezels). */
  drawBack(ctx: Ctx2D, spec: S, input: FrameDrawInput): void;
  /** Draw everything on top of the content (islands, glass, cameras). */
  drawFront?(ctx: Ctx2D, spec: S, input: FrameDrawInput): void;
}
