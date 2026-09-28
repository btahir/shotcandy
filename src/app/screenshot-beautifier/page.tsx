import type { Metadata } from "next";
import { ToolLanding, type ToolPageData } from "@/components/site/ToolLanding";
import { STYLE_PRESETS } from "@/engine/presets/styles";

const TITLE = "Screenshot beautifier — free, private, in your browser";
const DESC =
  "Turn a plain screenshot into a share-ready image: gradient and mesh backgrounds, colours from your own shot, shadows, frames and exact social sizes. No sign-up, no upload.";

export const metadata: Metadata = {
  title: { absolute: `${TITLE} · Shotcandy` },
  description: DESC,
  alternates: { canonical: "/screenshot-beautifier/" },
  openGraph: {
    title: TITLE,
    description: DESC,
    url: "/screenshot-beautifier/",
    images: [{ url: "/og/screenshot-beautifier.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESC,
    images: ["/og/screenshot-beautifier.png"],
  },
};

const d: ToolPageData = {
  slug: "screenshot-beautifier",
  crumb: "Screenshot beautifier",
  h1: (
    <>
      The free <em>screenshot beautifier</em> that stays in your browser
    </>
  ),
  lede: "Drop in a screenshot and it comes out ready to share: a background picked from your own colours, soft shadows, rounded corners and the right size for every network.",
  style: "tangerine",
  frameLabel: "style",
  hero: {
    src: "/showcase/beautifier-hero.webp",
    alt: "A landing page screenshot on a tangerine gradient with a deep shadow",
    pills: ["Tangerine Dream", "Auto size", "Deep shadow"],
    width: 1100,
    height: 756,
  },
  steps: [
    ["Paste", "Copy a screenshot and press ⌘V (Ctrl+V), drop a file, or pick one."],
    [
      "Pick a style",
      `Every one of the ${STYLE_PRESETS.length} styles previews on your own screenshot: tilts, peeks, stacks, prints and devices. Tweak background, padding, corners and shadow.`,
    ],
    [
      "Export",
      "Copy to clipboard or download PNG, JPEG or WebP up to 4×, sized for X, LinkedIn, Instagram or the App Store.",
    ],
  ],
  examples: [
    {
      src: "/showcase/beautifier-1.webp",
      name: "From Your Shot",
      note: "colours from your image",
      width: 720,
      height: 540,
    },
    {
      src: "/showcase/beautifier-2.webp",
      name: "Cotton Candy",
      note: "pastel gradient",
      width: 720,
      height: 540,
    },
    {
      src: "/showcase/beautifier-3.webp",
      name: "Sorbet Phone",
      note: "phone frame",
      width: 720,
      height: 540,
    },
  ],
  faq: [
    [
      "What does a screenshot beautifier do?",
      "It places your screenshot on a designed background with padding, rounded corners and a shadow, optionally inside a window or device frame, so it looks polished in posts, docs and slides.",
    ],
    [
      "Is it really free?",
      "Yes. Every feature is free and there is no watermark. Shotcandy is open source under the MIT license.",
    ],
    [
      "Are my screenshots uploaded anywhere?",
      "No. Everything happens in your browser tab. There is no server and no account.",
    ],
    [
      "Does it work with screen recordings?",
      "Yes. Drop in an MP4, MOV or WebM recording and it gets the same styles. Trim it, keep or drop the sound, and export MP4, WebM or GIF, all in your browser.",
    ],
    [
      "Which sizes can I export?",
      "Auto (your screenshot's own resolution), common ratios, Open Graph, X, LinkedIn, Instagram posts and stories, and App Store screenshot sizes, at 1× to 4×.",
    ],
  ],
  related: [
    { label: "macOS window frame", href: "/macos-window-frame/" },
    { label: "Open Graph image maker", href: "/og-image-maker/" },
    { label: "Phone mockup", href: "/?style=phone-sorbet" },
    { label: "Browser window mockup", href: "/?style=lemonade" },
  ],
  cta: "Open the editor with Tangerine Dream ready to go.",
};

export default function Page() {
  return <ToolLanding d={d} />;
}
