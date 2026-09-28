/**
 * Runtime validation + normalization of scenes coming from untrusted places
 * (IndexedDB, project files, URLs, older app versions).
 *
 * Lenient by design: a bad field falls back to its default and is reported in
 * `issues`, so a single corrupt value never makes a saved design unopenable.
 * Colours are normalized, numbers clamped to their documented ranges, unknown
 * fields dropped. Output is always a valid, current-version Scene.
 */
import { isColor, normalizeColor } from "../math/color";
import { DEFAULT_BACKGROUND, DEFAULT_CARD, createScene } from "./defaults";
import type {
  AnimationSpec,
  CaptionSpec,
  Annotation,
  CodeTokens,
  PostContent,
  BackgroundFill,
  BackgroundSpec,
  CanvasSize,
  CardStyle,
  Content,
  GradientStop,
  MeshPoint,
  Scene,
  ShadowLayer,
  ImageContent,
  StackSpec,
  ReflectionSpec,
  TextureSpec,
  VignetteSpec,
  CanvasSpec,
} from "./types";
import { SCENE_VERSION } from "./types";
import { MAX_CLIP_SECONDS, MIN_CLIP_SECONDS } from "../video/clip";

export interface NormalizeResult {
  scene: Scene;
  issues: string[];
}

type Obj = Record<string, unknown>;

class Ctx {
  issues: string[] = [];
  warn(path: string, msg: string) {
    this.issues.push(`${path}: ${msg}`);
  }
}

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

function num(
  c: Ctx,
  path: string,
  v: unknown,
  def: number,
  min = -Infinity,
  max = Infinity,
): number {
  if (v === undefined) return def;
  if (typeof v !== "number" || !Number.isFinite(v)) {
    c.warn(path, `expected a number, got ${JSON.stringify(v)}`);
    return def;
  }
  if (v < min || v > max) {
    c.warn(path, `clamped ${v} to [${min}, ${max}]`);
    return Math.min(max, Math.max(min, v));
  }
  return v;
}

function str(c: Ctx, path: string, v: unknown, def: string, maxLen = 10_000): string {
  if (v === undefined) return def;
  if (typeof v !== "string") {
    c.warn(path, "expected a string");
    return def;
  }
  return v.length > maxLen ? v.slice(0, maxLen) : v;
}

function color(c: Ctx, path: string, v: unknown, def: string): string {
  if (v === undefined) return def;
  if (!isColor(v)) {
    c.warn(path, `invalid colour ${JSON.stringify(v)}`);
    return def;
  }
  return normalizeColor(v);
}

function oneOf<T extends string>(
  c: Ctx,
  path: string,
  v: unknown,
  options: readonly T[],
  def: T,
): T {
  if (v === undefined) return def;
  if (typeof v === "string" && (options as readonly string[]).includes(v)) return v as T;
  c.warn(path, `expected one of ${options.join("|")}`);
  return def;
}

function obj(c: Ctx, path: string, v: unknown): Obj {
  if (v === undefined) return {};
  if (!isObj(v)) {
    c.warn(path, "expected an object");
    return {};
  }
  return v;
}

function arr(c: Ctx, path: string, v: unknown): unknown[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) {
    c.warn(path, "expected an array");
    return [];
  }
  return v;
}

// ---------------------------------------------------------------------------

function canvasSize(c: Ctx, v: unknown): CanvasSize {
  const o = obj(c, "canvas.size", v);
  const kind = oneOf(c, "canvas.size.kind", o.kind, ["auto", "aspect", "fixed"] as const, "auto");
  const presetId = typeof o.presetId === "string" ? o.presetId : undefined;
  if (kind === "aspect") {
    return {
      kind,
      ratioW: num(c, "canvas.size.ratioW", o.ratioW, 16, 0.01, 1000),
      ratioH: num(c, "canvas.size.ratioH", o.ratioH, 9, 0.01, 1000),
      ...(presetId ? { presetId } : {}),
    };
  }
  if (kind === "fixed") {
    return {
      kind,
      width: Math.round(num(c, "canvas.size.width", o.width, 1200, 16, 16384)),
      height: Math.round(num(c, "canvas.size.height", o.height, 630, 16, 16384)),
      ...(presetId ? { presetId } : {}),
    };
  }
  return { kind: "auto" };
}

