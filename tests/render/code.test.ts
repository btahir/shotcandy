/** Code image rendering in Node (Skia): size from measured text, themes, highlights, tokens. */
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type CodeContent,
  type Scene,
  CODE_THEMES,
  EMPTY_ASSETS,
  RenderCache,
  codeLayout,
  codeTokensKey,
  createScene,
  layoutScene,
  parseColor,
  renderToCanvas,
  setIn,
  setMeasureEnvironment,
} from "@/engine";
import { nodeEnv, pixel, pixelsOf } from "../helpers/node-canvas";

beforeAll(() => setMeasureEnvironment(nodeEnv));
afterAll(() => setMeasureEnvironment(null));

const CODE = `function add(a, b) {\n  return a + b;\n}\n`;

function code(patch: Partial<CodeContent> = {}): CodeContent {
  return {
    kind: "code",
    code: CODE,
    language: "javascript",
    theme: "midnight-candy",
    fontSize: 16,
    lineNumbers: true,
    highlight: [],
    title: "add.js",
    chrome: "mac",
    padding: 28,
    tokens: null,
    ...patch,
  };
}

function scene(c: CodeContent): Scene {
  let s = createScene({ content: c });
  s = setIn(s, ["background", "fill"], { kind: "solid", color: "#ffffff" });
  s = setIn(s, ["card", "shadow", "preset"], "none");
  s = setIn(s, ["card", "radius"], 0);
  s = setIn(s, ["canvas", "padding"], 40);
  return s;
}

const render = (s: Scene) =>
  renderToCanvas(s, EMPTY_ASSETS, { env: nodeEnv, cache: new RenderCache() }).canvas;
const hash = (s: Scene) => createHash("sha256").update(pixelsOf(render(s))).digest("hex");

describe("code layout", () => {
  it("hugs the code and grows with lines, font size and line numbers", () => {
    const base = codeLayout(code());
    expect(base.lines).toHaveLength(3); // trailing newline dropped
    const more = codeLayout(code({ code: CODE + "const x = 1;\nconst y = 2;\n" }));
    expect(more.height).toBeGreaterThan(base.height);
    const big = codeLayout(code({ fontSize: 24 }));
    expect(big.width).toBeGreaterThan(base.width);
    expect(big.height).toBeGreaterThan(base.height);
    const noNums = codeLayout(code({ lineNumbers: false }));
    expect(noNums.gutterW).toBe(0);
    expect(base.gutterW).toBeGreaterThan(0);
    const noHeader = codeLayout(code({ chrome: "none", title: "" }));
    expect(noHeader.headerH).toBe(0);
    expect(noHeader.height).toBeLessThan(base.height);
  });

  it("drives the auto canvas through the content registry", () => {
    const s = scene(code());
    const L = codeLayout(code());
    const layout = layoutScene(s, EMPTY_ASSETS);
    expect(layout.contentPixels).toEqual({ width: L.width, height: L.height });
    // Native scale: 1x export shows the code at its natural pixel size.
    expect(layout.canvas.width).toBe(Math.round(L.width + 2 * 40 * layout.k));
  });

  it("fits wide code inside a fixed canvas", () => {
    const wide = code({ code: "const x = " + "'candy', ".repeat(12) + ";\n" + CODE });
    const s = setIn(scene(wide), ["canvas", "size"], { kind: "fixed", width: 720, height: 540 });
    const l = layoutScene(s, EMPTY_ASSETS);
    for (const p of l.cardQuad) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(720);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(540);
    }
  });

  it("uses stored tokens only when they match the code", () => {
    const tokens = {
      key: codeTokensKey(CODE, "javascript"),
      language: "javascript",
      lines: [[["function", 2], [" add(a, b) {", 0]], [["  return a + b;", 0]], [["}", 11]], []],
    } as CodeContent["tokens"];
    const fresh = codeLayout(code({ tokens }));
    expect(fresh.lines[0]![0]).toEqual(["function", 2]);
    const stale = codeLayout(code({ code: CODE + "x", tokens }));
    expect(stale.lines[0]![0]![1]).toBe(0);
  });
});

describe("code rendering", () => {
  it("paints the theme background and differs between themes", () => {
    const hashes = new Set<string>();
    for (const t of CODE_THEMES) {
      const s = scene(code({ theme: t.id }));
      const c = render(s);
      const layout = layoutScene(s, EMPTY_ASSETS);
      const q = layout.cardQuad[0];
      // A point inside the window, away from text.
      const p = pixel(c, q.x + 4, layout.cardQuad[3].y - 4);
      const bg = parseColor(t.bg);
      expect(Math.abs(p[0] - bg.r) + Math.abs(p[1] - bg.g) + Math.abs(p[2] - bg.b), t.id).toBeLessThan(6);
      hashes.add(hash(s));
    }
    expect(hashes.size).toBe(CODE_THEMES.length);
  });

  it("draws highlight bands and colours tokens", () => {
    const plain = hash(scene(code()));
    expect(hash(scene(code({ highlight: [2] })))).not.toBe(plain);
    const tokens = {
      key: codeTokensKey(CODE, "javascript"),
      language: "javascript",
      lines: [[["function", 2], [" add(a, b) {", 0]], [["  return a + b;", 0]], [["}", 0]]],
    } as CodeContent["tokens"];
    expect(hash(scene(code({ tokens })))).not.toBe(plain);
  });

  it("is deterministic", () => {
    const s = scene(code({ highlight: [1, 3], theme: "sherbet" }));
    expect(hash(s)).toBe(hash(s));
  });
});
