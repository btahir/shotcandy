/**
 * Post card themes and styles. Neutral, original designs: a "social post"
 * and a "testimonial" card, with no platform logos or look-alike UI.
 */
import { getBackgroundPreset } from "../presets/backgrounds";
import type { PostContent, StylePatch } from "../scene/types";

export interface PostTheme {
  id: string;
  label: string;
  dark: boolean;
  bg: string;
  text: string;
  muted: string;
  line: string;
  /** Star colour for ratings. */
  star: string;
}

export const POST_THEMES: PostTheme[] = [
  {
    id: "light",
    label: "Light",
    dark: false,
    bg: "#ffffff",
    text: "#231a15",
    muted: "#7b6b60",
    line: "#2a1f1a14",
    star: "#ffb020",
  },
  {
    id: "cream",
    label: "Cream",
    dark: false,
    bg: "#fff9f0",
    text: "#2a1f1a",
    muted: "#85705f",
    line: "#2a1f1a14",
    star: "#f59e0b",
  },
  {
    id: "candy",
    label: "Candy",
    dark: false,
    bg: "#fff0f4",
    text: "#3a1622",
    muted: "#9a5a6c",
    line: "#9a1a4018",
    star: "#ff4f7b",
  },
  {
    id: "dark",
    label: "Dark",
    dark: true,
    bg: "#1a1512",
    text: "#f7eee6",
    muted: "#a8968a",
    line: "#ffffff16",
    star: "#ffd84d",
  },
  {
    id: "midnight",
    label: "Midnight",
    dark: true,
    bg: "#1b1630",
    text: "#f1ecff",
    muted: "#a59bc4",
    line: "#ffffff16",
    star: "#ffd84d",
  },
];

const byId = new Map(POST_THEMES.map((t) => [t.id, t]));

export function getPostTheme(id: string): PostTheme {
  return byId.get(id) ?? POST_THEMES[0]!;
}

export interface PostStyle {
  id: string;
  name: string;
  theme: string;
  accent: string;
  patch: StylePatch;
}

function patch(backgroundId: string, radius = 26): StylePatch {
  const bg = getBackgroundPreset(backgroundId);
  return {
    canvas: { padding: 88 },
    background: bg
      ? { fill: bg.fill, grain: { amount: bg.grain.amount } }
      : { fill: { kind: "solid", color: "#fff1e6" } },
    card: {
      frame: { id: "none" },
      radius,
      smoothing: 0.6,
      border: { width: 0 },
      inset: { width: 0 },
      shadow: { preset: "float", strength: 1 },
      tilt: { rotateX: 0, rotateY: 0, rotateZ: 0 },
      transform: { scale: 1, offsetX: 0, offsetY: 0 },
    },
  };
}

export const POST_STYLES: PostStyle[] = [
  {
    id: "post-sherbet",
    name: "Sherbet",
    theme: "light",
    accent: "#e0306a",
    patch: patch("sherbet"),
  },
  {
    id: "post-cream",
    name: "Cream",
    theme: "cream",
    accent: "#c25a0a",
    patch: patch("peach-fizz"),
  },
  { id: "post-mint", name: "Mint", theme: "light", accent: "#0f8a63", patch: patch("mint-julep") },
  {
    id: "post-candy",
    name: "Candy",
    theme: "candy",
    accent: "#d42a5f",
    patch: patch("cotton-candy"),
  },
  {
    id: "post-midnight",
    name: "Midnight",
    theme: "midnight",
    accent: "#ff8fab",
    patch: patch("grape-soda"),
  },
  {
    id: "post-licorice",
    name: "Licorice",
    theme: "dark",
    accent: "#ffc08a",
    patch: patch("licorice-gradient"),
  },
];

export function getPostStyle(id: string): PostStyle | undefined {
  return POST_STYLES.find((s) => s.id === id);
}

export function samplePost(variant: PostContent["variant"]): PostContent {
  return variant === "testimonial"
    ? {
        kind: "post",
        variant,
        name: "Maya Chen",
        handle: "Head of Design, Harbor Labs",
        avatarAssetId: null,
        text: "We used to spend an afternoon making launch screenshots. Now it takes a coffee break, and they look better than anything we made by hand.",
        date: "",
        theme: "light",
        rating: 5,
        metrics: { replies: "", reposts: "", likes: "" },
        width: 560,
        accent: "#e0306a",
      }
    : {
        kind: "post",
        variant,
        name: "Maya Chen",
        handle: "@mayamakes",
        avatarAssetId: null,
        text: "Shipped the new onboarding today. Paste a screenshot, pick a style, done. The before and after is honestly a little embarrassing #buildinpublic",
        date: "Sep 26",
        theme: "light",
        rating: 0,
        metrics: { replies: "24", reposts: "118", likes: "1.2K" },
        width: 560,
        accent: "#e0306a",
      };
}