function stops(c: Ctx, path: string, v: unknown): GradientStop[] {
  const list = arr(c, path, v)
    .filter(isObj)
    .map((s, i) => ({
      offset: num(c, `${path}[${i}].offset`, s.offset, i === 0 ? 0 : 1, 0, 1),
      color: color(c, `${path}[${i}].color`, s.color, "#000000"),
    }))
    .sort((a, b) => a.offset - b.offset);
  if (list.length === 0) {
    c.warn(path, "gradient needs at least one stop");
    return [
      { offset: 0, color: "#ffffff" },
      { offset: 1, color: "#000000" },
    ];
  }
  return list.slice(0, 16);
}

function fill(c: Ctx, v: unknown): BackgroundFill {
  const p = "background.fill";
  const o = obj(c, p, v);
  const kind = oneOf(
    c,
    `${p}.kind`,
    o.kind,
    ["none", "solid", "linear", "radial", "conic", "mesh", "image", "auto"] as const,
    DEFAULT_BACKGROUND.fill.kind as "linear",
  );
  switch (kind) {
    case "none":
      return { kind };
    case "solid":
      return { kind, color: color(c, `${p}.color`, o.color, "#ffffff") };
    case "linear":
      return {
        kind,
        angle: num(c, `${p}.angle`, o.angle, 135, -3600, 3600),
        stops: stops(c, `${p}.stops`, o.stops),
      };
    case "radial":
      return {
        kind,
        cx: num(c, `${p}.cx`, o.cx, 0.5, -1, 2),
        cy: num(c, `${p}.cy`, o.cy, 0.5, -1, 2),
        radius: num(c, `${p}.radius`, o.radius, 1, 0.01, 4),
        stops: stops(c, `${p}.stops`, o.stops),
      };
    case "conic":
      return {
        kind,
        cx: num(c, `${p}.cx`, o.cx, 0.5, -1, 2),
        cy: num(c, `${p}.cy`, o.cy, 0.5, -1, 2),
        angle: num(c, `${p}.angle`, o.angle, 0, -3600, 3600),
        stops: stops(c, `${p}.stops`, o.stops),
      };
    case "mesh": {
      const points: MeshPoint[] = arr(c, `${p}.points`, o.points)
        .filter(isObj)
        .slice(0, 12)
        .map((m, i) => ({
          x: num(c, `${p}.points[${i}].x`, m.x, 0.5, -0.5, 1.5),
          y: num(c, `${p}.points[${i}].y`, m.y, 0.5, -0.5, 1.5),
          color: color(c, `${p}.points[${i}].color`, m.color, "#ffffff"),
          radius: num(c, `${p}.points[${i}].radius`, m.radius, 0.5, 0.05, 1.5),
        }));
      return { kind, base: color(c, `${p}.base`, o.base, "#ffffff"), points };
    }
    case "image":
      if (typeof o.assetId !== "string" || !o.assetId) {
        c.warn(`${p}.assetId`, "image background without asset; using solid");
        return { kind: "solid", color: "#ffffff" };
      }
      return {
        kind,
        assetId: o.assetId,
        fit: oneOf(c, `${p}.fit`, o.fit, ["cover", "contain", "stretch"] as const, "cover"),
        blur: num(c, `${p}.blur`, o.blur, 0, 0, 200),
        tint: num(c, `${p}.tint`, o.tint, 0, -1, 1),
        focusX: num(c, `${p}.focusX`, o.focusX, 0.5, 0, 1),
        focusY: num(c, `${p}.focusY`, o.focusY, 0.5, 0, 1),
      };
    case "auto":
      return {
        kind,
        style: oneOf(
          c,
          `${p}.style`,
          o.style,
          ["mesh", "linear", "radial", "solid", "soft"] as const,
          "mesh",
        ),
        variant: Math.round(num(c, `${p}.variant`, o.variant, 0, 0, 64)),
      };
  }
}

