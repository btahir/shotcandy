import Link from "next/link";
import { ToolLanding, pageMetadata, type ToolPageData } from "@/components/site/ToolLanding";
import { COMPARE_CHECKED, TOOLS } from "@/config/compare";
import { STYLE_PRESETS } from "@/engine/presets/styles";

const DESC =
  "Shotcandy is a free, open-source alternative to Shots.so: backgrounds, frames, batch export and multi-screen mockups. No account, no upload.";

export const metadata = pageMetadata({
  path: "/alternatives/shots-so/",
  title: "Free, open-source Shots.so alternative · Shotcandy",
  social: "A free, open-source alternative to Shots.so",
  description: DESC,
  image: "/og/alternatives-shots-so.png",
});

const d: ToolPageData = {
  slug: "alternatives/shots-so",
  crumb: "Shots.so alternative",
  parent: { label: "Alternatives", href: "/alternatives/" },
  appName: "Shotcandy, a Shots.so alternative",
  description: DESC,
  ogImage: "/og/alternatives-shots-so.png",
  h1: (
    <>
      A free, open-source <em>alternative to Shots.so</em>
    </>
  ),
  lede: "Shots.so is a polished mockup tool with paid plans. Shotcandy does the everyday part (backgrounds, frames, shadows and social sizes) for free, adds batch export and multi-screen layouts, and never uploads your screenshot.",
  style: "grape-soda",
  frameLabel: "style",
  hero: {
    src: "/showcase/alt-shots-hero.webp",
    alt: "A dashboard and a phone screenshot side by side on a purple background",
    pills: ["Side by side", "Grape Isometric", "Free"],
    width: 1100,
    height: 756,
  },
  stepsTitle: "Switching takes about a minute",
  steps: [
    [
      "Paste your screenshot",
      "Paste or drop it above, or open the editor. There's nothing to install and no account to make.",
    ],
    [
      "Pick a style",
      `Browse ${STYLE_PRESETS.length} styles rendered with your own screenshot (press G), or press S to shuffle.`,
    ],
    [
      "Export",
      "Copy it, or download PNG, JPEG or WebP up to 4×, or MP4, WebM or GIF with a motion.",
    ],
  ],
  examples: [
    {
      src: "/showcase/layout-hero.webp",
      name: "Hero",
      note: "three screens",
      width: 720,
      height: 540,
      alt: "A landing page in front of two smaller screens on a tangerine gradient",
    },
    {
      src: "/showcase/beautifier-3.webp",
      name: "Sorbet Phone",
      note: "phone frame",
      width: 720,
      height: 540,
      alt: "A habit tracker screenshot inside a drawn phone frame on a pink gradient",
    },
    {
      src: "/showcase/macos-3.webp",
      name: "Strawberry Satin",
      note: "window on a wallpaper",
      width: 720,
      height: 540,
      alt: "A project board in a macOS-style window on a red satin wallpaper",
    },
  ],
  sections: [
    {
      title: "Shotcandy and Shots.so in one paragraph",
      body: (
        <>
          <p>
            Both tools turn a screenshot into a finished image with a background, a frame and a
            shadow, in the browser. Shots.so is a closed-source product from Shots Inc. with free
            and paid plans (the app lists Plus at $10 a month and Pro at $15), and it leans into
            device mockups, camera angles and animated video. Shotcandy is a free, MIT-licensed
            project with no plans at all. It leans into speed and privacy: paste, get a styled
            image, and nothing leaves your device.
          </p>
        </>
      ),
    },
    {
      title: "When Shots.so is the better pick",
      body: (
        <ul>
          <li>
            You want lots of device mockups and camera angles. Shots.so&apos;s catalogue and layout
            presets go further than Shotcandy&apos;s six drawn frames.
          </li>
          <li>
            You make a lot of animated product videos and want its zoom effects and animation
            presets.
          </li>
          <li>You already have a paid plan and a workflow built around it.</li>
        </ul>
      ),
    },
    {
      title: "When Shotcandy is the better pick",
      body: (
        <ul>
          <li>
            <b>You don&apos;t want to pay or sign in.</b> Every feature, 4× export included, is
            free, with no watermark.
          </li>
          <li>
            <b>You have many screenshots.</b> Style up to 100 at once and export a ZIP with the
            original file names. See the{" "}
            <Link href="/batch-screenshot-editor/">batch screenshot editor</Link>.
          </li>
          <li>
            <b>You want several screens in one image</b> in a tidy layout: side by side, overlap,
            hero, cascade, fan or grid. See{" "}
            <Link href="/screenshot-mockup/">multi-screen mockups</Link>.
          </li>
          <li>
            <b>Privacy matters.</b> Shotcandy is a static site; your screenshot is drawn and
            exported in your browser tab, never uploaded.
          </li>
          <li>
            <b>You also need code images or App Store sets.</b> Both are modes in the same editor.
          </li>
          <li>
            <b>You want to read or host the code.</b> It&apos;s MIT licensed; build it and serve the
            static files anywhere.
          </li>
        </ul>
      ),
    },
  ],
  compare: {
    title: "Shotcandy vs Shots.so",
    tools: [TOOLS.shotcandy, TOOLS.shots],
    rows: [
      { feature: "Price", values: ["Free", "Free tier; Plus $10/mo, Pro $15/mo"] },
      { feature: "Account", values: ["None", "Needed to export video"] },
      { feature: "Where your image goes", values: ["Stays in your browser", "Not stated"] },
      { feature: "Open source", values: ["Yes, MIT", "No"] },
      { feature: "Style many screenshots at once", values: ["Yes, up to 100", "Not listed"] },
      { feature: "Several screenshots in one image", values: ["Yes, 6 layouts", "Not listed"] },
      { feature: "Video export", values: ["MP4, WebM, GIF", "MP4, GIF"] },
      { feature: "Style screen recordings", values: ["Yes, MP4, MOV, WebM", "Not listed"] },
      { feature: "Code images", values: ["Yes", "Not listed"] },
      { feature: "App Store sets", values: ["Yes", "Not listed"] },
    ],
    checked: COMPARE_CHECKED,
    note: "Shots.so has no public pricing page; the prices above are the ones its app shows.",
  },
  faqTitle: "Shots.so alternative FAQ",
  faq: [
    [
      "Is Shotcandy really free?",
      "Yes. There's no plan, no account and no watermark. Support is optional and changes nothing in the app.",
    ],
    [
      "Can I import my Shots.so designs?",
      "No. Start from the original screenshot: paste it and pick a style. Most looks take a few clicks to rebuild.",
    ],
    [
      "Does Shotcandy have 3D device mockups?",
      "It has drawn phone, tablet and laptop frames plus 3D tilt, but not photographic 3D scenes. For those, Shots.so or a mockup library is a better fit.",
    ],
    [
      "Does it work on Windows and Linux?",
      "Yes. It runs in any modern browser, on any system, including phones.",
    ],
    [
      "Can I use the images commercially?",
      "Yes. Your exports are yours, and the built-in wallpapers and frames are MIT licensed with the project.",
    ],
  ],
  related: [
    { label: "All alternatives", href: "/alternatives/" },
    { label: "Screely alternative", href: "/alternatives/screely/" },
    { label: "Screenshot beautifier", href: "/screenshot-beautifier/" },
    { label: "Multi-screen mockup", href: "/screenshot-mockup/" },
  ],
  cta: "Paste a screenshot and see it styled in a second.",
};

export default function Page() {
  return <ToolLanding d={d} />;
}
