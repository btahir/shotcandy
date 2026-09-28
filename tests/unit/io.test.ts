import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILENAME_PATTERN,
  ImportError,
  computeLayout,
  createScene,
  formatFilename,
  imageFromClipboardEvent,
  imageFromDataTransfer,
  listFrames,
  maxExportScale,
  registerFrame,
  resolveFrame,
  sanitizeFilename,
  setIn,
  sniffImageKind,
  validateImageBytes,
  builtinAssetUrl,
  isBuiltinAssetId,
} from "@/engine";
import { MACOS_WINDOW } from "@/engine/frames/specs";
import { DESKTOP_LIMITS, SAFARI_LIMITS, canEncode } from "@/engine/export/formats";

describe("filename patterns", () => {
  const vars = {
    name: "My shot",
    preset: "og",
    width: 2400,
    height: 1260,
    scale: 2,
    format: "png" as const,
    now: new Date(2026, 8, 26, 9, 5, 7),
  };

  it("substitutes tokens and adds the extension", () => {
    expect(formatFilename(DEFAULT_FILENAME_PATTERN, vars)).toBe("My shot-2400x1260@2x.png");
    expect(formatFilename("{name}-{preset}-{date}-{time}-{n}", { ...vars, format: "jpeg" })).toBe(
      "My shot-og-2026-09-26-090507-1.jpg",
    );
    expect(formatFilename("{unknown}", vars)).toBe("{unknown}.png");
    expect(formatFilename("", { ...vars, format: "webp" })).toBe("My shot-2400x1260@2x.webp");
  });

  it("sanitizes unsafe characters", () => {
    expect(sanitizeFilename('a/b\\c:d*e?"f<g>h|i')).toBe("a-b-c-d-e-f-g-h-i");
    expect(sanitizeFilename("  ..hidden  ")).toBe("hidden");
    expect(formatFilename("///", vars)).toBe("shotcandy.png");
    expect(sanitizeFilename("x".repeat(300))).toHaveLength(150);
  });
});

const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0)]);

describe("input sniffing", () => {
  it("identifies formats from magic bytes", () => {
    expect(sniffImageKind(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("png");
    expect(sniffImageKind(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("jpeg");
    expect(sniffImageKind(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50))).toBe(
      "webp",
    );
    expect(sniffImageKind(bytes(0x47, 0x49, 0x46, 0x38))).toBe("gif");
    const ftyp = (brand: string) =>
      bytes(0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, ...[...brand].map((c) => c.charCodeAt(0)));
    expect(sniffImageKind(ftyp("heic"))).toBe("heic");
    expect(sniffImageKind(ftyp("mif1"))).toBe("heic");
    expect(sniffImageKind(ftyp("avif"))).toBe("avif");
    expect(sniffImageKind(bytes(1, 2, 3))).toBe("unknown");
  });

  it("accepts PNG/JPEG/WebP and rejects HEIC with guidance", () => {
    expect(validateImageBytes(bytes(0xff, 0xd8, 0xff))).toBe("image/jpeg");
    const heic = bytes(0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63);
    expect(() => validateImageBytes(heic)).toThrow(ImportError);
    try {
      validateImageBytes(heic);
    } catch (e) {
      expect((e as ImportError).code).toBe("heic");
      expect((e as Error).message).toMatch(/PNG or JPEG/);
    }
    expect(() => validateImageBytes(new Uint8Array())).toThrow(/empty/);
    expect(() => validateImageBytes(bytes(0x47, 0x49, 0x46, 0x38))).toThrow(/Unsupported/);
  });

  it("finds image files in paste and drop payloads", () => {
    const img = new File([new Uint8Array([1])], "a.png", { type: "image/png" });
    const txt = new File(["x"], "a.txt", { type: "text/plain" });
    const dt = { files: [txt, img], items: [], types: ["Files"] } as unknown as DataTransfer;
    expect(imageFromDataTransfer(dt)).toBe(img);
    const viaItems = {
      files: [],
      items: [{ kind: "file", type: "image/png", getAsFile: () => img }],
      types: ["Files"],
    } as unknown as DataTransfer;
    expect(imageFromDataTransfer(viaItems)).toBe(img);
    expect(imageFromClipboardEvent({ clipboardData: null })).toBeNull();
    expect(imageFromClipboardEvent({ clipboardData: viaItems })).toBe(img);
  });
});

describe("frame registry", () => {
  it("lists the six built-in frames", () => {
    expect(listFrames().map((f) => f.id)).toEqual([
      "macos",
      "browser",
      "phone",
      "tablet",
      "laptop",
      "canvas",
    ]);
    expect(resolveFrame("none")).toBeNull();
    expect(resolveFrame("macos")!.kind.kind).toBe("window");
  });

  it("accepts new data-only frames and reserves 'none'", () => {
    registerFrame({ ...MACOS_WINDOW, id: "macos-tall", label: "Tall bar", barHeight: 40 });
    expect(resolveFrame("macos-tall")!.spec).toMatchObject({ barHeight: 40 });
    expect(() => registerFrame({ ...MACOS_WINDOW, id: "none" })).toThrow();
  });
});

describe("export limits and encoding", () => {
  it("picks the largest scale that fits the canvas limits", () => {
    const l = computeLayout(
      setIn(createScene({ content: { kind: "image", assetId: "a" } }), ["canvas", "size"], {
        kind: "fixed",
        width: 3840,
        height: 2160,
      }),
      { width: 3840, height: 2160 },
    );
    expect(maxExportScale(l, DESKTOP_LIMITS)).toBe(4);
    expect(maxExportScale(l, SAFARI_LIMITS)).toBe(1);
    expect(maxExportScale(l, { maxSide: 100, maxArea: 1e9 })).toBe(0);
  });

  it("detects unsupported encoders once (Safari returns PNG for WebP)", async () => {
    let calls = 0;
    const fake = () =>
      ({
        convertToBlob: async () => {
          calls++;
          return new Blob([], { type: "image/png" });
        },
      }) as unknown as OffscreenCanvas;
    expect(await canEncode("webp", fake)).toBe(false);
    expect(await canEncode("webp", fake)).toBe(false);
    expect(calls).toBe(1);
    expect(await canEncode("png", fake)).toBe(true);
  });
});

describe("built-in assets", () => {
  it("maps builtin ids to static URLs", () => {
    expect(isBuiltinAssetId("builtin:peach-dunes")).toBe(true);
    expect(isBuiltinAssetId("img_abc")).toBe(false);
    expect(builtinAssetUrl("builtin:peach-dunes")).toBe("/backgrounds/peach-dunes.webp");
    expect(builtinAssetUrl("builtin:../../etc", "/base")).toBe("/base/backgrounds/etc.webp");
  });
});
