/** Message protocol between the main thread and the export worker. */
import type { FontDefinition } from "../render/fonts";
import type { Scene } from "../scene/types";
import type { ExportAsset } from "./export";
import type { ExportOptions } from "./formats";

export type WorkerRequest = {
  type: "export";
  id: number;
  scene: Scene;
  assets: ExportAsset[];
  options: ExportOptions;
  fonts: FontDefinition[];
};

export type WorkerResponse =
  | { type: "ready"; fonts: boolean; offscreen: boolean }
  | {
      type: "result";
      id: number;
      blob: Blob;
      width: number;
      height: number;
      mime: string;
      renderMs: number;
      encodeMs: number;
    }
  | { type: "error"; id: number; message: string };
