import Link from "next/link";
import { CodeInline } from "@/components/site/CodeInline";
import { ToolLanding, pageMetadata, type ToolPageData } from "@/components/site/ToolLanding";
import { COMPARE_CHECKED, TOOLS } from "@/config/compare";
import { CODE_LANGUAGES } from "@/engine/code/languages";
import { CODE_LANGUAGE_COUNT } from "@/lib/jsonld";

const LANGS = CODE_LANGUAGES.filter((l) => l.id !== "text").map((l) => l.label);
const DESC = `Paste code and get a highlighted image in a window frame. 8 themes, ${CODE_LANGUAGE_COUNT} languages, PNG, MP4 or GIF. Free, open source, nothing uploaded.`;

export const metadata = pageMetadata({
  path: "/code-screenshot/",
  title: "Code screenshot generator, free and private · Shotcandy",
  social: "Turn code into a beautiful image",
  description: DESC,
  image: "/og/code-screenshot.png",
});

const d: ToolPageData = {
  slug: "code-screenshot",
  crumb: "Code screenshot",
  description: DESC,
  ogImage: "/og/code-screenshot.png",
  h1: (
    <>
      Turn code into a <em>beautiful image</em>
    </>
  ),
  lede: "Paste a snippet and get a crisp, highlighted code window on a lovely background. Free, private and instant: your code stays in your browser.",
  style: "sherbet",
  frameLabel: "code window",
  editorHref: "/?mode=code",
  drop: <CodeInline />,
  more: { label: "Open the code editor", href: "/?mode=code" },
  hero: {
    src: "/showcase/code-hero.webp",
    alt: "A TypeScript snippet in a dark code window with coloured syntax on a purple gradient",
    pills: ["Midnight Candy", "TypeScript", "Lines 7–8 highlighted"],
    width: 1100,
    height: 756,
  },
  stepsTitle: "How to make a code screenshot",
  steps: [
    [
      "Paste your code",
      `Drop in any snippet. The language is detected for you, or pick one of ${CODE_LANGUAGE_COUNT}.`,
    ],
    [
      "Pick a theme",
      "Eight themes, each paired with a background. Add a file name, line numbers or highlighted lines.",
    ],
    [
      "Export",
      "Copy or download PNG, JPEG or WebP up to 4×, or add motion and export MP4, WebM or GIF.",
    ],
  ],
  examples: [
    {
      src: "/showcase/code-1.webp",
      name: "Sherbet",
      note: "Python",
      width: 720,
      height: 540,
      alt: "A Python snippet in a light code window on a pink gradient",
    },
    {
      src: "/showcase/code-2.webp",
      name: "Blueberry",
      note: "Rust",
      width: 720,
      height: 540,
      alt: "A Rust snippet in a dark blue code window",
    },
    {
      src: "/showcase/code-3.webp",
      name: "Cotton Candy",
      note: "CSS",
      width: 720,
      height: 540,
      alt: "A CSS snippet in a pastel code window",
    },
  ],
  uses: {
    intro:
      "A code screenshot is easier to read in a feed than a code block, and it keeps your formatting exactly as you wrote it.",
    items: [
      [
        "Tips and threads on X or LinkedIn",
        "Pick the platform's size in Export and the window is fitted with room around it. Highlight the one line that matters.",
      ],
      [
        "Slides",
        "A 16:9 canvas and a larger font size make code readable from the back of the room. Line numbers help when you talk through it.",
      ],
      [
        "Blog headers and docs",
        "Add the file name as the window title so readers know where the snippet lives.",
      ],
      [
        "Release notes",
        "Show the new API in a few lines, next to a screenshot of what it does, in the same style.",
      ],
      [
        "Short videos",
        "Add a motion such as Zoom in or Scroll and export an MP4 or GIF that loops.",
      ],
      [
        "Private code",
        "Nothing is sent anywhere, so it's safe for code from work. The highlighter runs in your tab.",
      ],
    ],
  },
  sections: [
    {
      title: "Animated code screenshots (MP4 and GIF)",
      body: (
        <>
          <p>
            Most code image tools stop at PNG. Shotcandy&apos;s code images can move. Pick a motion
            in the Motion tray (Zoom in, Focus, Scroll, 3D sweep, Float, Drift or Flip in) and
            export an MP4, WebM or GIF at up to 4K. Scroll pans down a tall design, like scrolling a
            page, which suits long snippets.
          </p>
          <p>
            Every frame is drawn by the same renderer as the still image, in your browser, so the
            video looks exactly like the preview. Looping motions end where they start, so a GIF
            repeats without a jump.
          </p>
        </>
      ),
    },
    {
      title: "Themes, windows and highlighted lines",
      body: (
        <>
          <p>
            Eight themes: Midnight Candy, Sherbet, Licorice, Mint Julep, Blueberry, Paper, Cotton
            Candy and Cocoa, each with a background that goes with it. The window can have coloured
            dots, a quiet title bar, or no chrome at all. Type the lines to highlight (like{" "}
            <code>2, 5-7</code>) and those lines get a tinted band with a bar at the edge.
          </p>
          <p>
            You can also set the font size, padding and window width, so a two-line snippet
            doesn&apos;t end up as a thin strip. Everything else in the editor still applies:
            background, shadow, tilt, and <Link href="/og-image-maker/">social sizes</Link>.
          </p>
        </>
      ),
    },
    {
      title: `${CODE_LANGUAGE_COUNT} languages, detected for you`,
      body: (
        <p>
          Syntax highlighting is by Shiki, which reads the same TextMate grammars as VS Code. Leave
          the language on Auto and a small detector picks one as you paste. The list:{" "}
          {LANGS.join(", ")}. Anything else can be shown as plain text.
        </p>
      ),
    },
  ],
  compare: {
    title: "Carbon vs ray.so vs Shotcandy",
    intro:
      "Carbon and ray.so are the best-known code image tools, and both are free and open source. The main differences are motion and everything around the code.",
    tools: [TOOLS.shotcandy, TOOLS.carbon, TOOLS.rayso],
    rows: [
      { feature: "Price", values: ["Free", "Free", "Free"] },
      { feature: "Open source", values: ["Yes, MIT", "Yes, MIT", "Yes, MIT"] },
      {
        feature: "Image formats",
        values: ["PNG, JPEG, WebP up to 4×", "PNG, SVG", "PNG, SVG"],
      },
      { feature: "Video or GIF", values: ["MP4, WebM, GIF", "No", "No"] },
      {
        feature: "Screenshots too",
        values: ["Yes, same editor", "No, code only", "No, code only"],
      },
      {
        feature: "Social sizes",
        values: ["X, LinkedIn, Instagram, Open Graph and more", "Not listed", "Not listed"],
      },
    ],
    checked: COMPARE_CHECKED,
    note: "Carbon and ray.so export SVG, which Shotcandy doesn't.",
  },
  faqTitle: "Code screenshot FAQ",
  faq: [
    [
      "Is this code screenshot tool free?",
      "Yes. Shotcandy is free and open source, with no watermark and no sign-up. Export as PNG, JPEG or WebP up to 4×, or as MP4, WebM and GIF.",
    ],
    [
      "Is my code uploaded anywhere?",
      "No. Highlighting and rendering happen in your browser. Your code never leaves your device.",
    ],
    ["Which languages are supported?", `${LANGS.join(", ")}. Auto-detect picks one for you.`],
    [
      "Can I highlight lines or hide the window buttons?",
      "Yes. Type the lines to highlight (like 2, 5-7), toggle line numbers, and choose coloured window dots, a quiet title bar or no chrome at all.",
    ],
    [
      "Can I make an animated code image?",
      "Yes. Pick a motion such as Zoom in, Scroll or 3D sweep and export MP4, WebM or GIF.",
    ],
    [
      "Can I put a code image next to a screenshot?",
      "Code images are single designs. Export the code image, then add it as a screenshot in a multi-screen layout next to your other screens.",
    ],
  ],
  related: [
    { label: "Screenshot beautifier", href: "/screenshot-beautifier/" },
    { label: "macOS window frame", href: "/macos-window-frame/" },
    { label: "Open Graph image maker", href: "/og-image-maker/" },
    { label: "All tools", href: "/tools/" },
  ],
  cta: "Open the editor in Code mode and paste your first snippet.",
};

export default function Page() {
  return <ToolLanding d={d} />;
}
