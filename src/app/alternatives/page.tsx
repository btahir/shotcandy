import Link from "next/link";
import { ToolLanding, pageMetadata, type ToolPageData } from "@/components/site/ToolLanding";
import { COMPARE_CHECKED, TOOLS } from "@/config/compare";

const DESC =
  "Free alternatives to Shots.so, Screely, Pika, Xnapper and CleanShot X, compared fairly on price, platforms, privacy, batch and video. Checked 2026.";

export const metadata = pageMetadata({
  path: "/alternatives/",
  title: "Free Shots.so, Screely and Pika alternatives · Shotcandy",
  social: "Free alternatives to Shots.so, Screely, Pika, Xnapper and CleanShot X",
  description: DESC,
  image: "/og/alternatives.png",
});

const d: ToolPageData = {
  slug: "alternatives",
  crumb: "Alternatives",
  parent: null,
  appName: "Shotcandy",
  description: DESC,
  ogImage: "/og/alternatives.png",
  h1: (
    <>
      Free alternatives to <em>Shots.so, Screely, Pika, Xnapper</em> and CleanShot X
    </>
  ),
  lede: "An honest comparison of the screenshot beautifiers people ask about, including ours. Shotcandy is free, open source and runs in your browser, but it isn't the best pick for everyone.",
  style: "sherbet",
  frameLabel: "style",
  hero: {
    src: "/showcase/layout-cascade.webp",
    alt: "Four screenshots stepping back diagonally on a pastel gradient",
    pills: ["Cascade", "Cotton Candy", "Free"],
    width: 720,
    height: 540,
  },
  stepsTitle: "Try Shotcandy in under a minute",
  steps: [
    ["Paste", "Copy any screenshot and press ⌘V (Ctrl+V), or drop a file above."],
    ["Pick a style", "Every style previews on your own screenshot. Press S to shuffle."],
    ["Export", "Copy it, or download PNG, JPEG or WebP up to 4×. No watermark."],
  ],
  examples: [
    {
      src: "/showcase/beautifier-1.webp",
      name: "From your shot",
      note: "colours from the image",
      width: 720,
      height: 540,
      alt: "A dark settings screenshot on a background made from its own colours",
    },
    {
      src: "/showcase/layout-fan.webp",
      name: "Fan",
      note: "three screens",
      width: 720,
      height: 540,
      alt: "Three dark app screenshots fanned out like cards on a purple gradient",
    },
    {
      src: "/showcase/code-2.webp",
      name: "Blueberry",
      note: "code image",
      width: 720,
      height: 540,
      alt: "A Rust snippet in a dark blue code window",
    },
  ],
  compare: {
    title: "The comparison",
    intro:
      "Facts from each tool's own site. Where a site doesn't mention something, we say so rather than guess.",
    tools: [
      TOOLS.shotcandy,
      TOOLS.shots,
      TOOLS.screely,
      TOOLS.pika,
      TOOLS.xnapper,
      TOOLS.cleanshot,
      TOOLS.studio,
    ],
    rows: [
      {
        feature: "Price",
        values: [
          "Free",
          "Free tier; Plus $10/mo, Pro $15/mo",
          "Free",
          "Free tier; Pro $150/yr or $299 once",
          "Free with watermark; from $29.99 once",
          "From $35 once",
          "Free",
        ],
      },
      {
        feature: "Runs on",
        values: [
          "Any browser",
          "Browser",
          "Browser, Chrome extension",
          "Browser, extensions",
          "Mac",
          "Mac",
          "Browser",
        ],
      },
      {
        feature: "Account",
        values: [
          "None",
          "For video export",
          "None",
          "For paid features",
          "Not listed",
          "Not listed",
          "None",
        ],
      },
      {
        feature: "Image stays on your device",
        values: [
          "Yes",
          "Not stated",
          "Yes, it says",
          "Yes, it says",
          "Yes (Mac app)",
          "Yes, unless you use Cloud",
          "Yes, it says",
        ],
      },
      {
        feature: "Open source",
        values: [
          "Yes, MIT",
          "No",
          "Not stated",
          "Free features only",
          "No",
          "No",
          "Yes, Apache 2.0",
        ],
      },
      {
        feature: "Many screenshots at once",
        values: [
          "Up to 100",
          "Not listed",
          "Not listed",
          "Not listed",
          "Not listed",
          "Not listed",
          "Yes, ZIP",
        ],
      },
      {
        feature: "Several in one image",
        values: [
          "2 to 6, six layouts",
          "Not listed",
          "Not listed",
          "Pro templates",
          "Not listed",
          "By hand",
          "Yes",
        ],
      },
      {
        feature: "Video",
        values: [
          "Style recordings; MP4, WebM, GIF",
          "MP4, GIF",
          "Tab recording",
          "Not listed",
          "Not listed",
          "Screen recording, MP4, GIF",
          "Animations; MP4, WebM, GIF",
        ],
      },
      {
        feature: "Code images",
        values: ["Yes", "Not listed", "Not listed", "Yes", "Not listed", "Not listed", "Yes"],
      },
    ],
    checked: COMPARE_CHECKED,
    note: "Shots.so has no public pricing page; its prices are the ones its app shows.",
  },
  sections: [
    {
      title: "Shots.so alternative",
      body: (
        <p>
          Shots.so is polished and has more device mockups and camera angles than Shotcandy. Its
          better features sit in paid plans, and its site doesn&apos;t say where your image is
          processed. If you mostly add backgrounds, frames and shadows, Shotcandy does that for free
          and adds batch export and multi-screen layouts.{" "}
          <Link href="/alternatives/shots-so/">Shotcandy vs Shots.so</Link>.
        </p>
      ),
    },
    {
      title: "Screely alternative",
      body: (
        <p>
          The old screely.com domain no longer hosts the tool. A Screely now lives at screely.app,
          free, with a Chrome extension for capturing tabs. Shotcandy covers the same window
          mockups, without an extension, and adds device frames, batches and multi-screen designs.{" "}
          <Link href="/alternatives/screely/">Shotcandy vs Screely</Link>.
        </p>
      ),
    },
    {
      title: "Pika alternative",
      body: (
        <p>
          Pika runs in the browser and keeps images local, like Shotcandy. It has many templates,
          some of them Pro, and a public repository for its free features under a custom licence.
          Shotcandy has every feature free under MIT, plus batches and screen recordings. Pika has
          more ready-made templates and extensions for VS Code and Raycast.
        </p>
      ),
    },
    {
      title: "Xnapper and CleanShot X alternative for Windows and Linux",
      body: (
        <p>
          Xnapper and CleanShot X are native Mac apps that capture and beautify in one step, and
          CleanShot X records the screen. They&apos;re excellent if you&apos;re on a Mac and want
          capture built in. Shotcandy doesn&apos;t capture; it styles what you paste, so it works
          anywhere a browser does, including Windows, Linux and phones. Use your system&apos;s
          screenshot shortcut, then paste.
        </p>
      ),
    },
    {
      title: "Screenshot Studio, the closest free option",
      body: (
        <p>
          Screenshot Studio is also free, open source (Apache 2.0) and in-browser, and it has batch
          ZIP export, multi-device layouts, code images and App Store sets. It&apos;s the nearest
          match to Shotcandy, and worth trying. The differences are in the details: in Shotcandy a
          batch can have per-image changes and can write straight into a folder, and screen
          recordings get the same styles as screenshots.
        </p>
      ),
    },
  ],
  faqTitle: "Questions about alternatives",
  faq: [
    [
      "What's the best free alternative to Shots.so?",
      "For backgrounds, frames and shadows with no account, Shotcandy and Screenshot Studio are both free and open source. Pika has a free tier. The table above shows where each one differs.",
    ],
    [
      "Is there a CleanShot X alternative for Windows?",
      "For the beautifying part, yes: Shotcandy runs in any browser on Windows. It doesn't capture the screen, so pair it with Win+Shift+S and paste.",
    ],
    [
      "Why include tools that do things Shotcandy doesn't?",
      "Because you should pick the right tool. If you need 3D scenes, capture built in, or Google Play sizes, another tool will suit you better.",
    ],
    [
      "How often is this page checked?",
      "The facts were last checked on 30 September 2026. Tell us on GitHub if something has changed and we'll fix it.",
    ],
    [
      "Is Shotcandy affiliated with any of these tools?",
      "No. It's an independent open-source project.",
    ],
  ],
  related: [
    { label: "Shots.so alternative", href: "/alternatives/shots-so/" },
    { label: "Screely alternative", href: "/alternatives/screely/" },
    { label: "Screenshot beautifier", href: "/screenshot-beautifier/" },
    { label: "All tools", href: "/tools/" },
  ],
  cta: "Paste a screenshot and compare for yourself.",
};

export default function Page() {
  return <ToolLanding d={d} />;
}
