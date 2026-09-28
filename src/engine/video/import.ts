/**
 * Opening a screen recording: probe the container with Mediabunny (MPL-2.0),
 * check this browser can decode it, and grab the first frame as a poster.
 *
 * The result is an ImportedImage like any screenshot (the poster is its
 * editing proxy, so layout, thumbnails, palettes and styles work unchanged)
 * plus the recording's facts. The original file is kept for playback and
 * export. Mediabunny is imported dynamically: it only loads for recordings.
 */
import { DEFAULT_PROXY_SIDE, type ImportedImage, paletteFromImage } from "../input/import";
import { ImportError, MIME_FOR_VIDEO, sniffVideoKind } from "../input/input";
import { type RenderEnvironment, defaultEnvironment, get2d } from "../render/env";
import { canvasToBlob } from "../export/formats";
import { MAX_CLIP_SECONDS, MAX_VIDEO_BYTES } from "./clip";
import { videoAssetId } from "./id";

export interface VideoInfo {
  /** Seconds. */
  duration: number;
  /** Mediabunny codec ids, e.g. "avc", "hevc", "vp9"; "aac", "opus". */
  videoCodec: string | null;
  audioCodec: string | null;
  /** Average frame rate, when the file says. */
  fps: number | null;
}

export interface VideoImportOptions {
  maxProxySide?: number;
  env?: RenderEnvironment;
}

const CODEC_NAMES: Record<string, string> = {
  hevc: "HEVC (H.265)",
  av1: "AV1",
  vp9: "VP9",
  vp8: "VP8",
  avc: "H.264",
};

export async function importVideo(
  input: Blob,
  opts: VideoImportOptions = {},
): Promise<ImportedImage> {
  if (input.size === 0) throw new ImportError("empty", "The file is empty.");
  if (input.size > MAX_VIDEO_BYTES) {
    throw new ImportError(
      "too-large",
      `This recording is ${Math.round(input.size / 1024 / 1024)} MB; Shotcandy opens recordings up to 1 GB. Trim it or export it smaller first.`,
    );
  }
  const head = new Uint8Array(await input.slice(0, 64).arrayBuffer());
  const kind = sniffVideoKind(head);
  if (!kind) {
    throw new ImportError(
      "unsupported-format",
      "Unsupported video format. Use an MP4, MOV or WebM recording.",
    );
  }
  const mime = MIME_FOR_VIDEO[kind];
  const blob = input.type === mime ? input : new Blob([input], { type: mime });
  const env = opts.env ?? defaultEnvironment();
  const { ALL_FORMATS, BlobSource, CanvasSink, Input } = await import("mediabunny");
  const media = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  try {
    const track = await media.getPrimaryVideoTrack().catch(() => null);
    if (!track) {
      throw new ImportError("decode-failed", "This file has no video in it, or it is damaged.");
    }
    const codec = track.codec;
    if (!(await track.canDecode())) {
      const name = (codec && CODEC_NAMES[codec]) ?? "this video format";
      throw new ImportError(
        "video-codec",
        `This browser can't play ${name}. Re-save the recording as an H.264 MP4 and try again${codec === "hevc" ? ", or open it in Safari" : ""}.`,
      );
    }
    const width = await track.getDisplayWidth();
    const height = await track.getDisplayHeight();
    if (!width || !height) throw new ImportError("decode-failed", "This recording has no picture.");
    const duration = await media.computeDuration();
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new ImportError("decode-failed", "This recording has no length. It may be damaged.");
    }
    if (duration > MAX_CLIP_SECONDS + 0.5) {
      throw new ImportError(
        "too-long",
        `This recording is ${Math.round(duration / 60)} minutes long; Shotcandy opens recordings up to ${MAX_CLIP_SECONDS / 60} minutes. Trim it first.`,
      );
    }
    const audio = await media.getPrimaryAudioTrack().catch(() => null);
    const stats = await track.computePacketStats(90).catch(() => null);

    // Poster: the first frame, at editing-proxy size.
    const maxSide = opts.maxProxySide ?? DEFAULT_PROXY_SIDE;
    const s = Math.min(1, maxSide / Math.max(width, height));
    const pw = Math.max(1, Math.round(width * s));
    const ph = Math.max(1, Math.round(height * s));
    const sink = new CanvasSink(track, { width: pw, height: ph, fit: "fill", poolSize: 0 });
    const first = await track.getFirstTimestamp();
    const wrapped = await sink.getCanvas(first);
    if (!wrapped)
      throw new ImportError(
        "decode-failed",
        "The first frame of this recording could not be read.",
      );
    const poster = env.createCanvas(pw, ph);
    get2d(poster).drawImage(wrapped.canvas as CanvasImageSource, 0, 0, pw, ph);
    const palette = paletteFromImage(env, poster, pw, ph);
    const posterBlob = await canvasToBlob(poster, "image/png");

    return {
      id: await videoAssetId(blob),
      blob,
      mime,
      width,
      height,
      proxy: poster,
      proxyWidth: pw,
      proxyHeight: ph,
      original: null,
      palette,
      video: {
        poster: posterBlob,
        info: {
          duration,
          videoCodec: codec ?? null,
          audioCodec: audio?.codec ?? null,
          fps: stats && stats.averagePacketRate > 0 ? stats.averagePacketRate : null,
        },
      },
    };
  } catch (e) {
    if (e instanceof ImportError) throw e;
    throw new ImportError(
      "decode-failed",
      "This recording could not be opened. It may be damaged.",
    );
  } finally {
    media.dispose();
  }
}
