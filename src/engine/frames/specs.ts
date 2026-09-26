/**
 * Built-in frame specs. Pure data: the design team can tune every proportion
 * and colour here (or register new specs at runtime) without touching drawing
 * code. All frames are original vector drawings, not vendor artwork.
 *
 * Units: window/browser lengths are card units (the screenshot's longer side is
 * 1000 cu). Device lengths are fractions of the screen's shorter side. Laptop
 * lengths are fractions of the screen width.
 */
import type { BrowserSpec, DeviceSpec, FrameSpec, LaptopSpec, WindowSpec } from "./types";

const TRAFFIC: [string, string, string] = ["#ff5f57", "#febc2e", "#28c840"];

export const MACOS_WINDOW: WindowSpec = {
  kind: "window",
  id: "macos",
  label: "macOS window",
  barHeight: 40,
  controlSize: 13,
  controlGap: 9,
  controlInset: 17,
  titleSize: 14,
  outlineWidth: 1.2,
  themes: {
    light: {
      bar: "#f7f7f8",
      barBottom: "#ededef",
      separator: "#00000017",
      body: "#ffffff",
      outline: "#0000001f",
      title: "#4a4a4f",
      controls: TRAFFIC,
      controlBorder: "#0000001a",
    },
    dark: {
      bar: "#323236",
      barBottom: "#2a2a2d",
      separator: "#000000b3",
      body: "#1e1e20",
      outline: "#ffffff1f",
      title: "#c9c9ce",
      controls: TRAFFIC,
      controlBorder: "#0000004d",
    },
  },
};

export const BROWSER_WINDOW: BrowserSpec = {
  kind: "browser",
  id: "browser",
  label: "Browser window",
  barHeight: 52,
  controlSize: 13,
  controlGap: 9,
  controlInset: 18,
  addressHeight: 30,
  addressWidth: 0.5,
  addressTextSize: 13,
  outlineWidth: 1.2,
  themes: {
    light: {
      bar: "#f4f4f6",
      barBottom: "#ececef",
      separator: "#00000017",
      body: "#ffffff",
      outline: "#0000001f",
      title: "#4a4a4f",
      controls: TRAFFIC,
      controlBorder: "#0000001a",
      address: "#ffffff",
      addressText: "#55555c",
      icon: "#8e8e95",
    },
    dark: {
      bar: "#2c2c30",
      barBottom: "#252528",
      separator: "#000000b3",
      body: "#1b1b1d",
      outline: "#ffffff1f",
      title: "#c9c9ce",
      controls: TRAFFIC,
      controlBorder: "#0000004d",
      address: "#1c1c1f",
      addressText: "#b8b8bf",
      icon: "#7c7c84",
    },
  },
};

export const PHONE: DeviceSpec = {
  kind: "device",
  id: "phone",
  label: "Phone",
  rim: 0.012,
  bezel: 0.034,
  screenRadius: 0.13,
  smoothing: 0.6,
  island: { width: 0.3, height: 0.085, top: 0.03 },
  camera: null,
  buttons: [
    { side: "left", at: 0.17, length: 0.05 },
    { side: "left", at: 0.25, length: 0.09 },
    { side: "left", at: 0.36, length: 0.09 },
    { side: "right", at: 0.27, length: 0.14 },
  ],
  buttonThickness: 0.009,
  themes: {
    light: {
      body: "#e4e4e8",
      bodyEdge: "#b8b8bf",
      bezel: "#08080a",
      button: "#cfcfd5",
      island: "#000000",
      camera: "#0d0d10",
    },
    dark: {
      body: "#26262a",
      bodyEdge: "#4a4a50",
      bezel: "#040405",
      button: "#303035",
      island: "#000000",
      camera: "#0d0d10",
    },
  },
};

export const TABLET: DeviceSpec = {
  kind: "device",
  id: "tablet",
  label: "Tablet",
  rim: 0.008,
  bezel: 0.035,
  screenRadius: 0.035,
  smoothing: 0.6,
  island: null,
  camera: { size: 0.011 },
  buttons: [
    { side: "top", at: 0.8, length: 0.08 },
    { side: "right", at: 0.08, length: 0.06 },
    { side: "right", at: 0.16, length: 0.06 },
  ],
  buttonThickness: 0.005,
  themes: {
    light: {
      body: "#e4e4e8",
      bodyEdge: "#b8b8bf",
      bezel: "#08080a",
      button: "#cfcfd5",
      island: "#000000",
      camera: "#1a1a20",
    },
    dark: {
      body: "#2a2a2e",
      bodyEdge: "#4a4a50",
      bezel: "#040405",
      button: "#34343a",
      island: "#000000",
      camera: "#1a1a20",
    },
  },
};

export const LAPTOP: LaptopSpec = {
  kind: "laptop",
  id: "laptop",
  label: "Laptop",
  bezelTop: 0.032,
  bezelSide: 0.022,
  bezelBottom: 0.03,
  lidRadius: 0.03,
  screenRadius: 0.012,
  baseHeight: 0.028,
  baseOverhang: 0.075,
  notchWidth: 0.14,
  notchDepth: 0.008,
  camera: { size: 0.006 },
  themes: {
    light: {
      body: "#d8d9dc",
      bodyEdge: "#b3b4b8",
      bezel: "#0a0a0b",
      button: "#c8c9cc",
      island: "#000000",
      camera: "#1c1c20",
      base: "#e2e3e6",
      baseEdge: "#a9aaae",
      baseShadow: "#8c8d91",
    },
    dark: {
      body: "#2e2f32",
      bodyEdge: "#4b4c50",
      bezel: "#070708",
      button: "#3a3b3e",
      island: "#000000",
      camera: "#1c1c20",
      base: "#3b3c3f",
      baseEdge: "#222325",
      baseShadow: "#161618",
    },
  },
};

export const BUILTIN_FRAMES: readonly FrameSpec[] = [
  MACOS_WINDOW,
  BROWSER_WINDOW,
  PHONE,
  TABLET,
  LAPTOP,
];