function texture(c: Ctx, v: unknown): TextureSpec | undefined {
  if (v === undefined || v === null) return undefined;
  const o = obj(c, "background.texture", v);
  return {
    kind: oneOf(
      c,
      "background.texture.kind",
      o.kind,
      ["paper", "canvas", "halftone"] as const,
      "paper",
    ),
    amount: num(c, "background.texture.amount", o.amount, 0.5, 0, 1),
    seed: Math.round(num(c, "background.texture.seed", o.seed, 1, 0, 2 ** 31)),
  };
}

function vignette(c: Ctx, v: unknown): VignetteSpec | undefined {
  if (v === undefined || v === null) return undefined;
  const o = obj(c, "background.vignette", v);
  return {
    amount: num(c, "background.vignette.amount", o.amount, 0.4, 0, 1),
    spotlight: num(c, "background.vignette.spotlight", o.spotlight, 0, 0, 1),
    color: color(c, "background.vignette.color", o.color, "#000000"),
  };
}

function background(c: Ctx, v: unknown): BackgroundSpec {
  const o = obj(c, "background", v);
  const g = obj(c, "background.grain", o.grain);
  const tex = texture(c, o.texture);
  const vig = vignette(c, o.vignette);
  const sp = obj(c, "background.span", o.span);
  const count = Math.round(num(c, "background.span.count", sp.count, 1, 1, 20));
  const span =
    o.span !== undefined && count > 1
      ? { index: Math.round(num(c, "background.span.index", sp.index, 0, 0, count - 1)), count }
      : null;
  return {
    ...(span ? { span } : {}),
    ...(tex ? { texture: tex } : {}),
    ...(vig ? { vignette: vig } : {}),
    fill: o.fill === undefined ? structuredClone(DEFAULT_BACKGROUND.fill) : fill(c, o.fill),
    grain: {
      amount: num(c, "background.grain.amount", g.amount, 0, 0, 1),
      size: num(c, "background.grain.size", g.size, 1, 1, 4),
      seed: Math.round(num(c, "background.grain.seed", g.seed, 1, 0, 2 ** 31)),
    },
  };
}

function codeTokens(c: Ctx, v: unknown): CodeTokens | null {
  if (v === undefined || v === null) return null;
  if (!isObj(v) || typeof v.key !== "string" || !Array.isArray(v.lines)) {
    c.warn("content.tokens", "malformed tokens dropped");
    return null;
  }
  const lines: [string, number][][] = [];
  for (const line of v.lines.slice(0, 2000)) {
    if (!Array.isArray(line)) return null;
    const out: [string, number][] = [];
    for (const t of line) {
      if (!Array.isArray(t) || typeof t[0] !== "string" || typeof t[1] !== "number") return null;
      out.push([t[0], Math.max(0, Math.min(63, Math.round(t[1])))]);
    }
    lines.push(out);
  }
  return {
    key: v.key.slice(0, 200),
    language: typeof v.language === "string" ? v.language.slice(0, 32) : "text",
    lines,
  };
}

