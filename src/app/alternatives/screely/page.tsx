import Link from "next/link";
import { ToolLanding, pageMetadata, type ToolPageData } from "@/components/site/ToolLanding";
import { COMPARE_CHECKED, TOOLS } from "@/config/compare";

const DESC =
  "Looking for Screely? Shotcandy is a free, open-source way to put screenshots in browser and macOS windows on a background, in your browser, with no upload.";

export const metadata = pageMetadata({
  path: "/alternatives/screely/",
  title: "Screely alternative: free, in your browser · Shotcandy",
  social: "A free Screely alternative for window mockups",
  description: DESC,
  image: "/og/alternatives-screely.png",
});

const d: ToolPageData = {
  slug: "alternatives/screely",
  crumb: "Screely alternative",
  parent: { label: "Alternatives", href: "/alternatives/" },
  appName: "Shotcandy, a Screely alternative",
  description: DESC,
  ogImage: "/og/alternatives-screely.png",
  h1: (
    <>
      A free <em>Screely alternative</em> for window mockups
    </>
  ),
  lede: "Screely made one thing easy: drop a screenshot, get it in a browser window on a nice background. Shotcandy does that too, for free and in your browser, and it's open source.",
  style: "lemonade",
  frameLabel: "browser frame",
  hero: {
    src: "/showcase/alt-screely-hero.webp",
    alt: "A landing page screenshot in a light browser window on a lemon-yellow gradient",
    pills: ["Browser window", "Lemonade", "Free"],
    width: 1100,
    height: 756,
  },
  stepsTitle: "Get a Screely-style mockup in three steps",
  steps: [
    ["Paste", "Paste or drop a screenshot above. The editor opens with a browser frame on."],
    [
      "Set the window",
      "Type your site's address into the address bar, or switch to a macOS window with a title. Pick Light, Dark or Auto.",
    ],
    ["Export", "Copy it, or download PNG, JPEG or WebP up to 4×."],
  ],
  examples: [
    {
      src: "/showcase/browser-1.webp",
      name: "Bubblegum",
      note: "browser window",
      width: 720,
      height: 540,
      alt: "A project board in a light browser window with an address bar, on a pink gradient",
    },
    {
      src: "/showcase/browser-2.webp",
      name: "Licorice Bleed",
      note: "dark browser",
      width: 720,
      height: 540,
      alt: "A dark notes app in a dark browser window running off the edge of a dark background",
    },
    {
      src: "/showcase/macos-1.webp",
      name: "Sherbet",
      note: "macOS window",
      width: 720,
      height: 540,
      alt: "An analytics dashboard in a light macOS-style window on a pink gradient",
    },
  ],
  sections: [
    {
      title: "What happened to screely.com?",
      body: (
        <>
          <p>
            When we checked on 30 September 2026, screely.com no longer served the screenshot tool.
            The domain showed an unrelated Thai-language site about football betting. If a bookmark
            or an old blog post sent you there, that&apos;s why it looks different.
          </p>
          <p>
            A tool called Screely now lives at{" "}
            <a href="https://screely.app" target="_blank" rel="noopener noreferrer">
              screely.app
            </a>
            . Its about page says it&apos;s built and maintained by an independent developer under
            the Aticmatic name. The site doesn&apos;t say whether it&apos;s connected to the
            original Screely. It&apos;s free, processes images on your device, and has a Chrome
            extension that captures and records browser tabs.
          </p>
        </>
      ),
    },
    {
      title: "When Screely is the better pick",
      body: (
        <ul>
          <li>
            You want to capture straight from Chrome. Screely&apos;s extension grabs a tab, a
            selection, an element or a full page, so there&apos;s no separate screenshot step.
          </li>
          <li>You want to record a browser tab (its extension records up to 3 minutes).</li>
          <li>You need a Windows-style window frame or a PDF export.</li>
        </ul>
      ),
    },
    {
      title: "When Shotcandy is the better pick",
      body: (
        <ul>
          <li>
            <b>You want more than a window.</b> Six frames (macOS, browser, phone, tablet, laptop,
            design canvas), 3D tilt, and styles that preview on your own screenshot.
          </li>
          <li>
            <b>You have a folder of screenshots.</b> Style up to 100 at once and export a ZIP. See
            the <Link href="/batch-screenshot-editor/">batch editor</Link>.
          </li>
          <li>
            <b>You want several screens in one image.</b> See{" "}
            <Link href="/screenshot-mockup/">multi-screen mockups</Link>.
          </li>
          <li>
            <b>You work with video files.</b> Drop in an MP4, MOV or WebM recording, give it a
            window and background, and export MP4, WebM or GIF.
          </li>
          <li>
            <b>You want the source.</b> Shotcandy is MIT licensed and can be self-hosted as a static
            site.
          </li>
        </ul>
      ),
    },
    {
      title: "The browser frame",
      body: (
        <p>
          The browser frame draws a toolbar with window buttons, back and forward arrows and an
          address field. Type any address and it appears with a padlock, trimmed to fit. It has
          light and dark themes, and Auto picks one from your screenshot. If you prefer the Mac
          look, the <Link href="/macos-window-frame/">macOS window frame</Link> has a title bar with
          an optional title instead.
        </p>
      ),
    },
  ],
  compare: {
    title: "Shotcandy vs Screely",
    tools: [TOOLS.shotcandy, TOOLS.screely],
    rows: [
      { feature: "Price", values: ["Free", "Free"] },
      { feature: "Account", values: ["None", "None, it says"] },
      {
        feature: "Where your image goes",
        values: ["Stays in your browser", "Processed on your device, it says"],
      },
      { feature: "Open source", values: ["Yes, MIT", "Not stated"] },
      { feature: "Window frames", values: ["macOS, browser", "macOS, Windows"] },
      { feature: "Device frames", values: ["Phone, tablet, laptop", "Not listed"] },
      {
        feature: "Capture from the browser",
        values: ["No, paste or drop", "Yes, Chrome extension"],
      },
      { feature: "Many screenshots at once", values: ["Yes, up to 100", "Not listed"] },
      {
        feature: "Video",
        values: ["Style recordings; MP4, WebM, GIF", "Record a tab (extension)"],
      },
      { feature: "Export", values: ["PNG, JPEG, WebP up to 4×", "PNG, PDF"] },
    ],
    checked: COMPARE_CHECKED,
    note: (
      <>
        Screely&apos;s Chrome extension is listed on the{" "}
        <a
          href="https://chromewebstore.google.com/detail/screely/blbainebjfepphppgdmnooopccecgjdd"
          target="_blank"
          rel="noopener noreferrer"
        >
          Chrome Web Store
        </a>
        .
      </>
    ),
  },
  faqTitle: "Screely alternative FAQ",
  faq: [
    [
      "Is screely.com still the screenshot tool?",
      "Not when we checked on 30 September 2026. The domain showed an unrelated site. A tool called Screely is now at screely.app.",
    ],
    [
      "Is Shotcandy free like Screely?",
      "Yes. No account, no watermark, no paid plan. It's open source under the MIT license.",
    ],
    [
      "Can I set the URL in the browser frame?",
      "Yes. Type any address into the frame's field in the side panel and it shows in the address bar.",
    ],
    [
      "Does Shotcandy have a Chrome extension?",
      "No. Take the screenshot however you like (your system's shortcut works), then paste it. On a Mac, ⌘⇧⌃4 copies a selection straight to the clipboard.",
    ],
    [
      "Does it work on Windows?",
      "Yes. It runs in any modern browser. On Windows, Win+Shift+S copies a screenshot you can paste straight in.",
    ],
  ],
  related: [
    { label: "All alternatives", href: "/alternatives/" },
    { label: "Shots.so alternative", href: "/alternatives/shots-so/" },
    { label: "macOS window frame", href: "/macos-window-frame/" },
    { label: "Browser window mockup", href: "/?style=lemonade" },
  ],
  cta: "Open the editor with a browser frame ready.",
};

export default function Page() {
  return <ToolLanding d={d} />;
}
