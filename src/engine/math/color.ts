/**
 * Colour utilities. Scene colours are stored as normalized hex strings
 * (`#rrggbb` or `#rrggbbaa`), which keeps scenes diffable and parsing trivial.
 * Perceptual work (palette extraction, gradient mixing) happens in OKLab.
 */

export interface RGBA {
  /** 0..255 */
  r: number;
  g: number;
  b: number;
  /** 0..1 */
  a: number;
}

export interface OKLab {
  L: number;
  a: number;
  b: number;
}

export interface OKLCH {
  L: number;
  C: number;
  /** degrees 0..360 */
  h: number;
}

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB_RE =
  /^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/i;

export function isColor(value: unknown): value is string {
  return typeof value === "string" && (HEX_RE.test(value.trim()) || RGB_RE.test(value.trim()));
}

/** Parse `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()` or `rgba()`. Throws on anything else. */
export function parseColor(input: string): RGBA {
  const s = input.trim();
  const hex = HEX_RE.exec(s);
  if (hex) {
    let h = hex[1]!;
    if (h.length <= 4) {
      h = h
        .split("")
        .map((c) => c + c)
        .join("");
    }
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return { r, g, b, a };
  }
  const rgb = RGB_RE.exec(s);
  if (rgb) {
    const alphaRaw = rgb[4];
    let a = 1;
    if (alphaRaw !== undefined) {
      a = alphaRaw.endsWith("%") ? parseFloat(alphaRaw) / 100 : parseFloat(alphaRaw);
    }
    return {
      r: clamp255(parseFloat(rgb[1]!)),
      g: clamp255(parseFloat(rgb[2]!)),
      b: clamp255(parseFloat(rgb[3]!)),
      a: clamp01(a),
    };
  }
  throw new Error(`Invalid colour: ${input}`);
}

/** Normalize any accepted colour to lowercase `#rrggbb` (opaque) or `#rrggbbaa`. */
export function normalizeColor(input: string): string {
  return toHex(parseColor(input));
}

export function toHex(c: RGBA): string {
  const h = (n: number) => Math.round(clamp255(n)).toString(16).padStart(2, "0");
  const base = `#${h(c.r)}${h(c.g)}${h(c.b)}`;
  const a = Math.round(clamp01(c.a) * 255);
  return a === 255 ? base : `${base}${a.toString(16).padStart(2, "0")}`;
}

/** CSS string suitable for canvas fillStyle; `alpha` multiplies the colour's own alpha. */
export function toCss(color: string | RGBA, alpha = 1): string {
  const c = typeof color === "string" ? parseColor(color) : color;
  const a = clamp01(c.a * alpha);
  return `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${roundTo(a, 4)})`;
}

export function withAlpha(color: string, alpha: number): string {
  const c = parseColor(color);
  return toHex({ ...c, a: clamp01(alpha) });
}

// ---------------------------------------------------------------------------
// sRGB <-> linear <-> OKLab (Björn Ottosson, https://bottosson.github.io/posts/oklab/)
// ---------------------------------------------------------------------------

/** 256-entry lookup table: sRGB byte -> linear light. */
const SRGB_TO_LINEAR = /* @__PURE__ */ (() => {
  const t = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    t[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  return t;
})();

export function srgbByteToLinear(v: number): number {
  return SRGB_TO_LINEAR[Math.max(0, Math.min(255, Math.round(v)))]!;
}

export function linearToSrgbByte(v: number): number {
  const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(v, 0), 1 / 2.4) - 0.055;
  return clamp255(c * 255);
}

export function rgbToOklab(r: number, g: number, b: number): OKLab {
  const lr = srgbByteToLinear(r);
  const lg = srgbByteToLinear(g);
  const lb = srgbByteToLinear(b);
  return linearRgbToOklab(lr, lg, lb);
}

export function linearRgbToOklab(lr: number, lg: number, lb: number): OKLab {
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

export function oklabToLinearRgb(lab: OKLab): [number, number, number] {
  const l_ = lab.L + 0.3963377774 * lab.a + 0.2158037573 * lab.b;
  const m_ = lab.L - 0.1055613458 * lab.a - 0.0638541728 * lab.b;
  const s_ = lab.L - 0.0894841775 * lab.a - 1.291485548 * lab.b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

export function oklabToRgb(lab: OKLab, alpha = 1): RGBA {
  const [r, g, b] = oklabToLinearRgb(lab);
  return { r: linearToSrgbByte(r), g: linearToSrgbByte(g), b: linearToSrgbByte(b), a: alpha };
}

export function oklabToOklch(lab: OKLab): OKLCH {
  const C = Math.hypot(lab.a, lab.b);
  let h = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { L: lab.L, C, h };
}

export function oklchToOklab(lch: OKLCH): OKLab {
  const rad = (lch.h * Math.PI) / 180;
  return { L: lch.L, a: lch.C * Math.cos(rad), b: lch.C * Math.sin(rad) };
}

export function colorToOklch(color: string): OKLCH {
  const c = parseColor(color);
  return oklabToOklch(rgbToOklab(c.r, c.g, c.b));
}

/** Whether a linear-light RGB triple lies inside the sRGB gamut (with tolerance). */
function inGamut([r, g, b]: [number, number, number], eps = 1e-4): boolean {
  return r >= -eps && r <= 1 + eps && g >= -eps && g <= 1 + eps && b >= -eps && b <= 1 + eps;
}

/** OKLCH -> hex, reducing chroma (binary search) until the colour fits sRGB. */
export function oklchToHex(lch: OKLCH, alpha = 1): string {
  let lo = 0;
  let hi = lch.C;
  let lab = oklchToOklab(lch);
  if (!inGamut(oklabToLinearRgb(lab))) {
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      lab = oklchToOklab({ ...lch, C: mid });
      if (inGamut(oklabToLinearRgb(lab))) lo = mid;
      else hi = mid;
    }
    lab = oklchToOklab({ ...lch, C: lo });
  }
  return toHex(oklabToRgb(lab, alpha));
}

/** Perceptual mix in OKLab. `t` = 0 returns `a`, 1 returns `b`. */
export function mixColors(a: string, b: string, t: number): string {
  const ca = parseColor(a);
  const cb = parseColor(b);
  const la = rgbToOklab(ca.r, ca.g, ca.b);
  const lb = rgbToOklab(cb.r, cb.g, cb.b);
  const lab = {
    L: la.L + (lb.L - la.L) * t,
    a: la.a + (lb.a - la.a) * t,
    b: la.b + (lb.b - la.b) * t,
  };
  return toHex(oklabToRgb(lab, ca.a + (cb.a - ca.a) * t));
}

/** Euclidean distance in OKLab (a good perceptual difference metric; ~0.02 is a just-noticeable difference). */
export function deltaE(a: OKLab, b: OKLab): number {
  return Math.sqrt((a.L - b.L) ** 2 + (a.a - b.a) ** 2 + (a.b - b.b) ** 2);
}

/** WCAG relative luminance, 0..1. */
export function relativeLuminance(color: string | RGBA): number {
  const c = typeof color === "string" ? parseColor(color) : color;
  return (
    0.2126 * srgbByteToLinear(c.r) + 0.7152 * srgbByteToLinear(c.g) + 0.0722 * srgbByteToLinear(c.b)
  );
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export function isDark(color: string): boolean {
  return colorToOklch(color).L < 0.6;
}

function clamp255(n: number): number {
  return n < 0 ? 0 : n > 255 ? 255 : n;
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function roundTo(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
