import Link from "next/link";
import { ToolLanding, pageMetadata, type ToolPageData } from "@/components/site/ToolLanding";

const DESC =
  "Make a 1200×630 link-preview image from any screenshot. Sizes for X, LinkedIn and Facebook. Free, open source, runs in your browser.";

export const metadata = pageMetadata({
  path: "/og-image-maker/",
  title: "Open Graph image maker (1200×630), free · Shotcandy",
  social: "Make an Open Graph image from any screenshot",
  description: DESC,
  image: "/og/og-image-maker.png",
});

const META = "https://developers.facebook.com/docs/sharing/webmasters/images/";
const X_ADS = "https://business.x.com/en/help/campaign-setup/creative-ad-specifications";
const LINKEDIN = "https://www.linkedin.com/help/lms/answer/a426534";

const SIZES: [string, string, string][] = [
  ["Open Graph (Facebook, Slack, iMessage)", "1200 × 630", "1.91:1"],
  ["X link card", "1200 × 628", "1.91:1"],
  ["X image post", "1920 × 1080", "16:9"],
  ["X portrait post", "1440 × 1800", "4:5"],
  ["LinkedIn link or image post", "1200 × 628", "1.91:1"],
  ["LinkedIn square", "1200 × 1200", "1:1"],
  ["LinkedIn portrait", "720 × 900", "4:5"],
  ["Product Hunt gallery", "1270 × 760", "about 5:3"],
];

