import Link from "next/link";
import { ToolLanding, pageMetadata, type ToolPageData } from "@/components/site/ToolLanding";
import { COMPARE_CHECKED, TOOLS } from "@/config/compare";
import { STYLE_PRESETS } from "@/engine/presets/styles";

const N = STYLE_PRESETS.length;
const DESC = `Add a background, shadow and frame to any screenshot in seconds. ${N} styles, one image or a whole folder. Free, open source, runs in your browser.`;

export const metadata = pageMetadata({
  path: "/screenshot-beautifier/",
  title: "Screenshot beautifier: free, no upload · Shotcandy",
  social: "The free screenshot beautifier that stays in your browser",
  description: DESC,
  image: "/og/screenshot-beautifier.png",
});

const d: ToolPageData = {
  slug: "screenshot-beautifier",
  crumb: "Screenshot beautifier",
  description: DESC,
  ogImage: "/og/screenshot-beautifier.png",
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
    pills: ["Tangerine Tilt", "Auto size", "Deep shadow"],
    width: 1100,
    height: 756,
  },
  stepsTitle: "How to beautify a screenshot",
  steps: [
    ["Paste", "Copy a screenshot and press ⌘V (Ctrl+V), drop a file, or pick one."],
    [
      "Pick a style",
      `Every one of the ${N} styles previews on your own screenshot: tilts, peeks, stacks, prints and devices. Tweak background, padding, corners and shadow.`,
    ],
    [
      "Export",
      "Copy to clipboard or download PNG, JPEG or WebP up to 4×, sized for X, LinkedIn, Instagram or the App Store.",
    ],
  ],
  examples: [
    {
      src: "/showcase/beautifier-1.webp",
      name: "From your shot",
      note: "colours from your image",
      width: 720,
      height: 540,
      alt: "A dark settings screenshot on a background made from its own blue and purple colours",
    },
    {
      src: "/showcase/beautifier-2.webp",
      name: "Cotton Candy",
      note: "pastel gradient",
      width: 720,
      height: 540,
      alt: "A project board screenshot on a pastel pink and blue gradient",
    },
    {
      src: "/showcase/beautifier-3.webp",
      name: "Sorbet Phone",
      note: "phone frame",
      width: 720,
      height: 540,
      alt: "A habit tracker screenshot inside a drawn phone frame on a pink gradient",
    },
  ],
  uses: {
    intro:
      "A screenshot beautifier puts your screenshot on a designed background with padding, rounded corners and a shadow, often inside a window or device frame. It turns a flat grab into something that looks finished.",
    items: [
      [
        "Launch posts",
        "Pick an X, LinkedIn or Product Hunt size and the screenshot is fitted with room around it, so nothing gets cropped in the feed.",
      ],
      [
        "README and docs images",
        "A light style with a soft shadow reads well on white and dark GitHub themes. Export at 2× for crisp text.",
      ],
      [
        "Release notes",
        "Style one screenshot, then drop in the rest of the release. They all share the style and export together.",
      ],
      [
        "Bug reports and support replies",
        "Add an arrow or a highlight, blur the customer's email, and paste the result straight into the ticket.",
      ],
      [
        "Pitch decks",
        "Tall canvases get a caption card: a headline and subhead above the screenshot, set in the brand's display type.",
      ],
      [
        "Screen recordings",
        "The same styles work on MP4, MOV and WebM recordings. Trim them and export MP4, WebM or GIF.",
      ],
    ],
  },
  sections: [
    {
      title: "How to add a background to a screenshot",
      body: (
        <>
          <p>
            Paste the screenshot and it lands on the default style straight away. To change the
            background, open <b>Background</b> in the side panel. You can use a gradient, a mesh, a
            solid colour, one of 12 original wallpapers, or your own image. <b>From your shot</b>{" "}
            builds a palette from the screenshot itself, so the background always goes with it.
          </p>
          <p>
            Press <kbd>S</kbd> for Candy Shuffle, which re-rolls background, tilt and frame
            together, or <kbd>G</kbd> to see every style rendered with your own image. Styles that
            suit the screenshot&apos;s shape come first: phone shots get phone styles, wide shots
            get wide ones.
          </p>
        </>
      ),
    },
    {
      title: "Shadows, corners, frames and tilt",
      body: (
        <>
          <p>
            Padding, corners and shadow have named stops (S, M, L, XL and so on) so it&apos;s easy
            to land on the same look twice. Add a border, an inset plate, a 3D tilt or move the card
            to an edge so it runs off the canvas. Frames include a{" "}
            <Link href="/macos-window-frame/">macOS window</Link>, a browser with your own URL,
            phone, tablet and laptop drawings, and a design canvas frame.
          </p>
          <p>
            For privacy, draw a blur or pixelate box over anything personal before you share. See{" "}
            <Link href="/redact-screenshot/">how to redact a screenshot</Link>.
          </p>
        </>
      ),
    },
    {
      title: "One screenshot, a folder, or several in one image",
      body: (
        <>
          <p>
            Drop in up to 100 screenshots at once (30 on a phone) and they share one style. The{" "}
            <b>All / This image</b> switch lets you change one image without touching the rest, and
            Export all saves them as a ZIP with their original names. The{" "}
            <Link href="/batch-screenshot-editor/">batch screenshot editor</Link> page has the
            details.
          </p>
          <p>
            To show several screens in one image, pick a layout under <b>Screens</b>: Side by side,
            Overlap, Hero, Cascade, Fan or Grid, with 2 to 6 screenshots. See{" "}
            <Link href="/screenshot-mockup/">multi-screen mockups</Link>.
          </p>
        </>
      ),
    },
  ],
  compare: {
    title: "Screenshot beautifiers compared",
    intro:
      "There are good tools in this space. Here's how Shotcandy lines up with three popular ones on the things people usually ask about.",
    tools: [TOOLS.shotcandy, TOOLS.shots, TOOLS.pika, TOOLS.studio],
    rows: [
      {
        feature: "Price",
        values: [
          "Free",
          "Free tier; Plus $10/mo, Pro $15/mo",
          "Free tier; Pro $150/yr or $299 once",
          "Free",
        ],
      },
      {
        feature: "Account",
        values: ["None", "Needed for video export", "Only for paid features", "None"],
      },
      {
        feature: "Image stays on your device",
        values: ["Yes", "Not stated", "Yes, it says so", "Yes, it says so"],
      },
      {
        feature: "Open source",
        values: ["Yes, MIT", "No", "Free features only, custom licence", "Yes, Apache 2.0"],
      },
      {
        feature: "Many screenshots at once",
        values: ["Yes, up to 100, ZIP or folder", "Not listed", "Not listed", "Yes, ZIP"],
      },
      {
        feature: "Several screenshots in one image",
        values: ["Yes, 6 layouts", "Not listed", "Yes, some templates are Pro", "Yes"],
      },
      {
        feature: "Video export",
        values: ["MP4, WebM, GIF", "MP4, GIF", "Not listed", "MP4, WebM, GIF"],
      },
    ],
    checked: COMPARE_CHECKED,
    note: (
      <>
        Shots.so has no public pricing page; its prices are the ones shown in the app. For a fuller
        comparison see <Link href="/alternatives/">free alternatives</Link>.
      </>
    ),
  },
  faqTitle: "Screenshot beautifier FAQ",
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
      "Can I style a whole folder of screenshots?",
      "Yes. Drop in up to 100 screenshots (30 on a phone) or a whole folder. They share one style, you can still change any single image, and you export them all as a ZIP with their original file names.",
    ],
    [
      "Can I show several screens in one image?",
      "Yes. Put 2 to 6 screenshots in one design as Side by side, Overlap, Hero, Cascade, Fan or Grid, with any style.",
    ],
    [
      "Which sizes can I export?",
      "Auto (your screenshot's own resolution), common ratios, Open Graph, X, LinkedIn, Instagram posts and stories, Product Hunt and App Store screenshot sizes, at 1× to 4×.",
    ],
  ],
  related: [
    { label: "Batch screenshot editor", href: "/batch-screenshot-editor/" },
    { label: "Multi-screen mockup", href: "/screenshot-mockup/" },
    { label: "macOS window frame", href: "/macos-window-frame/" },
    { label: "Open Graph image maker", href: "/og-image-maker/" },
    { label: "Phone mockup", href: "/?style=phone-sorbet" },
    { label: "Browser window mockup", href: "/?style=lemonade" },
  ],
  cta: "Open the editor with Tangerine Tilt ready to go.",
};

export default function Page() {
  return <ToolLanding d={d} />;
}
