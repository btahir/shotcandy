import type { FontDefinition, Palette, Scene } from "@/engine";

export type ThumbRequest =
  | { type: "init"; fonts: FontDefinition[] }
  | {
      type: "asset";
      id: string;
      bitmap: ImageBitmap;
      width: number;
      height: number;
      palette?: Palette;
    }
  | { type: "drop-asset"; id: string }
  | { type: "render"; job: number; scene: Scene; scale: number };

export type ThumbResponse =
  | { type: "ready"; offscreen: boolean }
  | { type: "done"; job: number; bitmap: ImageBitmap }
  | { type: "error"; job: number; message: string };
