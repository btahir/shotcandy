/**
 * Performance budget (acceptance): a 4K export completes in under 1.5 s, and
 * preview re-renders with a 4K input stay under 100 ms. Run with `pnpm bench`
 * (serially, so other suites do not skew the timings).
 */
import { applyStylePatch, createScene, getStylePreset, setIn, type Scene } from "../../src/engine";
import { call, expect, test } from "./fixtures";

test.describe.configure({ mode: "serial" });

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

function heavy(styleId: string): Scene {
  let s = applyStylePatch(
    createScene({ content: { kind: "image", assetId: "uhd" } }),
    getStylePreset(styleId)!.patch,
    styleId,
  );
  s = setIn(s, ["canvas", "size"], { kind: "fixed", width: 3840, height: 2160 });
  return setIn(s, ["background", "grain", "amount"], 0.2);
}

test("4K export under 1.5 s", async ({ harness }) => {
  await call(harness, "synth", "uhd", "dashboard", 3840, 2400);
  for (const [styleId, via] of [
    ["sherbet", "worker"],
    ["sherbet", "main"],
    ["tilted-taffy", "worker"],
  ] as const) {
    const scene = heavy(styleId);
    await call(harness, "export", scene, "png", 1, via); // warm-up
    const runs: { total: number; render: number; encode: number }[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await call(harness, "export", scene, "png", 1, via);
      expect([r.width, r.height]).toEqual([3840, 2160]);
      runs.push({
        total: r.totalMs as number,
        render: r.renderMs as number,
        encode: r.encodeMs as number,
      });
    }
    const m = median(runs.map((r) => r.total));
    console.log(
      `4K ${styleId} via ${via}: median ${m.toFixed(0)} ms (render ${median(runs.map((r) => r.render)).toFixed(0)} ms, encode ${median(runs.map((r) => r.encode)).toFixed(0)} ms)`,
    );
    expect(m).toBeLessThan(1500);
  }
});

test("interactions with a 4K input stay under 100 ms", async ({ harness }) => {
  await call(harness, "synth", "uhd", "dashboard", 3840, 2400);
  for (const styleId of ["sherbet", "from-your-shot", "tilted-taffy"]) {
    const base = setIn(heavy(styleId), ["canvas", "size"], { kind: "auto" });
    // Simulate dragging sliders: radius, padding, shadow strength, tilt.
    const frames: Scene[] = [];
    for (let i = 0; i < 24; i++) {
      let s = setIn(base, ["card", "radius"], 8 + i);
      s = setIn(s, ["canvas", "padding"], 60 + i * 3);
      s = setIn(s, ["card", "shadow", "strength"], 0.5 + (i % 10) / 10);
      if (styleId === "tilted-taffy") s = setIn(s, ["card", "tilt", "rotateY"], -20 + i);
      frames.push(s);
    }
    const times = await call(harness, "previewTimings", frames, 1400);
    const warm = times.slice(2);
    const p95 = [...warm].sort((a, b) => a - b)[Math.floor(warm.length * 0.95)]!;
    console.log(
      `preview ${styleId}: median ${median(warm).toFixed(1)} ms, p95 ${p95.toFixed(1)} ms, max ${Math.max(...warm).toFixed(1)} ms`,
    );
    expect(p95).toBeLessThan(100);
  }
});
