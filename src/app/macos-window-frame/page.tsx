import type { Metadata } from "next";
import { ToolLanding, type ToolPageData } from "@/components/site/ToolLanding";

const TITLE = "Add a macOS window frame to any screenshot — free";
const DESC =
  "Paste a screenshot and get a crisp macOS-style window on a beautiful background. Free, private and instant: nothing is uploaded.";

export const metadata: Metadata = {
  title: { absolute: `${TITLE} · Shotcandy` },
  description: DESC,
  alternates: { canonical: "/macos-window-frame/" },
  openGraph: {
    title: TITLE,
    description: DESC,
    url: "/macos-window-frame/",
    images: [{ url: "/og/macos-window-frame.png", width: 1200, height: 630 }],
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESC, images: ["/og/macos-window-frame.png"] },
};

const d: ToolPageData = {
  slug: "macos-window-frame",
  crumb: "macOS window frame",
  h1: (
    <>
      Add a <em>macOS window frame</em> to any screenshot
    </>
  ),
  lede: "Paste a screenshot and get a crisp macOS-style window on a beautiful background. Free, private and instant — nothing is uploaded.",
  style: "sherbet",
  frameLabel: "frame",
  hero: {
    src: "/showcase/macos-hero.webp",
    alt: "A dashboard screenshot inside a light macOS-style window on a pink and peach gradient",
    pills: ["macOS window", "Light", "Sherbet"],
    width: 1100,
    height: 756,
  },
  steps: [
    ["Paste", "Copy a screenshot and press ⌘V (Ctrl+V), drop a file, or pick one."],
    ["Pick a style", "The macOS frame is already on. Choose light or dark, a background, padding and shadow."],
    ["Export", "Copy to clipboard or download PNG, JPEG or WebP up to 4×, sized for any social network."],
  ],
  examples: [
    { src: "/showcase/macos-1.webp", name: "Sherbet", note: "light window", width: 720, height: 540 },
    { src: "/showcase/macos-2.webp", name: "Grape Soda", note: "dark window", width: 720, height: 540 },
    { src: "/showcase/macos-3.webp", name: "Strawberry Satin", note: "on a wallpaper", width: 720, height: 540 },
  ],
  faq: [
    ["Is it free to add a macOS frame?", "Yes. Shotcandy is free and open source, with no watermark and no sign-up. Export up to 4× resolution as PNG, JPEG or WebP."],
    ["Is my screenshot uploaded?", "No. The frame is drawn in your browser with the canvas API. Your image never leaves your device."],
    ["Can I use a dark window or add a title?", "Yes. Switch the frame between light and dark, add a window title, or use muted grey window buttons."],
    ["Does it work with Windows or Linux screenshots?", "Any PNG, JPEG or WebP works. The frame is our own macOS-style drawing, so it suits any desktop screenshot."],
  ],
  related: [
    { label: "Screenshot beautifier", href: "/screenshot-beautifier/" },
    { label: "Open Graph image maker", href: "/og-image-maker/" },
    { label: "Browser window mockup", href: "/?style=lemonade" },
    { label: "Phone mockup", href: "/?style=phone-sorbet" },
  ],
  cta: "Open the editor with the macOS frame already applied.",
};

export default function Page() {
  return <ToolLanding d={d} />;
}
