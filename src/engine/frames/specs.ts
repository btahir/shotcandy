/**
 * Built-in frame specs, read from the design team's single source of truth,
 * `brand/frames/frames.json` (documented in docs/design/frames/frames.md). All
 * frames are original vector drawings, not vendor artwork. Editing the JSON
 * restyles the frames; a schema change there fails the typecheck here.
 */
import frames from "../../../brand/frames/frames.json";
import type {
  BrowserSpec,
  CanvasFrameSpec,
  DeviceSpec,
  FrameSpec,
  LaptopSpec,
  WindowSpec,
} from "./types";

type Side = "left" | "right" | "top";
const buttons = (list: { side: string; from: number; to: number }[]) =>
  list.map((b) => ({ side: b.side as Side, from: b.from, to: b.to }));

export const MACOS_WINDOW: WindowSpec = {
  kind: "window",
  id: "macos",
  label: "macOS window",
  barHeight: frames.macos.barHeight,
  hairline: frames.macos.hairline,
  trafficLights: frames.macos.trafficLights,
  title: frames.macos.title,
  themes: frames.macos.themes,
};

export const BROWSER_WINDOW: BrowserSpec = {
  kind: "browser",
  id: "browser",
  label: "Browser window",
  barHeight: frames.browser.barHeight,
  hairline: frames.browser.hairline,
  trafficLights: frames.browser.trafficLights,
  nav: frames.browser.nav,
  address: frames.browser.address,
  themes: frames.browser.themes,
};

export const PHONE: DeviceSpec = {
  kind: "device",
  id: "phone",
  label: "Phone",
  unit: "short",
  bezel: frames.phone.bezel,
  rim: frames.phone.rim,
  screenRadius: frames.phone.screenRadius,
  buttonProtrusion: frames.phone.buttonProtrusion,
  padAllSides: false,
  camera: {
    placement: frames.phone.camera.placement as "screen",
    diameter: frames.phone.camera.diameter,
    offset: frames.phone.camera.offset,
  },
  buttons: buttons(frames.phone.buttons),
  smoothing: 0,
  aspect: { min: 1.9, max: 2.4 },
  fullBleed: { min: 1.8, max: 2.5 },
  themes: frames.phone.themes,
};

export const TABLET: DeviceSpec = {
  kind: "device",
  id: "tablet",
  label: "Tablet",
  unit: "short",
  bezel: frames.tablet.bezel,
  rim: frames.tablet.rim,
  screenRadius: frames.tablet.screenRadius,
  buttonProtrusion: frames.tablet.buttonProtrusion,
  padAllSides: true,
  camera: {
    placement: frames.tablet.camera.placement as "bezel",
    diameter: frames.tablet.camera.diameter,
  },
  buttons: buttons(frames.tablet.buttons),
  smoothing: 0,
  aspect: { min: 1.25, max: 1.6 },
  themes: frames.tablet.themes,
};

export const LAPTOP: LaptopSpec = {
  kind: "laptop",
  id: "laptop",
  label: "Laptop",
  bezelSide: frames.laptop.bezelSide,
  bezelTop: frames.laptop.bezelTop,
  bezelBottom: frames.laptop.bezelBottom,
  rim: frames.laptop.rim,
  lidRadiusTop: frames.laptop.lidRadiusTop,
  lidRadiusBottom: frames.laptop.lidRadiusBottom,
  screenRadiusTop: frames.laptop.screenRadiusTop,
  camera: frames.laptop.camera,
  hinge: frames.laptop.hinge,
  deck: frames.laptop.deck,
  aspect: { min: 1.45, max: 1.78 },
  themes: frames.laptop.themes,
};

export const CANVAS_FRAME: CanvasFrameSpec = {
  kind: "canvas",
  id: "canvas",
  label: "Design canvas",
  labelSize: frames.canvas.labelSize,
  labelGap: frames.canvas.labelGap,
  stroke: frames.canvas.stroke,
  handle: frames.canvas.handle,
  handleStroke: frames.canvas.handleStroke,
  tag: frames.canvas.tag,
  themes: frames.canvas.themes,
};

export const BUILTIN_FRAMES: readonly FrameSpec[] = [
  MACOS_WINDOW,
  BROWSER_WINDOW,
  PHONE,
  TABLET,
  LAPTOP,
  CANVAS_FRAME,
];
