/**
 * Code styles: a code theme paired with the background it was tuned for,
 * plus card settings that suit a code window (no device frame, soft corners,
 * a deep shadow). Applying one sets the theme on the content and the patch on
 * the style.
 */
import { getBackgroundPreset } from "../presets/backgrounds";
import type { StylePatch } from "../scene/types";
import { CODE_THEMES } from "./themes";

export interface CodeStyle {
  id: string;
  name: string;
  theme: string;
  patch: StylePatch;
}

export function codeStylePatch(backgroundId: string): StylePatch {
  const bg = getBackgroundPreset(backgroundId);
  return {
    canvas: { padding: 72 },
    background: bg
      ? { fill: bg.fill, grain: { amount: bg.grain.amount } }
      : { fill: { kind: "solid", color: "#fff1e6" } },
    card: {
      frame: { id: "none" },
      radius: 16,
      smoothing: 0.6,
      border: { width: 0 },
      inset: { width: 0 },
      shadow: { preset: "deep", strength: 1 },
      tilt: { rotateX: 0, rotateY: 0, rotateZ: 0 },
      transform: { scale: 1, offsetX: 0, offsetY: 0 },
    },
  };
}

export const CODE_STYLES: CodeStyle[] = CODE_THEMES.map((t) => ({
  id: `code-${t.id}`,
  name: t.label,
  theme: t.id,
  patch: codeStylePatch(t.background),
}));

export function getCodeStyle(id: string): CodeStyle | undefined {
  return CODE_STYLES.find((s) => s.id === id);
}

/** A small, original TypeScript sample for a fresh code image. */
export const SAMPLE_CODE = `// Sweeten any screenshot in one step
import { renderScene, type Scene } from "@shotcandy/engine";

export async function sweeten(shot: Blob): Promise<Blob> {
  const scene: Scene = {
    background: { kind: "mesh", palette: "sherbet" },
    card: { radius: 18, shadow: "float" },
  };
  return renderScene(scene, shot, { scale: 2 });
}
`;
