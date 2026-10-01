import Link from "next/link";
import { ToolLanding, pageMetadata, type ToolPageData } from "@/components/site/ToolLanding";
import { COMPARE_CHECKED, TOOLS } from "@/config/compare";

const DESC =
  "Put any screenshot in a clean macOS-style window on a background. Light or dark, with a title. Free, no upload, and it works on Windows and Linux too.";

export const metadata = pageMetadata({
  path: "/macos-window-frame/",
  title: "Add a macOS window frame to a screenshot · Shotcandy",
  social: "Add a macOS window frame to any screenshot",
  description: DESC,
  image: "/og/macos-window-frame.png",
});

const d: ToolPageData = {
  slug: "macos-window-frame",
  crumb: "macOS window frame",
  description: DESC,
  ogImage: "/og/macos-window-frame.png",
  h1: (
    <>
      Add a <em>macOS window frame</em> to any screenshot
    </>
  ),
  lede: "Paste a screenshot and get a crisp macOS-style window on a beautiful background. Free, private and instant: nothing is uploaded, and it works the same on Windows and Linux.",
  style: "sherbet",
  frameLabel: "frame",
  hero: {
    src: "/showcase/macos-hero.webp",
    alt: "A dashboard screenshot inside a light macOS-style window titled Quokka — Overview, on a pink and peach gradient",
    pills: ["macOS window", "Light", "Sherbet"],
    width: 1100,
    height: 756,
  },
  stepsTitle: "How to add a macOS window frame to a screenshot",
  steps: [
    ["Paste", "Copy a screenshot and press ⌘V (Ctrl+V), drop a file, or pick one."],
    [
      "Pick a style",
      "The macOS frame is already on. Choose Auto, Light or Dark, type a window title, then pick a background, padding and shadow.",
    ],
    [
      "Export",
      "Copy to clipboard or download PNG, JPEG or WebP up to 4×, sized for any social network.",
    ],
  ],
  examples: [
    {
      src: "/showcase/macos-1.webp",
      name: "Sherbet",
      note: "light window",
      width: 720,
      height: 540,
      alt: "An analytics dashboard in a light macOS-style window on a pink gradient",
    },
    {
      src: "/showcase/macos-2.webp",
      name: "Dark window",
      note: "on a purple gradient",
      width: 720,
      height: 540,
      alt: "A dark code editor screenshot in a dark macOS-style window on a purple background",
    },
    {
      src: "/showcase/macos-3.webp",
      name: "Strawberry Satin",
      note: "on a wallpaper",
      width: 720,
      height: 540,
      alt: "A project board in a macOS-style window on a red satin wallpaper",
    },
  ],
  uses: {
    intro:
      "A window frame tells people they're looking at software, not a photo. It also gives a cropped screenshot clean edges.",
    items: [
      [
        "Product updates and changelogs",
        "Frame the new screen, add the feature name as the window title, and post it. The title bar makes a tight crop read as an app window.",
      ],
      [
        "Docs and help articles",
        "Use the same frame and padding on every image so a long article looks consistent. Batch mode styles a whole folder in one go.",
      ],
      [
        "Slides and talks",
        "A framed screenshot on a soft background holds up on a projector better than a raw one with a white edge.",
      ],
      [
        "Portfolios and case studies",
        "Put several screens side by side or in a cascade, each in its own window, in one image.",
      ],
      [
        "Windows and Linux apps",
        "Nothing checks where the screenshot came from. Anything in a PNG, JPEG or WebP gets the same frame.",
      ],
      [
        "Social posts",
        "Pick X, LinkedIn or an Instagram size and the window is fitted to the canvas with room around it.",
      ],
    ],
  },
  sections: [
    {
      title: "Light, dark, or matched to your screenshot",
      body: (
        <>
          <p>
            The frame has three themes. <b>Light</b> draws a pale grey title bar, <b>Dark</b> a
            graphite one, and <b>Auto</b> (the default) looks at the top rows of your screenshot and
            picks the one that fits, so a dark app gets a dark window without you asking.
          </p>
          <p>
            The frame is drawn in vectors at export size, so the title bar and its hairline stay
            sharp at 4×. The window&apos;s corner radius follows the card&apos;s corners, and the
            shadow sits under the whole window, not just the image.
          </p>
        </>
      ),
    },
    {
      title: "Add a window title",
      body: (
        <>
          <p>
            Type a title under the frame picker and it appears centred in the title bar, like a real
            window. Use the app and page name (&quot;Quokka — Overview&quot;), a file name, or leave
            it empty for a clean bar. A long title is shortened with an ellipsis so it never runs
            into the window buttons.
          </p>
          <p>
            The red, yellow and green buttons can be switched to a quiet grey with the{" "}
            <b>Colour window buttons</b> switch, which suits calm or monochrome designs.
          </p>
        </>
      ),
    },
    {
      title: "Other frames",
      body: (
        <>
          <p>
            The macOS window is one of six frames. The <b>browser</b> frame adds an address bar with
            your own URL, which suits websites and web apps. <b>Phone</b>, <b>tablet</b> and{" "}
            <b>laptop</b> frames are our own drawings, not vendor artwork. The <b>design canvas</b>{" "}
            frame shows your shot the way a design tool shows a selected frame, with its name above
            and its pixel size below. Press <kbd>F</kbd> in the editor to cycle through them.
          </p>
          <p>
            Every one works with the <Link href="/screenshot-beautifier/">style presets</Link>, with{" "}
            <Link href="/batch-screenshot-editor/">batches</Link> and with{" "}
            <Link href="/screenshot-mockup/">multi-screen layouts</Link>.
          </p>
        </>
      ),
    },
  ],
  compare: {
    title: "Other ways to get a macOS window frame",
    intro:
      "You can take a real window screenshot on a Mac (⌘⇧4, then Space), but it only works on a Mac, for apps you can open, and it gives you a transparent shadow you still need to place on something. Tools that draw the frame for you:",
    tools: [TOOLS.shotcandy, TOOLS.screely, TOOLS.xnapper, TOOLS.cleanshot],
    rows: [
      {
        feature: "Price",
        values: ["Free", "Free", "$29.99 one-time (free with watermark)", "From $35 one-time"],
      },
      {
        feature: "Runs on",
        values: [
          "Any browser",
          "Browser, Chrome extension",
          "Mac (plus a separate iOS app)",
          "Mac only",
        ],
      },
      {
        feature: "Image stays on your device",
        values: ["Yes", "Yes, it says so", "Yes, a native app", "Yes, unless you use its Cloud"],
      },
      {
        feature: "Open source",
        values: ["Yes, MIT", "Not stated", "No", "No"],
      },
      {
        feature: "Style many screenshots at once",
        values: ["Yes, up to 100", "Not listed", "Not listed", "Not listed"],
      },
    ],
    checked: COMPARE_CHECKED,
  },
  faqTitle: "macOS window frame questions",
  faq: [
    [
      "Is it free to add a macOS frame?",
      "Yes. Shotcandy is free and open source, with no watermark and no sign-up. Export up to 4× resolution as PNG, JPEG or WebP.",
    ],
    [
      "Is my screenshot uploaded?",
      "No. The frame is drawn in your browser with the canvas API. Your image never leaves your device.",
    ],
    [
      "Can I use a dark window or add a title?",
      "Yes. Switch the frame between Auto, Light and Dark, type a window title, or turn off the coloured window buttons for a grey set.",
    ],
    [
      "Does it work with Windows or Linux screenshots?",
      "Any PNG, JPEG or WebP works. The frame is our own macOS-style drawing, so it suits any desktop screenshot.",
    ],
    [
      "Can I frame a whole folder at once?",
      "Yes. Drop up to 100 screenshots, or a folder, into the editor. They share the frame and style, you can still change any single image, and Export all saves them as a ZIP with their original names.",
    ],
    [
      "Can I frame a screen recording?",
      "Yes. Drop in an MP4, MOV or WebM recording and it gets the same window, background and shadow. Export it as MP4, WebM or GIF.",
    ],
  ],
  related: [
    { label: "Screenshot beautifier", href: "/screenshot-beautifier/" },
    { label: "Batch screenshot editor", href: "/batch-screenshot-editor/" },
    { label: "Screely alternative", href: "/alternatives/screely/" },
    { label: "Browser window mockup", href: "/?style=lemonade" },
    { label: "Phone mockup", href: "/?style=phone-sorbet" },
  ],
  cta: "Open the editor with the macOS frame already applied.",
};

export default function Page() {
  return <ToolLanding d={d} />;
}