function content(c: Ctx, v: unknown): Content {
  const o = obj(c, "content", v);
  const kind = oneOf(
    c,
    "content.kind",
    o.kind,
    ["image", "placeholder", "code", "post"] as const,
    "image",
  );
  if (kind === "code") {
    const highlight = arr(c, "content.highlight", o.highlight)
      .filter((n): n is number => typeof n === "number" && Number.isInteger(n) && n >= 1)
      .slice(0, 500);
    return {
      kind,
      code: str(c, "content.code", o.code, "", 50_000),
      language: str(c, "content.language", o.language, "auto", 32),
      theme: str(c, "content.theme", o.theme, "midnight-candy", 64),
      fontSize: num(c, "content.fontSize", o.fontSize, 15, 10, 32),
      lineNumbers: typeof o.lineNumbers === "boolean" ? o.lineNumbers : true,
      highlight: [...new Set(highlight)].sort((a, b) => a - b),
      title: str(c, "content.title", o.title, "", 120),
      chrome: oneOf(c, "content.chrome", o.chrome, ["mac", "minimal", "none"] as const, "mac"),
      padding: num(c, "content.padding", o.padding, 28, 8, 120),
      ...(typeof o.width === "number" && o.width > 0
        ? { width: num(c, "content.width", o.width, 0, 200, 4000) }
        : {}),
      tokens: codeTokens(c, o.tokens),
    };
  }
  if (kind === "post") return postContent(c, o);
  if (kind === "placeholder") {
    return {
      kind,
      width: num(c, "content.width", o.width, 1600, 1, 20000),
      height: num(c, "content.height", o.height, 1000, 1, 20000),
      color: color(c, "content.color", o.color, "#f4f4f5"),
    };
  }
  const assetId = typeof o.assetId === "string" && o.assetId ? o.assetId : null;
  const out: ImageContent = { kind: "image", assetId };
  if (o.tall !== undefined)
    out.tall = oneOf(c, "content.tall", o.tall, ["auto", "top", "full"] as const, "auto");
  if (o.fade !== undefined) out.fade = num(c, "content.fade", o.fade, 0.18, 0, 0.5);
  if (o.sampling !== undefined)
    out.sampling = oneOf(
      c,
      "content.sampling",
      o.sampling,
      ["auto", "smooth", "pixel"] as const,
      "auto",
    );
  if (o.clip !== undefined && o.clip !== null) {
    const cl = obj(c, "content.clip", o.clip);
    const duration = num(c, "content.clip.duration", cl.duration, 0, 0, MAX_CLIP_SECONDS);
    if (duration >= MIN_CLIP_SECONDS) {
      const start = num(c, "content.clip.start", cl.start, 0, 0, duration - MIN_CLIP_SECONDS);
      out.clip = {
        duration,
        start,
        end: num(c, "content.clip.end", cl.end, duration, start + MIN_CLIP_SECONDS, duration),
        audio: cl.audio === true,
        muted: cl.muted === true,
      };
    } else {
      c.warn("content.clip.duration", "recording without a length; clip dropped");
    }
  }
  if (o.crop !== undefined) {
    const cr = obj(c, "content.crop", o.crop);
    const x = num(c, "content.crop.x", cr.x, 0, 0, 1);
    const y = num(c, "content.crop.y", cr.y, 0, 0, 1);
    out.crop = {
      x,
      y,
      width: num(c, "content.crop.width", cr.width, 1 - x, 0.001, 1 - x),
      height: num(c, "content.crop.height", cr.height, 1 - y, 0.001, 1 - y),
    };
  }
  return out;
}

function postContent(c: Ctx, o: Obj): PostContent {
  const m = obj(c, "content.metrics", o.metrics);
  return {
    kind: "post",
    variant: oneOf(c, "content.variant", o.variant, ["social", "testimonial"] as const, "social"),
    name: str(c, "content.name", o.name, "", 80),
    handle: str(c, "content.handle", o.handle, "", 120),
    avatarAssetId: typeof o.avatarAssetId === "string" && o.avatarAssetId ? o.avatarAssetId : null,
    text: str(c, "content.text", o.text, "", 4000),
    date: str(c, "content.date", o.date, "", 60),
    theme: str(c, "content.theme", o.theme, "light", 64),
    rating: Math.round(num(c, "content.rating", o.rating, 0, 0, 5)),
    metrics: {
      replies: str(c, "content.metrics.replies", m.replies, "", 12),
      reposts: str(c, "content.metrics.reposts", m.reposts, "", 12),
      likes: str(c, "content.metrics.likes", m.likes, "", 12),
    },
    width: num(c, "content.width", o.width, 560, 320, 900),
    accent: color(c, "content.accent", o.accent, "#ff4f7b"),
  };
}

function shadowLayers(c: Ctx, v: unknown): ShadowLayer[] | undefined {
  if (v === undefined) return undefined;
  return arr(c, "card.shadow.layers", v)
    .filter(isObj)
    .slice(0, 8)
    .map((l, i) => {
      const p = `card.shadow.layers[${i}]`;
      return {
        x: num(c, `${p}.x`, l.x, 0, -1000, 1000),
        y: num(c, `${p}.y`, l.y, 0, -1000, 1000),
        blur: num(c, `${p}.blur`, l.blur, 0, 0, 1000),
        spread: num(c, `${p}.spread`, l.spread, 0, -500, 500),
        opacity: num(c, `${p}.opacity`, l.opacity, 0.2, 0, 1),
      };
    });
}

