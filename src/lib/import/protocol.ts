import type { ImportErrorCode, Palette } from "@/engine";

export interface DecodeRequest {
  job: number;
  blob: Blob;
  /** Longest side of the small thumbnail kept for every image. */
  thumbSide: number;
  /** Also return the editing proxy (the image on stage and its neighbours). */
  proxy: boolean;
  /** Skip the palette (re-decoding an image already imported). */
  palette: boolean;
}

export type DecodeResponse =
  | {
      job: number;
      ok: true;
      id: string;
      mime: string;
      width: number;
      height: number;
      palette: Palette | null;
      thumb: ImageBitmap;
      proxy: ImageBitmap | null;
    }
  | { job: number; ok: false; code: ImportErrorCode | null; message: string };
