/**
 * Screen recordings as content: pure helpers shared by the timeline, the
 * export planner, the editor and scene normalization. No media code here, so
 * importing it never pulls in the demuxer.
 *
 * A recording is an image asset whose pixels change over time. The design is
 * unchanged (background, frame, tilt, annotations, blur boxes); only the
 * content's pixels come from the frame at the playhead, and the timeline runs
 * over the trimmed clip instead of one motion loop.
 */
import type { AnimationSpec, Scene, VideoClip } from "../scene/types";

/** Shortest clip a trim can leave, in seconds. */
export const MIN_CLIP_SECONDS = 0.2;
/** Longest recording Shotcandy opens (10 minutes). */
export const MAX_CLIP_SECONDS = 600;
/** Largest recording file Shotcandy opens. */
export const MAX_VIDEO_BYTES = 1024 * 1024 * 1024;
/**
 * Largest recording kept in Recent designs and project files: storing means
 * reading the whole file into memory at once.
 */
export const MAX_STORED_VIDEO_BYTES = 256 * 1024 * 1024;
/** GIFs of longer clips get huge; the export panel warns past this. */
export const GIF_CLIP_WARN_SECONDS = 15;

/**
 * Motion preset of a recording that doesn't move: the card holds still while
 * the recording plays. Recordings always carry an animation spec, so the
 * timeline, playback and video export apply; this one is "no motion".
 */
export const STILL_MOTION_ID = "still";

/** The clip of a scene's content, when it is a screen recording. */
export function sceneClip(scene: Pick<Scene, "content">): VideoClip | null {
  return scene.content.kind === "image" ? (scene.content.clip ?? null) : null;
}

export function isVideoScene(scene: Pick<Scene, "content">): boolean {
  return sceneClip(scene) !== null;
}

/** Seconds of the recording the design plays. */
export function clipLength(clip: VideoClip): number {
  return Math.max(MIN_CLIP_SECONDS, clip.end - clip.start);
}

/**
 * Length of the design's timeline: the trimmed clip for recordings, one
 * motion loop otherwise.
 */
export function timelineDuration(scene: Pick<Scene, "content" | "animation">): number {
  const clip = sceneClip(scene);
  if (clip) return clipLength(clip);
  return scene.animation?.duration ?? 3;
}

/** Source time (seconds into the file) shown at timeline time t. */
export function sourceTime(clip: VideoClip, t: number): number {
  return Math.min(clip.end, Math.max(clip.start, clip.start + t));
}

/**
 * Time into the motion at timeline time t of a recording. A recording runs
 * longer than one motion: periodic motions keep looping at their own pace,
 * while "once" and "there and back" motions play at the start, then hold.
 */
export function motionTimeInClip(spec: AnimationSpec, periodic: boolean, t: number): number {
  if (periodic) return t;
  // Just short of the end: at exactly `duration` the loop would wrap to 0.
  return Math.min(Math.max(0, t), spec.duration * (1 - 1e-9));
}

/** A new clip for a freshly imported recording: all of it (up to the maximum length). */
export function createClip(duration: number, audio: boolean): VideoClip {
  const d = Math.min(MAX_CLIP_SECONDS, Math.max(MIN_CLIP_SECONDS, duration));
  return { duration: d, start: 0, end: d, audio, muted: false };
}

/** Apply a trim edit, keeping start < end and the clip at least MIN_CLIP_SECONDS long. */
export function trimClip(
  clip: VideoClip,
  patch: Partial<Pick<VideoClip, "start" | "end">>,
): VideoClip {
  const d = clip.duration;
  let start = Math.max(0, Math.min(d - MIN_CLIP_SECONDS, patch.start ?? clip.start));
  let end = Math.max(MIN_CLIP_SECONDS, Math.min(d, patch.end ?? clip.end));
  if (end - start < MIN_CLIP_SECONDS) {
    if (patch.start !== undefined && patch.end === undefined) start = end - MIN_CLIP_SECONDS;
    else end = Math.min(d, start + MIN_CLIP_SECONDS);
  }
  return { ...clip, start: round3(start), end: round3(end) };
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;

/** "1:05.2" style clip times for labels. */
export function formatClipTime(seconds: number): string {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return m > 0 ? `${m}:${rest.toFixed(1).padStart(4, "0")}` : `${rest.toFixed(1)}s`;
}

/** Audio codecs a container can carry as-is (copied without re-encoding). */
const COPYABLE_AUDIO: Record<"mp4" | "webm", readonly string[]> = {
  mp4: ["aac", "opus", "mp3", "flac", "ac3", "eac3"],
  webm: ["opus", "vorbis"],
};

/**
 * What an export does with the recording's sound: copy it untouched when the
 * container takes its codec, re-encode it otherwise (AAC for MP4, Opus for
 * WebM), or leave it out when muted or absent.
 */
export type AudioPlan =
  { mode: "none" } | { mode: "copy" } | { mode: "encode"; codec: "aac" | "opus"; bitrate: number };

/**
 * Re-encodes use 160 kbps: native AAC encoders below ~96 kbps crash the GPU
 * process on some macOS builds, and 160 kbps is transparent for speech.
 */
export const AUDIO_ENCODE_BITRATE = 160_000;

export function audioPlan(
  format: "mp4" | "webm",
  sourceCodec: string | null,
  clip: Pick<VideoClip, "audio" | "muted">,
): AudioPlan {
  if (!clip.audio || clip.muted || !sourceCodec) return { mode: "none" };
  if (COPYABLE_AUDIO[format].includes(sourceCodec)) return { mode: "copy" };
  return {
    mode: "encode",
    codec: format === "mp4" ? "aac" : "opus",
    bitrate: AUDIO_ENCODE_BITRATE,
  };
}