function stackSpec(c: Ctx, v: unknown): StackSpec | undefined {
  if (v === undefined || v === null) return undefined;
  const o = obj(c, "card.stack", v);
  return {
    count: Math.round(num(c, "card.stack.count", o.count, 2, 0, 3)),
    x: num(c, "card.stack.x", o.x, 0, -300, 300),
    y: num(c, "card.stack.y", o.y, -24, -300, 300),
    rotate: num(c, "card.stack.rotate", o.rotate, 0, -30, 30),
    shrink: num(c, "card.stack.shrink", o.shrink, 0.05, 0, 0.2),
    color: o.color === "auto" ? "auto" : color(c, "card.stack.color", o.color, "auto" as string),
  };
}

function reflectionSpec(c: Ctx, v: unknown): ReflectionSpec | undefined {
  if (v === undefined || v === null) return undefined;
  const o = obj(c, "card.reflection", v);
  return {
    opacity: num(c, "card.reflection.opacity", o.opacity, 0.25, 0, 1),
    height: num(c, "card.reflection.height", o.height, 0.35, 0.05, 1),
    gap: num(c, "card.reflection.gap", o.gap, 6, 0, 200),
  };
}

const ANCHOR_IDS = [
  "center",
  "top",
  "bottom",
  "left",
  "right",
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
] as const;

/** Optional composition fields of the canvas (absent stays absent). */
function composition(c: Ctx, cv: Record<string, unknown>): Partial<CanvasSpec> {
  const out: Partial<CanvasSpec> = {};
  if (cv.fit !== undefined)
    out.fit = oneOf(c, "canvas.fit", cv.fit, ["auto", "contain", "fill"] as const, "auto");
  if (cv.anchor !== undefined)
    out.anchor = oneOf(c, "canvas.anchor", cv.anchor, ANCHOR_IDS, "center");
  if (cv.bleed !== undefined) out.bleed = num(c, "canvas.bleed", cv.bleed, 0, 0, 0.7);
  if (cv.upscale !== undefined)
    out.upscale = oneOf(c, "canvas.upscale", cv.upscale, ["auto", "off"] as const, "auto");
  return out;
}

function card(c: Ctx, v: unknown): CardStyle {
  const d = DEFAULT_CARD;
  const o = obj(c, "card", v);
  const fr = obj(c, "card.frame", o.frame);
  const bo = obj(c, "card.border", o.border);
  const ins = obj(c, "card.inset", o.inset);
  const sh = obj(c, "card.shadow", o.shadow);
  const ti = obj(c, "card.tilt", o.tilt);
  const tr = obj(c, "card.transform", o.transform);
  const layers = shadowLayers(c, sh.layers);
  const stack = stackSpec(c, o.stack);
  const reflection = reflectionSpec(c, o.reflection);
  return {
    ...(stack ? { stack } : {}),
    ...(reflection ? { reflection } : {}),
    frame: {
      id: str(c, "card.frame.id", fr.id, d.frame.id, 64),
      theme: oneOf(
        c,
        "card.frame.theme",
        fr.theme,
        ["light", "dark", "auto"] as const,
        d.frame.theme,
      ),
      title: str(c, "card.frame.title", fr.title, d.frame.title, 200),
      url: str(c, "card.frame.url", fr.url, d.frame.url, 500),
      ...(fr.lights !== undefined
        ? { lights: oneOf(c, "card.frame.lights", fr.lights, ["color", "mono"] as const, "color") }
        : {}),
      ...(typeof fr.camera === "boolean" ? { camera: fr.camera } : {}),
      ...(typeof fr.sizeTag === "boolean" ? { sizeTag: fr.sizeTag } : {}),
    },
    radius: num(c, "card.radius", o.radius, d.radius, 0, 500),
    smoothing: num(c, "card.smoothing", o.smoothing, d.smoothing, 0, 1),
    border: {
      width: num(c, "card.border.width", bo.width, d.border.width, 0, 200),
      color: color(c, "card.border.color", bo.color, d.border.color),
    },
    inset: {
      width: num(c, "card.inset.width", ins.width, d.inset.width, 0, 400),
      color:
        ins.color === "auto" ? "auto" : color(c, "card.inset.color", ins.color, "auto" as string),
    },
    shadow: {
      preset: str(c, "card.shadow.preset", sh.preset, d.shadow.preset, 64),
      strength: num(c, "card.shadow.strength", sh.strength, d.shadow.strength, 0, 2),
      color: color(c, "card.shadow.color", sh.color, d.shadow.color),
      ...(layers ? { layers } : {}),
    },
    tilt: {
      rotateX: num(c, "card.tilt.rotateX", ti.rotateX, 0, -75, 75),
      rotateY: num(c, "card.tilt.rotateY", ti.rotateY, 0, -75, 75),
      rotateZ: num(c, "card.tilt.rotateZ", ti.rotateZ, 0, -180, 180),
      perspective: num(c, "card.tilt.perspective", ti.perspective, d.tilt.perspective, 1.2, 10),
    },
    transform: {
      scale: num(c, "card.transform.scale", tr.scale, 1, 0.2, 2),
      offsetX: num(c, "card.transform.offsetX", tr.offsetX, 0, -0.5, 0.5),
      offsetY: num(c, "card.transform.offsetY", tr.offsetY, 0, -0.5, 0.5),
    },
  };
}

