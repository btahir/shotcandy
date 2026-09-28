/**
 * One full-size frame of a recording, for still exports and copies: the frame
 * at the trim start, at the recording's own resolution (the editing poster is
 * the first frame, capped at proxy size).
 */
import { type RenderEnvironment, defaultEnvironment, get2d } from "../render/env";

const MAX_SIDE = 3840;

export async function decodeStill(
  blob: Blob,
  at: number,
  env: RenderEnvironment = defaultEnvironment(),
): Promise<{ image: CanvasImageSource; width: number; height: number } | null> {
  const { ALL_FORMATS, BlobSource, CanvasSink, Input } = await import("mediabunny");
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) return null;
    const w0 = await track.getDisplayWidth();
    const h0 = await track.getDisplayHeight();
    const k = Math.min(1, MAX_SIDE / Math.max(w0, h0));
    const width = Math.max(1, Math.round(w0 * k));
    const height = Math.max(1, Math.round(h0 * k));
    const sink = new CanvasSink(track, { width, height, fit: "fill", poolSize: 0 });
    const first = await track.getFirstTimestamp();
    const wc = await sink.getCanvas(Math.max(first, at + 1e-4));
    if (!wc) return null;
    const c = env.createCanvas(width, height);
    get2d(c).drawImage(wc.canvas as CanvasImageSource, 0, 0, width, height);
    return { image: c, width, height };
  } catch {
    return null;
  } finally {
    input.dispose();
  }
}
