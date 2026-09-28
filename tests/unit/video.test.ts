/**
 * Screen recordings without media decoding: container sniffing, content ids,
 * clip and trim maths, sound planning, the clip-aware timeline, export
 * planning, scene normalization and project files.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type AssetSource,
  type Scene,
  MapAssetResolver,
  STILL_MOTION_ID,
  audioPlan,
  clipLength,
  createAnimation,
  createClip,
  createProjectFile,
  createScene,
  evaluateScene,
  formatClipTime,
  getMotionPreset,
  isVideoScene,
  motionTimeInClip,
  normalizeScene,
  parseProject,
  planAnimation,
  serializeProject,
  sniffVideoKind,
  sourceTime,
  timelineDuration,
  trimClip,
  videoAssetId,
  videoIdForBytes,
  withVideoFrame,
} from "@/engine";

const fixture = (name: string) =>
  new Uint8Array(readFileSync(resolve(__dirname, "../fixtures", name)));

const shot: AssetSource = { id: "vid_a", width: 1600, height: 1000, images: [] };
const assets = new MapAssetResolver([shot]);
const ctx = { assets, palette: null };

function recording(preset = STILL_MOTION_ID, clip = createClip(12, true)): Scene {
  return {
    ...createScene({ content: { kind: "image", assetId: "vid_a", clip } }),
    animation: createAnimation(preset),
  };
}

describe("sniffVideoKind", () => {
  it("recognises MP4, QuickTime and WebM recordings", () => {
    expect(sniffVideoKind(fixture("recording.mp4"))).toBe("mp4");
    expect(sniffVideoKind(fixture("recording.mov"))).toBe("mov");
    expect(sniffVideoKind(fixture("recording.webm"))).toBe("webm");
  });

  it("leaves images alone", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    expect(sniffVideoKind(png)).toBeNull();
    const heic = new Uint8Array([0, 0, 0, 24, ...[..."ftypheic"].map((c) => c.charCodeAt(0))]);
    expect(sniffVideoKind(heic)).toBeNull();
    const avif = new Uint8Array([0, 0, 0, 24, ...[..."ftypavif"].map((c) => c.charCodeAt(0))]);
    expect(sniffVideoKind(avif)).toBeNull();
    expect(sniffVideoKind(new Uint8Array(3))).toBeNull();
  });
});

describe("recording ids", () => {
  it("are stable and agree between bytes and Blobs", async () => {
    const b = fixture("recording.webm");
    expect(videoIdForBytes(b)).toMatch(/^vid_[0-9a-f]+$/);
    expect(videoIdForBytes(b)).toBe(videoIdForBytes(b.slice()));
    expect(await videoAssetId(new Blob([b]))).toBe(videoIdForBytes(b));
  });

  it("sample big files: head, middle, tail and length", async () => {
    const big = new Uint8Array(20 * 1024 * 1024).map((_, i) => (i * 7) % 251);
    const id = videoIdForBytes(big);
    expect(await videoAssetId(new Blob([big]))).toBe(id);
    const tail = big.slice();
    tail[tail.length - 1]! ^= 1;
    expect(videoIdForBytes(tail)).not.toBe(id);
    const longer = new Uint8Array(big.length + 1);
    longer.set(big);
    expect(videoIdForBytes(longer)).not.toBe(id);
  });
});

describe("clips", () => {
  it("start as the whole recording", () => {
    expect(createClip(8.5, true)).toEqual({
      duration: 8.5,
      start: 0,
      end: 8.5,
      audio: true,
      muted: false,
    });
    expect(createClip(10_000, false).end).toBe(600);
  });

  it("trim keeps start < end and a minimum length", () => {
    const c = createClip(10, true);
    expect(trimClip(c, { start: 2, end: 6 })).toMatchObject({ start: 2, end: 6 });
    // Dragging the start past the end pushes against it, not through it.
    expect(trimClip({ ...c, end: 5 }, { start: 9 })).toMatchObject({ start: 4.8, end: 5 });
    expect(trimClip({ ...c, start: 5 }, { end: 1 })).toMatchObject({ start: 5, end: 5.2 });
    expect(trimClip(c, { start: -3, end: 99 })).toMatchObject({ start: 0, end: 10 });
    expect(clipLength(trimClip(c, { start: 3, end: 3 }))).toBeCloseTo(0.2, 6);
  });

  it("map timeline time to source time inside the trim", () => {
    const c = { ...createClip(10, true), start: 2, end: 6 };
    expect(sourceTime(c, 0)).toBe(2);
    expect(sourceTime(c, 1.5)).toBe(3.5);
    expect(sourceTime(c, 99)).toBe(6);
    expect(sourceTime(c, -1)).toBe(2);
  });

  it("format times for labels", () => {
    expect(formatClipTime(4.26)).toBe("4.3s");
    expect(formatClipTime(65.2)).toBe("1:05.2");
  });
});

describe("audioPlan", () => {
  const on = { audio: true, muted: false };
  it("copies sound the container can carry", () => {
    expect(audioPlan("mp4", "aac", on)).toEqual({ mode: "copy" });
    expect(audioPlan("mp4", "opus", on)).toEqual({ mode: "copy" });
    expect(audioPlan("webm", "opus", on)).toEqual({ mode: "copy" });
  });
  it("re-encodes at a safe bitrate otherwise", () => {
    expect(audioPlan("webm", "aac", on)).toEqual({
      mode: "encode",
      codec: "opus",
      bitrate: 160_000,
    });
    expect(audioPlan("mp4", "pcm-s16", on)).toEqual({
      mode: "encode",
      codec: "aac",
      bitrate: 160_000,
    });
  });
  it("leaves sound out when muted or absent", () => {
    expect(audioPlan("mp4", "aac", { audio: true, muted: true })).toEqual({ mode: "none" });
    expect(audioPlan("mp4", null, on)).toEqual({ mode: "none" });
    expect(audioPlan("mp4", "aac", { audio: false, muted: false })).toEqual({ mode: "none" });
  });
});

describe("recording timeline", () => {
  it("runs over the trimmed clip, not one motion loop", () => {
    const s = recording("float", { ...createClip(12, true), start: 1, end: 9 });
    expect(isVideoScene(s)).toBe(true);
    expect(timelineDuration(s)).toBe(8);
    expect(timelineDuration(createScene())).toBe(3);
  });

  it("has a hidden no-motion preset that leaves the design alone", () => {
    const p = getMotionPreset(STILL_MOTION_ID)!;
    expect(p.periodic).toBe(true);
    const s = recording();
    expect(evaluateScene(s, 5, ctx).card).toEqual(evaluateScene(s, 0, ctx).card);
  });

  it("plays 'once' motions at the start, then holds the end pose", () => {
    const s = recording("reveal");
    const d = s.animation!.duration;
    const end = evaluateScene(s, d * 0.999999, ctx);
    expect(evaluateScene(s, d + 4, ctx).card).toEqual(end.card);
    expect(evaluateScene(s, 0, ctx).card).not.toEqual(end.card);
    expect(motionTimeInClip(s.animation!, false, 99)).toBeLessThan(d);
  });

  it("keeps periodic motions looping at their own pace", () => {
    const s = recording("float");
    const d = s.animation!.duration;
    expect(evaluateScene(s, d + 0.7, ctx).card).toEqual(evaluateScene(s, 0.7, ctx).card);
  });

  it("plans one frame per output tick of the trimmed clip", () => {
    const s = recording(STILL_MOTION_ID, { ...createClip(12, true), start: 2, end: 4.5 });
    const plan = planAnimation(s, assets, { format: "mp4", scale: 0.5 });
    expect(plan.frames).toBe(75);
    expect(plan.duration).toBeCloseTo(2.5, 6);
    const gif = planAnimation(s, assets, { format: "gif", scale: 0.25, fps: 10 });
    expect(gif.frames).toBe(25);
  });
});

describe("withVideoFrame", () => {
  it("swaps one asset's pixels and keys caches per frame", () => {
    const frame = { image: {} as CanvasImageSource, width: 800, height: 500 };
    const r = withVideoFrame(assets, "vid_a", frame, 7);
    const src = r.get("vid_a")!;
    expect(src.id).toBe("vid_a@7");
    expect(src.images).toEqual([frame]);
    expect(src.still).toBe(shot);
    expect([src.width, src.height]).toEqual([1600, 1000]);
    expect(r.get("other")).toBeUndefined();
  });
});

describe("scene normalization", () => {
  it("keeps a valid clip", () => {
    const s = recording(STILL_MOTION_ID, {
      duration: 30,
      start: 3,
      end: 20,
      audio: true,
      muted: true,
    });
    const { scene, issues } = normalizeScene(JSON.parse(JSON.stringify(s)));
    expect(issues).toEqual([]);
    expect(scene.content).toEqual(s.content);
    expect(scene.animation?.preset).toBe(STILL_MOTION_ID);
  });

  it("repairs out-of-range trims and drops clips without a length", () => {
    const bad = {
      ...createScene(),
      content: { kind: "image", assetId: "vid_a", clip: { duration: 10, start: 12, end: 3 } },
    };
    const fixed = normalizeScene(bad).scene.content;
    expect(fixed.kind === "image" && fixed.clip).toMatchObject({
      duration: 10,
      start: 9.8,
      end: 10,
    });
    const none = normalizeScene({
      ...createScene(),
      content: { kind: "image", assetId: "vid_a", clip: { start: 1 } },
    });
    expect(none.scene.content.kind === "image" && none.scene.content.clip).toBeFalsy();
    expect(none.issues.length).toBeGreaterThan(0);
  });
});

describe("project files", () => {
  it("round-trip a recording with its content id", async () => {
    const bytes = fixture("recording.mp4");
    const id = videoIdForBytes(bytes);
    const scene = {
      ...createScene({ content: { kind: "image", assetId: id, clip: createClip(2, true) } }),
      animation: createAnimation(STILL_MOTION_ID),
    };
    const file = await createProjectFile(
      scene,
      [{ id, blob: new Blob([bytes], { type: "video/mp4" }), width: 320, height: 200 }],
      { appVersion: "test", now: new Date("2026-09-28T00:00:00Z") },
    );
    const loaded = await parseProject(serializeProject(file));
    expect(loaded.issues).toEqual([]);
    expect(loaded.scene).toEqual(scene);
    expect(loaded.assets[0]).toMatchObject({ id, mime: "video/mp4" });
  });
});
