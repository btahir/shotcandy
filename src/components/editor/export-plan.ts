/**
 * Export planning: which scale, format and size an export uses, and whether it
 * fits where it's going. Pure functions (no DOM), unit tested.
 *
 * - "Auto" scale: 1x whenever the screenshot is already drawn at (or above)
 *   its native pixels, which is every auto-size canvas and every fixed social
 *   size; 2x for text content (code, posts) and for screenshots drawn below
 *   native size in a ratio canvas.
 * - Destinations pick format, scale and size limits for a place (X, LinkedIn,
 *   Instagram, Product Hunt, a README, chat) and report the platform's limit.
 * - Copy is capped at 4096 px on the long side so a paste stays light and
 *   sharp; the full size is one click away.
 */
import type { ExportFormat, SceneLayout } from "@/engine";

export type DestinationId =
  "original" | "x" | "linkedin" | "instagram" | "producthunt" | "readme" | "chat";

export interface Destination {
  id: DestinationId;
  label: string;
  /** Short name for the Export button tag. */
  short: string;
  /** One line on what it does. */
  blurb: string;
  /** "auto": PNG, switching to JPEG only when PNG would break the size limit. */
  format: ExportFormat | "auto";
  quality: number;
  /** Longest output side. */
  maxLong?: number;
  /** Exact output width (Instagram resizes everything to 1080 wide). */
  width?: number;
  /** File size limit, with how to say it ("X's 5 MB"). */
  limitBytes?: number;
  limitLabel?: string;
  /** Aspect ratios (w/h) the platform shows uncropped, and the size preset that fits. */
  ratio?: { min: number; max: number; fix: string; fixLabel: string };
  source?: string;
}

const MB = 1024 * 1024;

/** Sources checked 2026-09-26 (PLAN.md §14–15; Product Hunt help centre). */
export const DESTINATIONS: readonly Destination[] = [
  {
    id: "original",
    label: "Original",
    short: "",
    blurb: "Full quality at the scale you pick.",
    format: "png",
    quality: 0.92,
  },
  {
    id: "x",
    label: "X",
    short: "X",
    blurb: "PNG up to 4096 px; JPEG only if PNG would pass 5 MB.",
    format: "auto",
    quality: 0.9,
    maxLong: 4096,
    limitBytes: 5 * MB,
    limitLabel: "X’s 5 MB",
    source: "https://business.x.com/en/help/campaign-setup/creative-ad-specifications",
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    short: "LinkedIn",
    blurb: "PNG up to 4096 px; JPEG only if PNG would pass 5 MB.",
    format: "auto",
    quality: 0.9,
    maxLong: 4096,
    limitBytes: 5 * MB,
    limitLabel: "LinkedIn’s 5 MB",
    source: "https://www.linkedin.com/help/lms/answer/a426534",
  },
  {
    id: "instagram",
    label: "Instagram",
    short: "Insta",
    blurb: "JPEG at 1080 px wide, the width Instagram keeps.",
    format: "jpeg",
    quality: 0.92,
    width: 1080,
    ratio: { min: 3 / 4, max: 1.91, fix: "instagram-portrait", fixLabel: "Use 4:5" },
    source: "https://help.instagram.com/1631821640426723",
  },
  {
    id: "producthunt",
    label: "Product Hunt",
    short: "PH",
    blurb: "PNG at 2× the 1270 × 760 gallery size.",
    format: "png",
    quality: 0.92,
    maxLong: 2540,
    ratio: { min: 1.6, max: 1.74, fix: "producthunt", fixLabel: "Use 1270 × 760" },
    source: "https://help.producthunt.com/en/articles/479557-how-to-post-a-product",
  },
  {
    id: "readme",
    label: "README",
    short: "README",
    blurb: "PNG up to 2000 px, sharp in a GitHub README; 10 MB limit.",
    format: "png",
    quality: 0.92,
    maxLong: 2000,
    limitBytes: 10 * MB,
    limitLabel: "GitHub’s 10 MB",
    source:
      "https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/attaching-files",
  },
  {
    id: "chat",
    label: "Slack & docs",
    short: "Chat",
    blurb: "PNG up to 2400 px: crisp, light, pastes anywhere.",
    format: "png",
    quality: 0.92,
    maxLong: 2400,
  },
];

export function getDestination(id: string | undefined): Destination {
  return DESTINATIONS.find((d) => d.id === id) ?? DESTINATIONS[0]!;
}

/** Longest side of a default Copy. */
export const COPY_MAX_LONG = 4096;

export type ScaleChoice = 0 | 1 | 2 | 3 | 4;

export interface PlanInput {
  /** Canvas size at 1x. */
  width: number;
  height: number;
  /** Screenshot pixels drawn per source pixel at 1x (null for non-image content). */
  drawRatio: number | null;
  /** Fixed canvases are exact sizes: 1x is the requested output. */
  fixed: boolean;
  /** Largest scale the browser's canvas allows (below 1 when even 1x is too big). */
  maxScale: number;
}

export interface ExportPlan {
  scale: number;
  width: number;
  height: number;
  format: ExportFormat;
  quality: number;
  /** The long-side cap made the output smaller than the chosen scale. */
  capped: boolean;
  /** "auto" scale resolved to this whole number. */
  autoScale: number | null;
}

/** Screenshot pixels per source pixel at 1x (1 = native). */
export function drawRatio(layout: SceneLayout, isImage: boolean): number | null {
  if (!isImage) return null;
  const src = layout.contentPixels.width;
  if (!src) return null;
  return (layout.card.content.width * layout.k) / src;
}

