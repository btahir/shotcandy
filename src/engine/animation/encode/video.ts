/**
 * Video encoding with WebCodecs: H.264 in MP4 (mp4-muxer, MIT) or VP9/VP8 in
 * WebM (webm-muxer, MIT). Frames get exact timestamps (n / fps), so the file's
 * duration and frame rate match the timeline regardless of how long each
 * frame took to render.
 */
import { ArrayBufferTarget as Mp4Target, Muxer as Mp4Muxer } from "mp4-muxer";
import { ArrayBufferTarget as WebmTarget, Muxer as WebmMuxer } from "webm-muxer";
import type { CanvasLike } from "../../render/env";

export type VideoFormat = "mp4" | "webm";

export interface VideoOptions {
  format: VideoFormat;
  width: number;
  height: number;
  fps: number;
  /** Bits per second. */
  bitrate: number;
}

export function supportsVideoEncoding(): boolean {
  return typeof VideoEncoder !== "undefined" && typeof VideoFrame !== "undefined";
}

/** H.264 levels: [level_idc, max macroblocks per second, max frame size in MBs]. */
const AVC_LEVELS: [number, number, number][] = [
  [0x1f, 108_000, 3_600],
  [0x20, 216_000, 5_120],
  [0x28, 245_760, 8_192],
  [0x2a, 522_240, 8_704],
  [0x32, 589_824, 22_080],
  [0x33, 983_040, 36_864],
  [0x34, 2_073_600, 36_864],
];

/** Candidate codec strings, most preferred first. */
export function codecCandidates(format: VideoFormat, w: number, h: number, fps: number): string[] {
  if (format === "webm") {
    const big = w * h > 2_228_224;
    const mid = w * h > 983_040;
    return [
      ...(big ? ["vp09.00.51.08"] : mid ? ["vp09.00.41.08", "vp09.00.51.08"] : ["vp09.00.31.08"]),
      "vp09.00.41.08",
      "vp8",
    ];
  }
  const mbs = Math.ceil(w / 16) * Math.ceil(h / 16);
  const levels = AVC_LEVELS.filter(([, perSec, frame]) => mbs <= frame && mbs * fps <= perSec).map(
    ([l]) => l.toString(16).padStart(2, "0"),
  );
  const list: string[] = [];
  for (const profile of ["6400", "4d00", "4200"]) {
    for (const level of levels.slice(0, 3)) list.push(`avc1.${profile}${level}`);
  }
  return list.length ? list : ["avc1.640034", "avc1.4d0034"];
}

/** First codec string this browser can encode at the given size, or null. */
export async function pickCodec(o: VideoOptions): Promise<string | null> {
  if (!supportsVideoEncoding()) return null;
  for (const codec of codecCandidates(o.format, o.width, o.height, o.fps)) {
    try {
      const r = await VideoEncoder.isConfigSupported({
        codec,
        width: o.width,
        height: o.height,
        bitrate: o.bitrate,
        framerate: o.fps,
        ...(codec.startsWith("avc1") ? { avc: { format: "avc" as const } } : {}),
      });
      if (r.supported) return codec;
    } catch {
      /* try the next */
    }
  }
  return null;
}

export class VideoWriter {
  private encoder: VideoEncoder | null = null;
  private muxer: Mp4Muxer<Mp4Target> | WebmMuxer<WebmTarget> | null = null;
  private error: Error | null = null;
  private n = 0;
  readonly mime: string;

  private constructor(
    private readonly o: VideoOptions,
    readonly codec: string,
  ) {
    this.mime = o.format === "mp4" ? "video/mp4" : "video/webm";
  }

  static async create(o: VideoOptions): Promise<VideoWriter> {
    if (o.width % 2 || o.height % 2) throw new Error("Video dimensions must be even");
    const codec = await pickCodec(o);
    if (!codec) {
      throw new Error(
        o.format === "mp4"
          ? "This browser can't encode H.264 video. Try WebM or GIF."
          : "This browser can't encode WebM video. Try MP4 or GIF.",
      );
    }
    const w = new VideoWriter(o, codec);
    w.start();
    return w;
  }

  private start(): void {
    const { width, height, fps } = this.o;
    const avc = this.codec.startsWith("avc1");
    if (this.o.format === "mp4") {
      this.muxer = new Mp4Muxer({
        target: new Mp4Target(),
        video: { codec: avc ? "avc" : "vp9", width, height, frameRate: fps },
        fastStart: "in-memory",
        firstTimestampBehavior: "offset",
      });
    } else {
      this.muxer = new WebmMuxer({
        target: new WebmTarget(),
        video: {
          codec: this.codec.startsWith("vp8") ? "V_VP8" : "V_VP9",
          width,
          height,
          frameRate: fps,
        },
        firstTimestampBehavior: "offset",
      });
    }
    const muxer = this.muxer;
    this.encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => {
        this.error = e instanceof Error ? e : new Error(String(e));
      },
    });
    this.encoder.configure({
      codec: this.codec,
      width,
      height,
      bitrate: this.o.bitrate,
      framerate: fps,
      latencyMode: "quality",
      ...(avc ? { avc: { format: "avc" as const } } : {}),
    });
  }

  /** Encode one frame from a canvas (the canvas can be reused right after). */
  async addFrame(canvas: CanvasLike): Promise<void> {
    if (this.error) throw this.error;
    const enc = this.encoder!;
    // Back-pressure: keep the encoder queue short so memory stays flat.
    while (enc.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 4));
    const fps = this.o.fps;
    const frame = new VideoFrame(canvas as OffscreenCanvas, {
      timestamp: Math.round((this.n * 1_000_000) / fps),
      duration: Math.round(1_000_000 / fps),
    });
    try {
      enc.encode(frame, { keyFrame: this.n % Math.max(1, Math.round(fps * 2)) === 0 });
    } finally {
      frame.close();
    }
    this.n++;
  }

  async finish(): Promise<Uint8Array> {
    const enc = this.encoder!;
    await enc.flush();
    if (this.error) throw this.error;
    enc.close();
    this.muxer!.finalize();
    const buf = (this.muxer!.target as Mp4Target | WebmTarget).buffer;
    return new Uint8Array(buf);
  }

  abort(): void {
    try {
      if (this.encoder && this.encoder.state !== "closed") this.encoder.close();
    } catch {
      /* ignore */
    }
  }
}

// Bitrate per quality level lives with the plan (no encoder imports there).
export { videoBitrate } from "../plan";
