/** Message protocol between the page and the animation worker. */
import type { FontDefinition } from "../render/fonts";
import type { Scene } from "../scene/types";
import type { ExportAsset } from "../export/export";
import type { AnimationExportOptions, AnimationExportResult, AnimationProgress } from "./plan";

export type AnimationWorkerRequest = {
  type: "animate";
  scene: Scene;
  assets: ExportAsset[];
  options: AnimationExportOptions;
  fonts: FontDefinition[];
};

export type AnimationWorkerResponse =
  | { type: "ready"; fonts: boolean; offscreen: boolean; video: boolean }
  | { type: "progress"; progress: AnimationProgress }
  | { type: "result"; result: AnimationExportResult }
  | { type: "error"; message: string };
