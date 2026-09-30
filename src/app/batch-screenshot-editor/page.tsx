import Link from "next/link";
import { ToolLanding, pageMetadata, type ToolPageData } from "@/components/site/ToolLanding";
import { COMPARE_CHECKED, TOOLS } from "@/config/compare";

const DESC =
  "Add the same background, frame and shadow to up to 100 screenshots at once, change any one, and export a ZIP with the original names. Free, no upload.";

export const metadata = pageMetadata({
  path: "/batch-screenshot-editor/",
  title: "Batch screenshot editor: style 100 at once · Shotcandy",
  social: "Style a whole folder of screenshots at once",
  description: DESC,
  image: "/og/batch-screenshot-editor.png",
});

const d: ToolPageData = {
  slug: "batch-screenshot-editor",
  crumb: "Batch screenshot editor",
  description: DESC,
  ogImage: "/og/batch-screenshot-editor.png",
  h1: (
    <>
      Style a <em>whole folder</em> of screenshots at once
    </>
  ),
  lede: "A batch screenshot editor in your browser: drop up to 100 screenshots, give them one background, frame and shadow, fix the odd one out, and export them all with their original file names.",
  style: "sea-glass",
  frameLabel: "style",
  target: {
    multiple: { max: 100, folders: true },
    title: "Drop up to 100 screenshots",
    hint: "or a folder — they open together, in one style",
    button: "Choose files",
  },
  hero: {
    src: "/showcase/batch-hero.webp",
    alt: "The Shotcandy editor with a column of eight screenshot thumbnails on the left and the selected one styled on a sea-green background",
    pills: ["8 images", "Sea Glass Stack", "Export all"],
    width: 1100,
    height: 688,
  },
  stepsTitle: "How to edit screenshots in bulk",
  steps: [
    [
      "Drop them in",
      "Drop several screenshots or a whole folder, paste, or choose files. They're sorted by name, so shot-2 comes before shot-10.",
    ],
    [
      "Style them all",
      "Pick a style and every image gets it. Switch to This image to change one without touching the rest.",
    ],
    [
      "Export all",
      "Save a ZIP, write straight into a folder (Chrome and Edge on a computer), or share from a phone. Names are kept.",
    ],
  ],
  examplesTitle: "One style, three screenshots",
  more: { label: "Open the editor", href: "/?style=sea-glass" },
  examples: [
    {
      src: "/showcase/batch-1.webp",
      name: "Dashboard",
      note: "Sea Glass Stack",
      width: 720,
      height: 540,
      alt: "An analytics dashboard stacked on two pale cards on a mint-to-blue gradient",
    },
    {
      src: "/showcase/batch-2.webp",
      name: "Settings",
      note: "same style",
      width: 720,
      height: 540,
      alt: "A dark settings screen in the same stacked style on the same gradient",
    },
    {
      src: "/showcase/batch-3.webp",
      name: "Project board",
      note: "same style",
      width: 720,
      height: 540,
      alt: "A project board in the same stacked style on the same gradient",
    },
  ],
  uses: {
    title: "When a batch saves the afternoon",
    intro:
      "Styling one screenshot takes seconds. Styling forty for a docs site by hand, and keeping them consistent, is where a batch helps.",
    items: [
      [
        "Documentation and help centres",
        "Give every screenshot in a guide the same background and padding, then drop the ZIP into your docs folder. The file names already match your Markdown.",
      ],
      [
        "Release notes and changelogs",
        "Style every screen from a release in one pass, so the post looks like one piece.",
      ],
      [
        "Course slides and tutorials",
        "Frame thirty steps of a walkthrough the same way. A 16:9 size keeps them all slide-shaped.",
      ],
      [
        "Portfolio and case studies",
        "Put each screen of a project in a matching device or window frame.",
      ],
      [
        "Social sizes",
        "Pick one size for the batch, like X or Instagram, or give a single image its own size.",
      ],
      [
        "Link previews",
        "Make a 1200 × 630 Open Graph image for every page from its screenshot, in one export.",
      ],
    ],
  },
  sections: [
    {
      title: "One style for all, with exceptions",
      body: (
        <>
          <p>
            A batch is one shared style plus each image&apos;s own changes. With the switch on{" "}
            <b>All</b>, a new background, frame, shadow, size or motion goes to every image. Flip it
            to <b>This image</b> and the change stays on the image in front of you; the others
            don&apos;t move. Small dots on the thumbnails show which images have their own changes.
          </p>
          <p>
            Each image keeps its own annotations, caption and crop, so an arrow on one screenshot
            never lands on the next. Blur and pixelate boxes are per image too, which matters when
            you&apos;re <Link href="/redact-screenshot/">hiding personal details</Link> before you
            export.
          </p>
        </>
      ),
    },
    {
      title: "Export as a ZIP, into a folder, or to your phone's share sheet",
      body: (
        <>
          <p>
            <b>Export all</b> renders the images one at a time with your export settings (PNG, JPEG
            or WebP, 1× to 4×) and streams them into a ZIP. In Chrome and Edge on a computer it can
            instead write them into a new Shotcandy folder inside a folder you pick. On a phone, it
            hands the files to the share sheet.
          </p>
          <p>
            Every file keeps its original name: <code>login.png</code> comes out as{" "}
            <code>login.png</code>. If two names clash, the second gets &quot;(2)&quot;. If one
            image fails, the rest still export and you can retry the ones that didn&apos;t.
          </p>
        </>
      ),
    },
    {
      title: "Limits, stated plainly",
      body: (
        <ul>
          <li>Up to 100 images on a computer and 30 on a phone, to stay within memory.</li>
          <li>
            Batches work in Screenshot mode. Screen recordings open on their own and are skipped if
            you drop them with images.
          </li>
          <li>
            Writing into a folder needs Chrome or Edge on a computer; everywhere else it&apos;s a
            ZIP.
          </li>
          <li>
            The batch is saved in your browser and survives a reload. It isn&apos;t uploaded
            anywhere, so it won&apos;t follow you to another device.
          </li>
        </ul>
      ),
    },
    {
      title: "From a batch to one multi-screen design",
      body: (
        <p>
          Select 2 to 6 images in the list (Shift-click, or ⌘-click on a Mac and Ctrl-click
          elsewhere) and choose <b>Combine into one design</b>. They become one image in a layout
          such as Side by side, Hero or Grid, with the batch&apos;s style. See{" "}
          <Link href="/screenshot-mockup/">multi-screen mockups</Link> for the six layouts.
        </p>
      ),
    },
  ],
  compare: {
    title: "Batch screenshot tools compared",
    intro:
      "Most screenshot beautifiers style one image at a time. These are the tools we found that handle many at once.",
    tools: [TOOLS.shotcandy, TOOLS.studio, TOOLS.rotato, TOOLS.canva],
    rows: [
      {
        feature: "Price",
        values: ["Free", "Free", "$79 to $199 one-time", "Bulk Create needs a paid plan"],
      },
      {
        feature: "How it batches",
        values: [
          "Drop images or a folder, one shared style",
          "Slides in a project share one style",
          "Drag screenshots onto a scene, render all",
          "Fills a template from CSV or Sheets data",
        ],
      },
      {
        feature: "Change one image only",
        values: ["Yes", "Not in the main editor", "Not listed", "Yes, per design"],
      },
      {
        feature: "Output",
        values: ["ZIP, a folder, or share sheet", "ZIP", "A folder you pick", "Designs in Canva"],
      },
      {
        feature: "Keeps file names",
        values: ["Yes", "Not listed", "Can use them as labels", "Not listed"],
      },
      {
        feature: "Runs on",
        values: ["Any browser", "Browser", "Mac", "Browser and apps, desktop only for Bulk Create"],
      },
    ],
    checked: COMPARE_CHECKED,
    note: (
      <>
        Rotato&apos;s batch rendering is described in its{" "}
        <a href="https://rotato.app/help/batch-rendering" target="_blank" rel="noopener noreferrer">
          help centre
        </a>
        ; Canva&apos;s in its{" "}
        <a href="https://www.canva.com/help/bulk-create/" target="_blank" rel="noopener noreferrer">
          Bulk Create help
        </a>
        .
      </>
    ),
  },
  faqTitle: "Batch screenshot editor FAQ",
  faq: [
    [
      "How many screenshots can I edit at once?",
      "Up to 100 on a computer and 30 on a phone. Drop more and Shotcandy tells you how many it skipped.",
    ],
    [
      "Can I drop a whole folder?",
      "Yes. Drop a folder onto the editor, or choose Add a folder… from the ••• menu. Folders inside it are read too, and hidden files are ignored.",
    ],
    [
      "Will my file names be kept?",
      "Yes. With the default file name setting, login.png exports as login.png. You can also set your own pattern with the original name and a number.",
    ],
    [
      "Can one screenshot look different from the rest?",
      "Yes. Switch from All to This image and change it. The other images keep the shared style.",
    ],
    [
      "Are my screenshots uploaded?",
      "No. Import, styling and export all happen in your browser. The batch is kept in your browser's storage so a reload doesn't lose it.",
    ],
    [
      "Can I batch screen recordings?",
      "Not yet. Recordings open one at a time; if you drop them with images they're skipped and the images carry on.",
    ],
    [
      "Does it work on a phone?",
      "Yes, with up to 30 images. Export all sends the files to your phone's share sheet, so you can save them to Photos or Files.",
    ],
  ],
  related: [
    { label: "Screenshot beautifier", href: "/screenshot-beautifier/" },
    { label: "Multi-screen mockup", href: "/screenshot-mockup/" },
    { label: "Redact a screenshot", href: "/redact-screenshot/" },
    { label: "App Store screenshots", href: "/app-store-screenshots/" },
  ],
  cta: "Open the editor and drop in a folder.",
};

export default function Page() {
  return <ToolLanding d={d} />;
}