/** Largest useful scale for a destination: retina for text, never beyond native for screenshots. */
export function destinationScale(drawRatio: number | null): number {
  if (drawRatio === null) return 2;
  return Math.min(2, Math.max(1, 1 / Math.max(0.01, drawRatio)));
}

/** Largest scale the platform allows: 1x or more, or below 1 when even 1x is too big. */
function scaleCap(input: PlanInput): number {
  return input.maxScale > 0 ? input.maxScale : 1;
}

/** The whole-number scale "Auto" means for this canvas (below 1 only when 1x can't fit). */
export function autoScale(input: PlanInput): number {
  const max = scaleCap(input);
  let s: number;
  if (input.drawRatio === null)
    s = 2; // code, posts: text wants retina pixels
  else if (input.fixed || input.drawRatio >= 0.99) s = 1;
  else s = Math.min(2, Math.ceil(1 / Math.max(0.01, input.drawRatio)));
  return Math.min(s, max);
}

export function planExport(
  input: PlanInput,
  opts: {
    scale: ScaleChoice;
    format: ExportFormat;
    quality: number;
    destination?: DestinationId;
    /** Longest side cap (Copy). */
    maxLong?: number;
  },
): ExportPlan {
  const dest = getDestination(opts.destination);
  const auto = dest.id === "original" && opts.scale !== 0 ? null : autoScale(input);
  let scale = dest.id === "original" && opts.scale !== 0 ? opts.scale : auto!;
  scale = Math.min(scale, scaleCap(input));
  const long = Math.max(input.width, input.height);
  let capped = false;
  if (dest.width) {
    scale = dest.width / input.width;
  } else if (dest.id !== "original") {
    // Destinations never go past the screenshot's own pixels: 1x when it is
    // drawn at native size, up to 2x when drawn smaller; 2x for code and posts
    // (text, no source pixels). Then the platform's cap (REVIEW r2 N1).
    scale = Math.min(destinationScale(input.drawRatio), scaleCap(input));
    if (dest.maxLong && long * scale > dest.maxLong) {
      scale = dest.maxLong / long;
      capped = true;
    }
  }
  if (opts.maxLong && long * scale > opts.maxLong) {
    scale = opts.maxLong / long;
    capped = true;
  }
  // Snap to whole pixels on the long side.
  scale = Math.max(0.01, Math.round(long * scale) / long);
  const format: ExportFormat =
    dest.id === "original" ? opts.format : dest.format === "auto" ? "png" : dest.format;
  return {
    scale,
    width: Math.round(input.width * scale),
    height: Math.round(input.height * scale),
    format,
    quality: dest.id === "original" ? opts.quality : dest.quality,
    capped,
    autoScale: auto,
  };
}

export type FitVerdict =
  | { kind: "none" }
  | { kind: "fits"; label: string }
  | { kind: "switch"; label: string }
  | { kind: "over"; label: string };

/**
 * How a file sits against a destination's limit. `bytes` and `format` are
 * what will actually be saved (the export popover encodes the real file);
 * `fitted` says the PNG didn't fit and the export switched to JPEG or shrank.
 */
export function fitVerdict(
  dest: Destination,
  bytes: number | null,
  format: ExportFormat,
  fitted = false,
): FitVerdict {
  if (!dest.limitBytes || !dest.limitLabel || bytes === null) return { kind: "none" };
  if (bytes > dest.limitBytes) return { kind: "over", label: `over ${dest.limitLabel}` };
  if (fitted)
    return {
      kind: "switch",
      label:
        format === "jpeg"
          ? `JPEG to fit ${dest.limitLabel}`
          : `made smaller to fit ${dest.limitLabel}`,
    };
  return { kind: "fits", label: `fits ${dest.limitLabel}` };
}

/** Whether the canvas ratio shows uncropped at the destination. */
export function ratioOk(dest: Destination, width: number, height: number): boolean {
  if (!dest.ratio) return true;
  const r = width / height;
  return r >= dest.ratio.min - 0.005 && r <= dest.ratio.max + 0.005;
}

/**
 * Settings for the retry when a file is over the limit: JPEG first (if the
 * destination allows it), then lower quality, then fewer pixels.
 */
export function nextAttempt(
  prev: { format: ExportFormat; quality: number; scale: number },
  bytes: number,
  limit: number,
  allowJpeg: boolean,
): { format: ExportFormat; quality: number; scale: number } {
  if (prev.format === "png" && allowJpeg)
    return { format: "jpeg", quality: 0.9, scale: prev.scale };
  if (prev.format !== "png" && prev.quality > 0.8)
    return { ...prev, quality: Math.round((prev.quality - 0.08) * 100) / 100 };
  const shrink = Math.sqrt(limit / bytes) * 0.92;
  return { ...prev, scale: prev.scale * Math.min(0.9, shrink) };
}

/** "PNG · 1×" style tag for the Export button. */
export function exportTag(plan: ExportPlan, dest: Destination, scaleChoice: ScaleChoice): string {
  const fmt = plan.format === "jpeg" ? "JPG" : plan.format.toUpperCase();
  if (dest.id !== "original") return `${dest.short} · ${fmt}`;
  // Too big for this browser's canvas even at 1x: say the size it will be.
  if (plan.scale < 0.995) return `${fmt} · ${plan.width} × ${plan.height}`;
  if (scaleChoice === 0) return `${fmt} · Auto ${plan.autoScale ?? 1}×`;
  return `${fmt} · ${scaleChoice}×`;
}
