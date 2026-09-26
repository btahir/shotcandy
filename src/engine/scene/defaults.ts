import {
  type Annotation,
  type ArrowAnnotation,
  type BackgroundSpec,
  type CardStyle,
  type RectAnnotation,
  type RedactAnnotation,
  type Scene,
  SCENE_VERSION,
  type TextAnnotation,
} from "./types";

export const DEFAULT_BACKGROUND: BackgroundSpec = {
  fill: {
    kind: "linear",
    angle: 135,
    stops: [
      { offset: 0, color: "#ffb38a" },
      { offset: 1, color: "#ff6f91" },
    ],
  },
  grain: { amount: 0, size: 1, seed: 1 },
};

export const DEFAULT_CARD: CardStyle = {
  frame: { id: "none", theme: "light", title: "", url: "" },
  radius: 16,
  smoothing: 0.6,
  border: { width: 0, color: "#ffffff66" },
  inset: { width: 0, color: "auto" },
  shadow: { preset: "soft", strength: 1, color: "#000000" },
  tilt: { rotateX: 0, rotateY: 0, rotateZ: 0, perspective: 3 },
  transform: { scale: 1, offsetX: 0, offsetY: 0 },
};

/** A fresh scene with sensible defaults. `overrides` are shallow per section. */
export function createScene(overrides: Partial<Scene> = {}): Scene {
  return {
    version: SCENE_VERSION,
    canvas: { size: { kind: "auto" }, padding: 80 },
    background: structuredCloneSafe(DEFAULT_BACKGROUND),
    content: { kind: "image", assetId: null },
    card: structuredCloneSafe(DEFAULT_CARD),
    annotations: [],
    meta: { name: "shotcandy" },
    ...overrides,
  };
}

/** Default annotation of each kind, positioned in the middle of its anchor. */
export function createAnnotation(kind: "text", id: string): TextAnnotation;
export function createAnnotation(kind: "arrow", id: string): ArrowAnnotation;
export function createAnnotation(kind: "rect", id: string): RectAnnotation;
export function createAnnotation(kind: "redact", id: string): RedactAnnotation;
export function createAnnotation(kind: Annotation["kind"], id: string): Annotation;
export function createAnnotation(kind: Annotation["kind"], id: string): Annotation {
  switch (kind) {
    case "text":
      return {
        id,
        kind,
        anchor: "content",
        x: 0.5,
        y: 0.5,
        text: "Hello",
        font: "sans",
        size: 48,
        weight: 700,
        color: "#111111",
        align: "center",
        background: null,
      };
    case "arrow":
      return {
        id,
        kind,
        anchor: "content",
        x1: 0.3,
        y1: 0.3,
        x2: 0.6,
        y2: 0.55,
        color: "#ff3b30",
        width: 8,
        curve: 0,
        head: "triangle",
      };
    case "rect":
      return {
        id,
        kind,
        anchor: "content",
        x: 0.35,
        y: 0.35,
        w: 0.3,
        h: 0.2,
        style: "outline",
        color: "#ff3b30",
        width: 6,
        radius: 8,
      };
    case "redact":
      return {
        id,
        kind,
        anchor: "content",
        x: 0.35,
        y: 0.4,
        w: 0.3,
        h: 0.1,
        mode: "blur",
        strength: 12,
      };
  }
}

/** structuredClone is missing in some older runtimes; scenes are plain JSON. */
export function structuredCloneSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
