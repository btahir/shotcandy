/**
 * Live preview of a screen recording: a hidden <video> element plays the
 * original file (with its sound), and each stage render copies the current
 * frame into a small canvas that stands in for the screenshot
 * (withVideoFrame). Exports never use this; they decode frames exactly.
 */
import type { AssetImage } from "@/engine";

/** Longest side of preview frames (the stage never shows more). */
const MAX_PREVIEW_SIDE = 1920;

export interface PreviewFrame extends AssetImage {
  /** Changes whenever the pixels do, so render caches key on it. */
  key: string;
}

export class VideoPreview {
  private el: HTMLVideoElement | null = null;
  private url: string | null = null;
  private assetId: string | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private drawnAt = -1;
  private seq = 0;
  private dirty = true;
  private wantPlaying = false;
  private error = false;

  constructor(private readonly onFrame: () => void) {}

  /** The recording being previewed, if any. */
  get current(): string | null {
    return this.assetId;
  }

  /** Current time in seconds of the source file. */
  get time(): number {
    return this.el?.currentTime ?? 0;
  }

  get ended(): boolean {
    return !!this.el?.ended;
  }

  get paused(): boolean {
    return this.el?.paused ?? true;
  }

  /** The element can't play this file: the stage keeps the poster, the playhead its own clock. */
  get failed(): boolean {
    return this.error;
  }

  /** Point the player at a recording (no-op when it already is). */
  attach(assetId: string, blob: Blob, width: number, height: number): void {
    if (this.assetId === assetId && this.el) return;
    this.detach();
    const el = document.createElement("video");
    el.muted = true;
    el.playsInline = true;
    el.preload = "auto";
    el.crossOrigin = "anonymous";
    // Some browsers refuse video/quicktime but play the same file as MP4.
    const typed = blob.type === "video/quicktime" ? new Blob([blob], { type: "video/mp4" }) : blob;
    this.url = URL.createObjectURL(typed);
    el.src = this.url;
    const redraw = () => {
      this.dirty = true;
      this.onFrame();
    };
    el.addEventListener("loadeddata", redraw);
    el.addEventListener("seeked", redraw);
    el.addEventListener("error", () => {
      if (this.el !== el) return; // a detached element emptying its source
      this.error = true;
      this.onFrame();
    });
    this.el = el;
    this.assetId = assetId;
    const k = Math.min(1, MAX_PREVIEW_SIDE / Math.max(width, height));
    this.canvas = document.createElement("canvas");
    this.canvas.width = Math.max(1, Math.round(width * k));
    this.canvas.height = Math.max(1, Math.round(height * k));
    this.drawnAt = -1;
    this.dirty = true;
    this.error = false;
  }

  detach(): void {
    if (this.el) {
      this.el.pause();
      this.el.removeAttribute("src");
      this.el.load();
    }
    if (this.url) URL.revokeObjectURL(this.url);
    this.el = null;
    this.url = null;
    this.assetId = null;
    this.canvas = null;
    this.wantPlaying = false;
  }

  /** The frame on screen now, or null until the recording has one. */
  frame(): PreviewFrame | null {
    const el = this.el;
    const c = this.canvas;
    if (!el || !c || this.error) return null;
    const last = { image: c, width: c.width, height: c.height, key: `p${this.seq}` };
    // Mid-seek the element has no current frame: keep showing the last one.
    if (el.readyState < 2) return this.drawnAt >= 0 ? last : null;
    if (this.dirty || el.currentTime !== this.drawnAt) {
      const g = c.getContext("2d");
      if (!g) return null;
      g.drawImage(el, 0, 0, c.width, c.height);
      this.drawnAt = el.currentTime;
      this.dirty = false;
      this.seq++;
    }
    return { image: c, width: c.width, height: c.height, key: `p${this.seq}` };
  }

  /** Play from `at` seconds of the source, with sound unless `muted`. */
  play(at: number, muted: boolean): void {
    const el = this.el;
    if (!el) return;
    this.wantPlaying = true;
    if (Math.abs(el.currentTime - at) > 0.05) el.currentTime = at;
    el.muted = muted;
    void el.play().catch(() => {
      // Autoplay with sound was blocked: play silently rather than not at all.
      if (!this.wantPlaying || !this.el || el.muted) return;
      el.muted = true;
      void el.play().catch(() => undefined);
    });
  }

  setMuted(muted: boolean): void {
    if (this.el) this.el.muted = muted;
  }

  pause(): void {
    this.wantPlaying = false;
    this.el?.pause();
  }

  /** Show the frame at `at` seconds of the source (paused). */
  seek(at: number): void {
    const el = this.el;
    if (!el) return;
    this.pause();
    if (Math.abs(el.currentTime - at) > 1e-3) el.currentTime = at;
  }
}
