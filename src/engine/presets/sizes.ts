/**
 * Canvas size presets. Social and store dimensions were verified against each
 * platform's official documentation on 2026-09-26; the source URL for every
 * preset is kept alongside it (and in PLAN.md) so they can be re-checked.
 */
import type { CanvasSize } from "../scene/types";

export type SizeGroup = "free" | "ratio" | "social" | "appstore";

export interface SizePreset {
  id: string;
  label: string;
  group: SizeGroup;
  size: CanvasSize;
  /** Short hint shown in the picker, e.g. "1200 × 630". */
  hint: string;
  source?: string;
}

const fixed = (
  id: string,
  label: string,
  group: SizeGroup,
  width: number,
  height: number,
  source?: string,
): SizePreset => ({
  id,
  label,
  group,
  size: { kind: "fixed", width, height, presetId: id },
  hint: `${width} × ${height}`,
  ...(source ? { source } : {}),
});

const ratio = (id: string, label: string, w: number, h: number): SizePreset => ({
  id,
  label,
  group: "ratio",
  size: { kind: "aspect", ratioW: w, ratioH: h, presetId: id },
  hint: `${w}:${h}`,
});

const META_SHARING = "https://developers.facebook.com/docs/sharing/webmasters/images/";
const X_CARDS =
  "https://developer.x.com/en/docs/x-for-websites/cards/overview/summary-card-with-large-image";
const X_ADS = "https://business.x.com/en/help/campaign-setup/creative-ad-specifications";
const LINKEDIN =
  "https://business.linkedin.com/marketing-solutions/success/ads-guide/single-image-ads";
const INSTAGRAM = "https://www.facebook.com/business/ads-guide/update/image/instagram-feed";
const INSTAGRAM_STORY = "https://www.facebook.com/business/ads-guide/update/image/instagram-story";
const APP_STORE =
  "https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/";

export const SIZE_PRESETS: readonly SizePreset[] = [
  { id: "auto", label: "Auto", group: "free", size: { kind: "auto" }, hint: "Fits the screenshot" },
  ratio("16x9", "16:9", 16, 9),
  ratio("4x3", "4:3", 4, 3),
  ratio("1x1", "1:1", 1, 1),
  ratio("4x5", "4:5", 4, 5),
  ratio("9x16", "9:16", 9, 16),
  fixed("og", "Open Graph", "social", 1200, 630, META_SHARING),
  fixed("x-post", "X post", "social", 1600, 900, X_ADS),
  fixed("x-card", "X link card", "social", 1200, 600, X_CARDS),
  fixed("linkedin-post", "LinkedIn post", "social", 1200, 627, LINKEDIN),
  fixed("linkedin-square", "LinkedIn square", "social", 1200, 1200, LINKEDIN),
  fixed("instagram-square", "Instagram square", "social", 1080, 1080, INSTAGRAM),
  fixed("instagram-portrait", "Instagram portrait", "social", 1080, 1350, INSTAGRAM),
  fixed("instagram-story", "Instagram story", "social", 1080, 1920, INSTAGRAM_STORY),
  fixed("appstore-iphone-69", 'iPhone 6.9"', "appstore", 1320, 2868, APP_STORE),
  fixed("appstore-iphone-65", 'iPhone 6.5"', "appstore", 1284, 2778, APP_STORE),
  fixed("appstore-iphone-55", 'iPhone 5.5"', "appstore", 1242, 2208, APP_STORE),
  fixed("appstore-ipad-13", 'iPad 13"', "appstore", 2064, 2752, APP_STORE),
  fixed("appstore-ipad-129", 'iPad 12.9"', "appstore", 2048, 2732, APP_STORE),
];

export function getSizePreset(id: string): SizePreset | undefined {
  return SIZE_PRESETS.find((p) => p.id === id);
}

/** Landscape variant of a portrait preset (App Store accepts both orientations). */
export function rotateSize(size: CanvasSize): CanvasSize {
  if (size.kind === "fixed") return { ...size, width: size.height, height: size.width };
  if (size.kind === "aspect") return { ...size, ratioW: size.ratioH, ratioH: size.ratioW };
  return size;
}
