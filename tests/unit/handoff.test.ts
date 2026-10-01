import { describe, expect, it } from "vitest";
import {
  HANDOFF_MAX_OPEN,
  editorUrl,
  hasHandoff,
  layoutForCount,
  parseHandoff,
} from "@/lib/handoff";
import { LAYOUTS } from "@/engine/scene/layouts";

describe("editor handoff links", () => {
  it("reads nothing from an empty query", () => {
    const h = parseHandoff("");
    expect(h).toEqual({
      mode: null,
      style: null,
      size: null,
      open: [],
      layout: null,
      tool: null,
      sample: null,
      gallery: false,
    });
    expect(hasHandoff(h)).toBe(false);
  });

  it("reads the existing parameters as before", () => {
    const h = parseHandoff("?mode=code&style=sherbet&size=og&open=img_abc&gallery=1");
    expect(h.mode).toBe("code");
    expect(h.style).toBe("sherbet");
    expect(h.size).toBe("og");
    expect(h.open).toEqual(["img_abc"]);
    expect(h.gallery).toBe(true);
    expect(hasHandoff(h)).toBe(true);
  });

  it("drops unknown modes, layouts and tools", () => {
    const h = parseHandoff("?mode=video&layout=spiral&tool=eraser");
    expect(h.mode).toBeNull();
    expect(h.layout).toBeNull();
    expect(h.tool).toBeNull();
    expect(hasHandoff(h)).toBe(false);
  });

  it("accepts every multi-screen layout but not single", () => {
    for (const l of LAYOUTS) {
      const h = parseHandoff(`?layout=${l.id}`);
      expect(h.layout).toBe(l.id === "single" ? null : l.id);
    }
  });

  it("reads the redact tool", () => {
    expect(parseHandoff("?tool=redact").tool).toBe("redact");
  });

  it("splits several open ids, dropping blanks, duplicates and junk", () => {
    const h = parseHandoff("?open=img_a,,img_b,img_a,../x,img_c");
    expect(h.open).toEqual(["img_a", "img_b", "img_c"]);
  });

  it("caps the images one link can open", () => {
    const ids = Array.from({ length: 140 }, (_, i) => `img_${i}`);
    expect(parseHandoff(`?open=${ids.join(",")}`).open).toHaveLength(HANDOFF_MAX_OPEN);
  });

  it("builds editor URLs that read back the same", () => {
    const url = editorUrl({
      mode: "appstore",
      layout: "fan",
      tool: "redact",
      open: ["img_a", "img_b"],
    });
    expect(url).toBe("/?mode=appstore&layout=fan&tool=redact&open=img_a%2Cimg_b");
    const h = parseHandoff(url.slice(1));
    expect(h.mode).toBe("appstore");
    expect(h.layout).toBe("fan");
    expect(h.tool).toBe("redact");
    expect(h.open).toEqual(["img_a", "img_b"]);
    expect(editorUrl({})).toBe("/");
    expect(editorUrl({ style: "sherbet", size: "og" })).toBe("/?style=sherbet&size=og");
  });

  it("picks a layout that fits the number of screenshots", () => {
    expect(layoutForCount(2)).toBe("side-by-side");
    expect(layoutForCount(3)).toBe("hero");
    for (const n of [4, 5, 6]) {
      const id = layoutForCount(n);
      const def = LAYOUTS.find((l) => l.id === id)!;
      expect(n).toBeGreaterThanOrEqual(def.minCount);
      expect(n).toBeLessThanOrEqual(def.maxCount);
    }
  });
});