function animation(c: Ctx, v: unknown): AnimationSpec | undefined {
  if (v === undefined || v === null) return undefined;
  const o = obj(c, "animation", v);
  if (typeof o.preset !== "string" || !o.preset) {
    c.warn("animation.preset", "missing motion preset; animation dropped");
    return undefined;
  }
  return {
    preset: o.preset.slice(0, 64),
    duration: num(c, "animation.duration", o.duration, 3, 1, 20),
    fps: Math.round(num(c, "animation.fps", o.fps, 30, 10, 60)),
    easing: oneOf(
      c,
      "animation.easing",
      o.easing,
      ["smooth", "snappy", "gentle", "bounce", "linear"] as const,
      "smooth",
    ),
    loop: oneOf(c, "animation.loop", o.loop, ["once", "boomerang"] as const, "once"),
    intensity: num(c, "animation.intensity", o.intensity, 1, 0.25, 2),
    annotations: typeof o.annotations === "boolean" ? o.annotations : true,
    focusX: num(c, "animation.focusX", o.focusX, 0.5, 0, 1),
    focusY: num(c, "animation.focusY", o.focusY, 0.5, 0, 1),
  };
}

function annotation(c: Ctx, v: unknown, i: number): Annotation | null {
  const p = `annotations[${i}]`;
  if (!isObj(v)) {
    c.warn(p, "expected an object");
    return null;
  }
  const id = typeof v.id === "string" && v.id ? v.id.slice(0, 64) : `a${i}`;
  const anchor = oneOf(c, `${p}.anchor`, v.anchor, ["content", "canvas"] as const, "content");
  const pos = (k: string, def: number) => num(c, `${p}.${k}`, v[k], def, -2, 3);
  switch (v.kind) {
    case "text":
      return {
        id,
        kind: "text",
        anchor,
        x: pos("x", 0.5),
        y: pos("y", 0.5),
        text: str(c, `${p}.text`, v.text, "", 2000),
        font: str(c, `${p}.font`, v.font, "sans", 64),
        size: num(c, `${p}.size`, v.size, 48, 4, 1000),
        weight: Math.round(num(c, `${p}.weight`, v.weight, 700, 100, 900) / 100) * 100,
        color: color(c, `${p}.color`, v.color, "#111111"),
        align: oneOf(c, `${p}.align`, v.align, ["left", "center", "right"] as const, "center"),
        background:
          v.background === null || v.background === undefined
            ? null
            : color(c, `${p}.background`, v.background, "#ffffff"),
      };
    case "arrow":
      return {
        id,
        kind: "arrow",
        anchor,
        x1: pos("x1", 0.3),
        y1: pos("y1", 0.3),
        x2: pos("x2", 0.6),
        y2: pos("y2", 0.6),
        color: color(c, `${p}.color`, v.color, "#ff3b30"),
        width: num(c, `${p}.width`, v.width, 8, 0.5, 200),
        curve: num(c, `${p}.curve`, v.curve, 0, -1, 1),
        head: oneOf(c, `${p}.head`, v.head, ["triangle", "line", "none"] as const, "triangle"),
      };
    case "rect":
      return {
        id,
        kind: "rect",
        anchor,
        x: pos("x", 0.3),
        y: pos("y", 0.3),
        w: num(c, `${p}.w`, v.w, 0.3, 0, 4),
        h: num(c, `${p}.h`, v.h, 0.2, 0, 4),
        style: oneOf(
          c,
          `${p}.style`,
          v.style,
          ["outline", "fill", "spotlight"] as const,
          "outline",
        ),
        color: color(c, `${p}.color`, v.color, "#ff3b30"),
        width: num(c, `${p}.width`, v.width, 6, 0, 200),
        radius: num(c, `${p}.radius`, v.radius, 8, 0, 500),
      };
    case "redact":
      return {
        id,
        kind: "redact",
        anchor: "content",
        x: pos("x", 0.3),
        y: pos("y", 0.3),
        w: num(c, `${p}.w`, v.w, 0.3, 0, 4),
        h: num(c, `${p}.h`, v.h, 0.1, 0, 4),
        mode: oneOf(c, `${p}.mode`, v.mode, ["blur", "pixelate"] as const, "blur"),
        strength: num(c, `${p}.strength`, v.strength, 12, 1, 200),
      };
    default:
      c.warn(p, `unknown annotation kind ${JSON.stringify(v.kind)}; dropped`);
      return null;
  }
}

