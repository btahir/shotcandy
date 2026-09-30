import Link from "next/link";
import { ToolLanding, pageMetadata, type ToolPageData } from "@/components/site/ToolLanding";
import { COMPARE_CHECKED, TOOLS } from "@/config/compare";
import { LAYOUTS } from "@/engine/scene/layouts";
import { editorUrl } from "@/lib/handoff";

const DESC =
  "Put 2 to 6 screenshots in one image: side by side, overlap, hero, cascade, fan or grid, with frames and backgrounds. Free, no sign-up, nothing uploaded.";

export const metadata = pageMetadata({
  path: "/screenshot-mockup/",
  title: "Screenshot collage maker: multiple screenshots, one mockup",
  social: "Put multiple screenshots in one mockup",
  description: DESC,
  image: "/og/screenshot-mockup.png",
});

/** When each layout suits, in one line (the layout's own range comes from the engine). */
const WHEN: Record<string, [string, string]> = {
  "side-by-side": ["Sherbet", "Before and after, or two versions next to each other."],
  overlap: ["Midnight Spotlight", "Depth: one screen in front, one peeking out behind it."],
  hero: ["Tangerine Tilt", "A launch image with one clear focus and two supporting screens."],
  cascade: ["Cotton Candy", "A flow or a sequence of steps, stepping back diagonally."],
  fan: ["Aurora Stack", "A showcase of several screens spread like a hand of cards."],
  grid: ["Soft Grey", "Docs, changelogs and portfolios where every screen matters equally."],
};
const range = (min: number, max: number) => (min === max ? `${min}` : `${min} to ${max}`);
const MULTI = LAYOUTS.filter((l) => l.id !== "single");

