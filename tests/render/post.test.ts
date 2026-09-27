/** Post and testimonial cards in Node (Skia): wrapping, layout, avatar, determinism. */
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type PostContent,
  type Scene,
  MapAssetResolver,
  POST_STYLES,
  POST_THEMES,
  RenderCache,
  createScene,
  getBackgroundPreset,
  initials,
  layoutScene,
  normalizeScene,
  postLayout,
  renderToCanvas,
  samplePost,
  sceneAssetIds,
  setIn,
  setMeasureEnvironment,
} from "@/engine";
import { nodeEnv, pixelsOf, syntheticScreenshot } from "../helpers/node-canvas";

beforeAll(() => setMeasureEnvironment(nodeEnv));
afterAll(() => setMeasureEnvironment(null));

const photo = syntheticScreenshot(300, 200, "#22aa66");
const assets = new MapAssetResolver([photo]);

function scene(c: PostContent): Scene {
  let s = createScene({ content: c });
  s = setIn(s, ["background", "fill"], { kind: "solid", color: "#ffeedd" });
  s = setIn(s, ["card", "shadow", "preset"], "none");
  return s;
}
const hash = (s: Scene) =>
  createHash("sha256")
    .update(pixelsOf(renderToCanvas(s, assets, { env: nodeEnv, cache: new RenderCache() }).canvas))
    .digest("hex");

describe("post layout", () => {
  it("wraps text to the card width and grows taller with more words", () => {
    const base = samplePost("social");
    const a = postLayout(base);
    expect(a.width).toBe(560);
    expect(a.lines.length).toBeGreaterThan(1);
    const long = postLayout({ ...base, text: base.text + " " + base.text });
    expect(long.lines.length).toBeGreaterThan(a.lines.length);
    expect(long.height).toBeGreaterThan(a.height);
    const narrow = postLayout({ ...base, width: 380 });
    expect(narrow.lines.length).toBeGreaterThan(a.lines.length);
    // Keeps explicit line breaks.
    expect(postLayout({ ...base, text: "one\n\nthree" }).lines).toEqual(["one", "", "three"]);
  });

  it("shows the numbers footer only when there are numbers", () => {
    const base = samplePost("social");
    expect(postLayout(base).footerY).not.toBeNull();
    const none = postLayout({ ...base, metrics: { replies: "", reposts: "", likes: "" } });
    expect(none.footerY).toBeNull();
    expect(none.height).toBeLessThan(postLayout(base).height);
    expect(postLayout(samplePost("testimonial")).footerY).toBeNull();
  });

  it("drives the canvas through the content registry", () => {
    const c = samplePost("testimonial");
    const l = layoutScene(scene(c), assets);
    expect(l.contentPixels).toEqual({ width: 560, height: postLayout(c).height });
  });
});

describe("post rendering", () => {
  it("draws an uploaded avatar instead of initials", () => {
    const c = samplePost("social");
    expect(hash(scene({ ...c, avatarAssetId: photo.id }))).not.toBe(hash(scene(c)));
    expect(sceneAssetIds(scene({ ...c, avatarAssetId: photo.id }))).toEqual([photo.id]);
  });

  it("differs by theme, variant, rating and accent, and is deterministic", () => {
    const c = samplePost("testimonial");
    const hashes = new Set(POST_THEMES.map((t) => hash(scene({ ...c, theme: t.id }))));
    expect(hashes.size).toBe(POST_THEMES.length);
    expect(hash(scene({ ...c, rating: 3 }))).not.toBe(hash(scene(c)));
    expect(hash(scene({ ...c, accent: "#0000ff" }))).not.toBe(hash(scene(c)));
    expect(hash(scene(c))).toBe(hash(scene(c)));
  });

  it("ships styles on existing backgrounds", () => {
    for (const st of POST_STYLES) {
      expect(POST_THEMES.map((t) => t.id)).toContain(st.theme);
      const fill = st.patch.background?.fill;
      expect(fill && fill.kind).toBeTruthy();
    }
    expect(getBackgroundPreset("sherbet")).toBeDefined();
  });
});

describe("post schema", () => {
  it("normalizes posts and makes initials", () => {
    const { scene: s } = normalizeScene({
      ...createScene(),
      content: { kind: "post", variant: "quote?", name: "A", rating: 9, width: 50, accent: "nope" },
    });
    expect(s.content).toMatchObject({
      kind: "post",
      variant: "social",
      rating: 5,
      width: 320,
      accent: "#ff4f7b",
    });
    expect(initials("maya  chen")).toBe("MC");
    expect(initials("Élodie")).toBe("É");
    expect(initials("  ")).toBe("?");
  });
});
