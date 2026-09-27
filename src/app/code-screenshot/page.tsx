import type { Metadata } from "next";
import { CodeInline } from "@/components/site/CodeInline";
import { ToolLanding, type ToolPageData } from "@/components/site/ToolLanding";

const TITLE = "Code screenshot generator — beautiful code images, free";
const DESC =
  "Paste code and get a beautiful image with syntax highlighting, a window frame and a lovely background. 26 languages, 8 themes, PNG, MP4 or GIF. Free and private.";

export const metadata: Metadata = {
  title: { absolute: `${TITLE} · Shotcandy` },
  description: DESC,
  alternates: { canonical: "/code-screenshot/" },
  openGraph: {
    title: TITLE,
    description: DESC,
    url: "/code-screenshot/",
    images: [{ url: "/og/code-screenshot.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESC,
    images: ["/og/code-screenshot.png"],
  },
};

const d: ToolPageData = {
  slug: "code-screenshot",
  crumb: "Code screenshot",
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
  steps: [
    ["Paste your code", "Drop in any snippet. The language is detected for you, or pick one of 26."],
    [
      "Pick a theme",
      "Eight themes, each paired with a background. Add a file name, line numbers or highlighted lines.",
    ],
    [
      "Export",
      "Copy or download PNG, JPEG or WebP up to 4×, or add motion and export MP4 or GIF.",
    ],
  ],
  examples: [
    { src: "/showcase/code-1.webp", name: "Sherbet", note: "Python", width: 720, height: 540 },
    { src: "/showcase/code-2.webp", name: "Blueberry", note: "Rust", width: 720, height: 540 },
    { src: "/showcase/code-3.webp", name: "Cotton Candy", note: "CSS", width: 720, height: 540 },
  ],
  faq: [
    [
      "Is this code screenshot tool free?",
      "Yes. Shotcandy is free and open source, with no watermark and no sign-up. Export as PNG, JPEG or WebP up to 4×, or as MP4 and GIF.",
    ],
    [
      "Is my code uploaded anywhere?",
      "No. Highlighting and rendering happen in your browser. Your code never leaves your device.",
    ],
    [
      "Which languages are supported?",
      "TypeScript, TSX, JavaScript, JSX, Python, Rust, Go, Java, Kotlin, Swift, C, C++, C#, PHP, Ruby, HTML, CSS, JSON, YAML, TOML, Markdown, SQL, Shell, Dockerfile, GraphQL and diffs. Auto-detect picks one for you.",
    ],
    [
      "Can I highlight lines or hide the window buttons?",
      "Yes. Type the lines to highlight (like 2, 5-7), toggle line numbers, and choose coloured window dots, a quiet title bar or no chrome at all.",
    ],
  ],
  related: [
    { label: "Screenshot beautifier", href: "/screenshot-beautifier/" },
    { label: "macOS window frame", href: "/macos-window-frame/" },
    { label: "Open Graph image maker", href: "/og-image-maker/" },
  ],
  cta: "Open the editor in Code mode and paste your first snippet.",
};

export default function Page() {
  return <ToolLanding d={d} />;
}