const d: ToolPageData = {
  slug: "og-image-maker",
  crumb: "Open Graph image maker",
  description: DESC,
  ogImage: "/og/og-image-maker.png",
  h1: (
    <>
      Make an <em>Open Graph image</em> from any screenshot
    </>
  ),
  lede: "Link previews at exactly 1200 × 630, the size Facebook, LinkedIn, Slack and X expect. Paste a screenshot, pick a style, export. Nothing leaves your browser.",
  style: "aurora-pop",
  size: "og",
  frameLabel: "1200 × 630 canvas",
  hero: {
    src: "/showcase/og-hero.webp",
    alt: "A landing page screenshot on a dark aurora mesh background at 1200 by 630",
    pills: ["1200 × 630", "Aurora Stack", "Open Graph"],
    width: 1100,
    height: 578,
  },
  stepsTitle: "How to make an Open Graph image",
  steps: [
    ["Paste", "Copy a screenshot of your page and press ⌘V (Ctrl+V), drop a file, or pick one."],
    [
      "Pick a style",
      "The canvas is already 1200 × 630. Choose a background, frame and shadow; your shot fits automatically.",
    ],
    ["Export", "Download a PNG or JPEG at 1× or 2× and add it to your page's og:image tag."],
  ],
  examples: [
    {
      src: "/showcase/og-1.webp",
      name: "Sherbet",
      note: "light window",
      width: 720,
      height: 378,
      alt: "A dashboard in a light window on a pink gradient, at Open Graph size",
    },
    {
      src: "/showcase/og-2.webp",
      name: "Licorice",
      note: "dark browser",
      width: 720,
      height: 378,
      alt: "A dark notes app in a dark browser frame, at Open Graph size",
    },
    {
      src: "/showcase/og-3.webp",
      name: "Gummy",
      note: "on a wallpaper",
      width: 720,
      height: 378,
      alt: "A project board on a colourful blob wallpaper, at Open Graph size",
    },
  ],
  uses: {
    intro:
      "An Open Graph image is the picture that shows when someone shares your link. A screenshot of the product usually beats a stock photo or a logo on a flat colour.",
    items: [
      [
        "Landing pages",
        "Show the product itself in the preview. People see what they'll get before they click.",
      ],
      [
        "Blog posts and changelogs",
        "Make one per post from a screenshot of the feature you wrote about.",
      ],
      [
        "Docs pages",
        "Give each section its own preview, so links shared in Slack or Discord say which page they point to.",
      ],
      [
        "Product Hunt gallery",
        "There's a 1270 × 760 preset for Product Hunt's gallery images, next to the Open Graph one.",
      ],
      [
        "Launch posts",
        "Export the same design at X, LinkedIn and Open Graph sizes by switching the size preset; the screenshot refits each time.",
      ],
      [
        "Several screens",
        "Put 2 or 3 screenshots side by side in one preview with a multi-screen layout.",
      ],
    ],
  },
  sections: [
    {
      id: "sizes",
      title: "Open Graph image sizes at a glance",
      body: (
        <>
          <p>
            Every size below is a preset in the editor&apos;s size menu (press <kbd>K</kbd>). The
            numbers come from each platform&apos;s own documentation.
          </p>
          <div className="compare-scroll" role="region" aria-label="Image sizes" tabIndex={0}>
            <table className="compare">
              <thead>
                <tr>
                  <th scope="col">Where</th>
                  <th scope="col">Size (px)</th>
                  <th scope="col">Shape</th>
                </tr>
              </thead>
              <tbody>
                {SIZES.map(([where, size, ratio]) => (
                  <tr key={where}>
                    <th scope="row">{where}</th>
                    <td>{size}</td>
                    <td>{ratio}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ),
    },
    {
      id: "x",
      title: "X (Twitter) card image size",
      body: (
        <>
          <p>
            A link on X shows a large image card when the page has <code>twitter:card</code> set to{" "}
            <code>summary_large_image</code>. The card is 1.91:1, so 1200 × 628 (or the Open Graph
            1200 × 630) fills it with no cropping. X&apos;s{" "}
            <a href={X_ADS} target="_blank" rel="noopener noreferrer">
              image specifications
            </a>{" "}
            cap images at 5 MB.
          </p>
          <p>
            For an image posted on its own (not a link), use the <b>X post</b> preset at 1920 ×
            1080, or <b>X portrait</b> at 1440 × 1800 to take up more of the timeline.
          </p>
        </>
      ),
    },
    {
      id: "linkedin",
      title: "LinkedIn preview image size",
      body: (
        <p>
          LinkedIn&apos;s{" "}
          <a href={LINKEDIN} target="_blank" rel="noopener noreferrer">
            image guidance
          </a>{" "}
          lists 1200 × 628 for link and landscape image posts, 1200 × 1200 for square and 720 × 900
          for portrait, with a 5 MB limit. Link previews read your page&apos;s <code>og:image</code>
          , so an Open Graph image covers LinkedIn too.
        </p>
      ),
    },
    {
      id: "facebook",
      title: "Facebook link preview size",
      body: (
        <>
          <p>
            Meta&apos;s{" "}
            <a href={META} target="_blank" rel="noopener noreferrer">
              sharing guide
            </a>{" "}
            asks for at least 1200 × 630 at 1.91:1, up to 8 MB. Smaller images can show as a small
            thumbnail next to the link instead of a large card. Slack, Discord, iMessage and
            WhatsApp read the same <code>og:image</code> tag.
          </p>
          <p>
            Add it to your page&apos;s head like this:{" "}
            <code>
              &lt;meta property=&quot;og:image&quot; content=&quot;https://…/og.png&quot;&gt;
            </code>
            , plus <code>og:image:width</code> and <code>og:image:height</code> so previews
            don&apos;t have to download the image to size the card.
          </p>
        </>
      ),
    },
    {
      title: "Made by hand or by code?",
      body: (
        <p>
          If every page on your site needs its own preview with the page title in it, generating
          them in code (for example with <code>@vercel/og</code> or Satori) scales better. Shotcandy
          is for the pages where a real screenshot says more than a title: the homepage, a launch, a
          feature, a changelog entry. It takes a minute, and there&apos;s no template to maintain.
          See the <Link href="/screenshot-beautifier/">screenshot beautifier</Link> for every style
          option.
        </p>
      ),
    },
  ],
  faqTitle: "Open Graph image FAQ",
  faq: [
    [
      "What size should an Open Graph image be?",
      "1200 × 630 pixels (1.91:1). Meta recommends at least that size for high-resolution displays; smaller images may show as a thumbnail instead of a large card.",
    ],
    [
      "Does it work for X and LinkedIn link cards?",
      "Yes. X link cards and LinkedIn link previews use the same 1.91:1 shape; there are dedicated 1200 × 628 presets too.",
    ],
    [
      "Is it free and private?",
      "Yes. No sign-up, no watermark, and your screenshot never leaves your browser.",
    ],
    [
      "Can I export at higher resolution?",
      "Yes, up to 4×. Keep the file under 8 MB for Facebook and 5 MB for X and LinkedIn. Export for a destination and Shotcandy checks the file fits.",
    ],
    [
      "PNG or JPEG?",
      "PNG keeps text and UI sharp. If the file is large because of a photo or a gradient, JPEG at high quality is usually much smaller and looks the same in a preview.",
    ],
    [
      "Can I make previews for a whole site at once?",
      "You can drop up to 100 screenshots, give them one style at 1200 × 630 and export them all as a ZIP with their original names.",
    ],
  ],
  related: [
    { label: "Screenshot beautifier", href: "/screenshot-beautifier/" },
    { label: "Batch screenshot editor", href: "/batch-screenshot-editor/" },
    { label: "macOS window frame", href: "/macos-window-frame/" },
    { label: "X post image", href: "/?size=x-post" },
    { label: "LinkedIn post image", href: "/?size=linkedin-post" },
  ],
  cta: "Open the editor on a 1200 × 630 canvas.",
};

export default function Page() {
  return <ToolLanding d={d} />;
}