/**
 * Validate and normalize an already-migrated (current version) scene object.
 * Use `loadScene` (scene/migrate.ts) for data of unknown version.
 */
function caption(c: Ctx, v: unknown): CaptionSpec | undefined {
  if (v === undefined || v === null) return undefined;
  const o = obj(c, "caption", v);
  return {
    enabled: o.enabled === true,
    headline: str(c, "caption.headline", o.headline, "", 200),
    subhead: str(c, "caption.subhead", o.subhead, "", 300),
    font: oneOf(c, "caption.font", o.font, ["display", "sans"] as const, "display"),
    align: oneOf(c, "caption.align", o.align, ["center", "left"] as const, "center"),
    color:
      o.color === "auto" || o.color === undefined
        ? "auto"
        : color(c, "caption.color", o.color, "#2a1f1a"),
    size: num(c, "caption.size", o.size, 1, 0.7, 1.4),
  };
}

export function normalizeScene(input: unknown): NormalizeResult {
  const c = new Ctx();
  if (!isObj(input)) {
    c.warn("scene", "expected an object; using a blank scene");
    return { scene: createScene(), issues: c.issues };
  }
  if (input.version !== undefined && input.version !== SCENE_VERSION) {
    c.warn("version", `expected ${SCENE_VERSION}, got ${JSON.stringify(input.version)}`);
  }
  const cv = obj(c, "canvas", input.canvas);
  const meta = obj(c, "meta", input.meta);
  const ids = new Set<string>();
  const annotations = arr(c, "annotations", input.annotations)
    .slice(0, 200)
    .map((a, i) => annotation(c, a, i))
    .filter((a): a is Annotation => a !== null)
    .map((a) => {
      // Ids must be unique for editing; suffix duplicates deterministically.
      let id = a.id;
      let n = 2;
      while (ids.has(id)) id = `${a.id}-${n++}`;
      ids.add(id);
      return id === a.id ? a : { ...a, id };
    });
  const scene: Scene = {
    version: SCENE_VERSION,
    canvas: {
      size: canvasSize(c, cv.size),
      padding: num(c, "canvas.padding", cv.padding, 80, 0, 2000),
      ...composition(c, cv),
    },
    background: background(c, input.background),
    content: content(c, input.content),
    card: card(c, input.card),
    annotations,
    meta: {
      name: str(c, "meta.name", meta.name, "shotcandy", 200),
      ...(typeof meta.stylePresetId === "string" ? { stylePresetId: meta.stylePresetId } : {}),
    },
  };
  const anim = animation(c, input.animation);
  if (anim) scene.animation = anim;
  const cap = caption(c, input.caption);
  if (cap) scene.caption = cap;
  return { scene, issues: c.issues };
}
