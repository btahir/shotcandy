import type { Metadata } from "next";
import { ToolLanding, type ToolPageData } from "@/components/site/ToolLanding";

const TITLE = "Open Graph image maker — 1200 × 630 from any screenshot";
const DESC =
  "Make a link-preview image in seconds: paste a screenshot, pick a style, export an exact 1200 × 630 Open Graph image. Free, open source, runs in your browser.";

export const metadata: Metadata = {
  title: { absolute: `${TITLE} · Shotcandy` },
  description: DESC,
  alternates: { canonical: "/og-image-maker/" },
  openGraph: {
    title: TITLE,
    description: DESC,
    url: "/og-image-maker/",
    images: [{ url: "/og/og-image-maker.png", width: 1200, height: 630 }],
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESC, images: ["/og/og-image-maker.png"] },
};

const d: ToolPageData = {
  slug: "og-image-maker",
  crumb: "Open Graph image maker",
  h1: (
    <>
      Make an <em>Open Graph image</em> from any screenshot
    </>
  ),
  lede: "Link previews at exactly 1200 × 630, the size Facebook, LinkedIn, Slack and X expect. Paste a screenshot, pick a style, export. Nothing leaves your browser.",
  style: "aurora-pop",
  size: "og",
  frameLabel: "1200 × 630 canvas",
  hero: {
    src: "/showcase/og-hero.webp",
    alt: "A landing page screenshot on a dark aurora mesh background at 1200 by 630",
    pills: ["1200 × 630", "Aurora Pop", "Open Graph"],
    width: 1100,
    height: 578,
  },
  steps: [
    ["Paste", "Copy a screenshot of your page and press ⌘V (Ctrl+V), drop a file, or pick one."],
    ["Pick a style", "The canvas is already 1200 × 630. Choose a background, frame and shadow; your shot fits automatically."],
    ["Export", "Download a PNG or JPEG at 1× or 2× and add it to your page's og:image tag."],
  ],
  examples: [
    { src: "/showcase/og-1.webp", name: "Sherbet", note: "light window", width: 720, height: 378 },
    { src: "/showcase/og-2.webp", name: "Licorice", note: "dark browser", width: 720, height: 378 },
    { src: "/showcase/og-3.webp", name: "Gummy", note: "on a wallpaper", width: 720, height: 378 },
  ],
  faq: [
    ["What size should an Open Graph image be?", "1200 × 630 pixels (1.91:1). Meta recommends at least that size for high-resolution displays; smaller images may show as a thumbnail instead of a large card."],
    ["Does it work for X and LinkedIn link cards?", "Yes. X link cards and LinkedIn link previews use the same 1.91:1 shape; there are dedicated 1200 × 628 presets too."],
    ["Is it free and private?", "Yes. No sign-up, no watermark, and your screenshot never leaves your browser."],
    ["Can I export at higher resolution?", "Yes, up to 4×. Keep the file under 8 MB for Facebook and 5 MB for X."],
  ],
  related: [
    { label: "Screenshot beautifier", href: "/screenshot-beautifier/" },
    { label: "macOS window frame", href: "/macos-window-frame/" },
    { label: "X post image", href: "/?size=x-post" },
    { label: "LinkedIn post image", href: "/?size=linkedin-post" },
  ],
  cta: "Open the editor on a 1200 × 630 canvas.",
};

export default function Page() {
  return <ToolLanding d={d} />;
}