const d: ToolPageData = {
  slug: "screenshot-mockup",
  crumb: "Multi-screen mockup",
  description: DESC,
  ogImage: "/og/screenshot-mockup.png",
  h1: (
    <>
      Put <em>multiple screenshots</em> in one mockup
    </>
  ),
  lede: "A screenshot collage maker made for app and website screens: drop 2 to 6 screenshots and get one image in a real layout, with window or device frames, a background and shadows.",
  style: "satin",
  frameLabel: "layout",
  target: {
    multiple: { max: 6 },
    layout: "auto",
    title: "Drop 2 to 6 screenshots here",
    hint: "or paste one — the editor picks a layout for how many you add",
    button: "Choose files",
  },
  hero: {
    src: "/showcase/mockup-hero.webp",
    alt: "Three screenshots in the Hero layout on a red satin wallpaper: a dashboard in front, a project board and a landing page behind it",
    pills: ["Hero", "3 screens", "Strawberry Satin"],
    width: 1100,
    height: 756,
  },
  stepsTitle: "How to put several screenshots in one image",
  steps: [
    [
      "Drop your screenshots",
      "Drop or choose 2 to 6 screenshots above. The editor opens with a layout that fits the number.",
    ],
    [
      "Pick a layout",
      "Under Screens, switch between the six layouts. Drag a screenshot onto a screen to swap or replace it.",
    ],
    [
      "Style and export",
      "Every style works: backgrounds, frames, shadows and tilt. Export PNG, JPEG or WebP up to 4×.",
    ],
  ],
  examplesTitle: "The six layouts",
  more: { label: "Open the editor", href: "/?style=satin" },
  examples: MULTI.map((l) => ({
    src: `/showcase/layout-${l.id}.webp`,
    name: l.label,
    note: `${range(l.minCount, l.maxCount)} screens`,
    width: 720,
    height: 540,
    alt: `${l.label} layout: ${l.description.toLowerCase().replace(/\.$/, "")}, styled with ${WHEN[l.id]?.[0] ?? "a Shotcandy style"}`,
    link: { label: `Open with ${l.label}`, href: editorUrl({ layout: l.id as never }) },
  })),
  uses: {
    title: "Which layout for what",
    intro:
      "Each layout has a couple of knobs (spacing, tilt, overlap, spread or gap) and every style works with it.",
    items: MULTI.map((l) => [
      `${l.label} (${range(l.minCount, l.maxCount)} screens)`,
      WHEN[l.id]?.[1] ?? l.description,
    ]),
  },
  sections: [
    {
      title: "A screenshot collage maker that knows about screens",
      body: (
        <>
          <p>
            General collage tools put photos in a grid. Screenshots need more: a window or device
            frame, padding, a shadow, and a background that holds several screens together. Here the
            frame and style you pick apply to every screen, so a browser frame goes around each one,
            and the layout keeps them lined up.
          </p>
          <p>
            Mixed shapes are fine. A wide desktop screenshot and a tall phone screenshot can sit in
            the same design; each screen is fitted to its own shape.
          </p>
        </>
      ),
    },
    {
      title: "Swap, replace and reorder screens",
      body: (
        <>
          <p>
            Drop a file on a screen to replace it, or drop several on the design to fill the empty
            screens in order. Drag one screen onto another to swap them. Each screen has a menu to
            replace it, swap it with its neighbour or empty it. Everything works from the keyboard
            too: Tab reaches the screens, Alt with the arrow keys swaps them, and Delete empties
            one.
          </p>
          <p>
            Blur boxes, arrows and highlights stay on the screen you drew them on, even when you
            switch layouts.
          </p>
        </>
      ),
    },
    {
      title: "From a batch to one design",
      body: (
        <p>
          Working through a <Link href="/batch-screenshot-editor/">batch</Link>? Select 2 to 6
          images in the list and choose <b>Combine into one design</b>. They become one multi-screen
          image with the batch&apos;s style, and the originals stay in the batch.
        </p>
      ),
    },
  ],
  compare: {
    title: "Multi-screen mockup tools compared",
    tools: [TOOLS.shotcandy, TOOLS.studio, TOOLS.pika, TOOLS.previewed],
    rows: [
      {
        feature: "Price",
        values: [
          "Free",
          "Free",
          "Free tier; Pro $150/yr or $299 once",
          "Free with attribution; paid from $9.99",
        ],
      },
      {
        feature: "Screens in one image",
        values: [
          "2 to 6, in 6 layouts",
          "Up to 6 devices",
          "Up to 6, in Pro templates",
          "Template scenes",
        ],
      },
      {
        feature: "Desktop and web screenshots",
        values: ["Yes, with window and browser frames", "Yes", "Yes", "Yes"],
      },
      {
        feature: "Image stays on your device",
        values: ["Yes", "Yes, it says so", "Yes, it says so", "Not listed"],
      },
      {
        feature: "Open source",
        values: ["Yes, MIT", "Yes, Apache 2.0", "Free features only", "No"],
      },
    ],
    checked: COMPARE_CHECKED,
    note: "Previewed and Screenshot Studio also offer 3D device scenes, which Shotcandy doesn't.",
  },
  faqTitle: "Multi-screen mockup FAQ",
  faq: [
    [
      "How do I put two screenshots side by side?",
      "Drop both screenshots on the box above, or open the editor, add one, and pick Side by side under Screens. Then drop the second one onto the empty screen.",
    ],
    [
      "Can I mix phone and desktop screenshots?",
      "Yes. Each screen is fitted to its own shape, so a phone and a desktop screenshot can share a layout.",
    ],
    [
      "How many screenshots can go in one image?",
      "Two to six, depending on the layout: Side by side takes 2 or 3, Overlap 2, Hero 3, Cascade and Fan 3 to 5, and Grid 4 to 6.",
    ],
    [
      "Can I use a screen recording in a layout?",
      "Not yet. Screen recordings, code images and post cards always show as a single screen.",
    ],
    [
      "Is it free, and is anything uploaded?",
      "It's free with no watermark, and nothing is uploaded: the layout is drawn in your browser.",
    ],
    [
      "Can I go back to one screenshot?",
      "Yes. Pick Single under Screens. The other screens are kept, so switching back to a layout brings them back.",
    ],
  ],
  related: [
    { label: "Batch screenshot editor", href: "/batch-screenshot-editor/" },
    { label: "Screenshot beautifier", href: "/screenshot-beautifier/" },
    { label: "App Store screenshots", href: "/app-store-screenshots/" },
    { label: "Shots.so alternative", href: "/alternatives/shots-so/" },
  ],
  cta: "Open the editor and pick a layout under Screens.",
};

export default function Page() {
  return <ToolLanding d={d} />;
}
