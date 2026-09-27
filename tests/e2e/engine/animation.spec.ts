/**
 * Animated export in a real browser: MP4 (H.264 via WebCodecs + mp4-muxer),
 * WebM and GIF files have the right size, frame count, duration and frame
 * rate — read from the container boxes and cross-checked with ffprobe — and
 * frame n renders the same pixels every time, in the worker and on the page.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  addAnnotation,
  applyStylePatch,
  createAnimation,
  createAnnotation,
  createScene,
  getStylePreset,
  setIn,
  type Scene,
} from "../../../src/engine";
import { parseGif, parseMp4, webmDocType } from "../../helpers/media";
import { call, expect, test } from "../fixtures";

const OUT = resolve(__dirname, "../../../test-results/animation");

function ffprobe(file: string): Record<string, string> | null {
  try {
    const raw = execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-count_frames",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=codec_name,width,height,r_frame_rate,avg_frame_rate,nb_read_frames:format=duration,format_name",
        "-of",
        "default=noprint_wrappers=1",
        file,
      ],
      { encoding: "utf8" },
    );
    return Object.fromEntries(
      raw
        .trim()
        .split("\n")
        .map((l) => l.split("=") as [string, string]),
    );
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null; // ffprobe not installed
    throw e;
  }
}

function save(name: string, base64: string): string {
  mkdirSync(OUT, { recursive: true });
  const file = resolve(OUT, name);
  writeFileSync(file, Buffer.from(base64, "base64"));
  return file;
}

function motionScene(preset: string, duration = 2, fps = 30): Scene {
  let s = applyStylePatch(
    createScene({ content: { kind: "image", assetId: "dashboard" } }),
    getStylePreset("sherbet")!.patch,
    "sherbet",
  );
  s = setIn(s, ["canvas", "size"], { kind: "fixed", width: 1280, height: 720 });
  s = addAnnotation(s, { ...createAnnotation("arrow", "a1"), color: "#ff4f7b", curve: 0.3 });
  return { ...s, animation: { ...createAnimation(preset), duration, fps } };
}

test.describe("animated export", () => {
  for (const via of ["worker", "main"] as const) {
    test(`MP4 (H.264) via ${via}: exact size, frame count, duration and fps`, async ({
      harness,
    }) => {
      const scene = motionScene("reveal", 2, 30);
      const r = await call(
        harness,
        "animate",
        scene,
        { format: "mp4", scale: 1, quality: "balanced" },
        via,
      );
      expect(r.via).toBe(via);
      expect(r.mime).toBe("video/mp4");
      expect(r.codec).toMatch(/^avc1\./);
      expect([r.width, r.height]).toEqual([1280, 720]);
      expect(r.frames).toBe(60);
      expect(r.progress.at(-1)).toBe(1);
      const info = parseMp4(Buffer.from(r.base64, "base64"));
      expect(info.brand).toMatch(/isom|mp42|avc1/);
      expect(info.codec).toBe("avc1");
      expect([info.width, info.height]).toEqual([1280, 720]);
      expect(info.frames).toBe(60);
      expect(info.mediaDuration).toBeCloseTo(2, 2);
      expect(info.fps).toBeCloseTo(30, 1);
      const probe = ffprobe(save(`reveal-${via}.mp4`, r.base64));
      if (probe) {
        expect(probe.codec_name).toBe("h264");
        expect(probe.width).toBe("1280");
        expect(probe.height).toBe("720");
        expect(probe.r_frame_rate).toBe("30/1");
        expect(Number(probe.nb_read_frames)).toBe(60);
        expect(Number(probe.duration)).toBeCloseTo(2, 1);
      }
    });
  }

  test("MP4 at 60 fps with odd canvas sizes trims to even dimensions", async ({ harness }) => {
    const scene = setIn(motionScene("float", 1, 60), ["canvas", "size"], {
      kind: "fixed",
      width: 801,
      height: 451,
    });
    const r = await call(
      harness,
      "animate",
      scene,
      { format: "mp4", scale: 1, quality: "small" },
      "worker",
    );
    expect([r.width, r.height]).toEqual([800, 450]);
    const info = parseMp4(Buffer.from(r.base64, "base64"));
    expect(info.frames).toBe(60);
    expect(info.fps).toBeCloseTo(60, 1);
    const probe = ffprobe(save("float-60.mp4", r.base64));
    if (probe) expect(probe.r_frame_rate).toBe("60/1");
  });

  test("WebM (VP9) fallback is a valid WebM file", async ({ harness }) => {
    const scene = motionScene("sweep", 1.5, 24);
    const r = await call(
      harness,
      "animate",
      scene,
      { format: "webm", scale: 0.5, quality: "balanced" },
      "worker",
    );
    expect(r.mime).toBe("video/webm");
    expect(r.codec).toMatch(/^vp/);
    expect(webmDocType(Buffer.from(r.base64, "base64"))).toBe("webm");
    const probe = ffprobe(save("sweep.webm", r.base64));
    if (probe) {
      expect(probe.codec_name).toMatch(/vp9|vp8/);
      expect(probe.width).toBe("640");
      expect(Number(probe.nb_read_frames)).toBe(36);
    }
  });

  test("GIF: valid file, looping, exact delays", async ({ harness }) => {
    const scene = motionScene("draw", 2, 25);
    const r = await call(
      harness,
      "animate",
      scene,
      { format: "gif", scale: 0.5, quality: "best" },
      "worker",
    );
    expect(r.mime).toBe("image/gif");
    const gif = parseGif(Buffer.from(r.base64, "base64"));
    expect(gif.version).toBe("GIF89a");
    expect(gif.trailer).toBe(true);
    expect([gif.width, gif.height]).toEqual([640, 360]);
    expect(gif.frames).toBe(50);
    expect(gif.loop).toBe(0);
    expect(new Set(gif.delays)).toEqual(new Set([4]));
    const probe = ffprobe(save("draw.gif", r.base64));
    if (probe) {
      expect(probe.codec_name).toBe("gif");
      expect(Number(probe.nb_read_frames)).toBe(50);
      expect(Number(probe.duration)).toBeCloseTo(2, 1);
    }
  });

  test("frame n renders the same pixels every time", async ({ harness }) => {
    for (const preset of ["reveal", "sweep", "focus", "flip"]) {
      const scene = motionScene(preset, 2, 30);
      const a = await call(harness, "frameHash", scene, 17, 0.5, true);
      await call(harness, "frameHash", scene, 3, 0.5, false);
      await call(harness, "frameHash", scene, 40, 0.5, false);
      const b = await call(harness, "frameHash", scene, 17, 0.5, false);
      expect(b.hash, preset).toBe(a.hash);
      const c = await call(harness, "frameHash", scene, 18, 0.5, true);
      expect(c.hash, preset).not.toBe(a.hash);
    }
  });

  test("cancelling stops the worker export", async ({ harness }) => {
    const scene = motionScene("sweep", 4, 30);
    const r = await call(
      harness,
      "animateCancel",
      scene,
      { format: "mp4", scale: 1, quality: "balanced" },
      5,
    );
    expect(r.cancelled).toBe(true);
  });
});
