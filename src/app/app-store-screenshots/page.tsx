import Link from "next/link";
import { ToolLanding, pageMetadata, type ToolPageData } from "@/components/site/ToolLanding";
import { COMPARE_CHECKED, TOOLS } from "@/config/compare";
import { APPSTORE_SIZES, SET_MAX_SLIDES, SET_MIN_SLIDES } from "@/engine/appstore/set";

const APPLE =
  "https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/";
const DESC = `Make App Store screenshots at Apple's exact sizes: ${SET_MIN_SLIDES} to ${SET_MAX_SLIDES} slides with headlines, device frames and one style. Free, no sign-up, nothing uploaded.`;

export const metadata = pageMetadata({
  path: "/app-store-screenshots/",
  title: "App Store screenshot generator, free · Shotcandy",
  social: "Free App Store screenshot generator, at Apple's exact sizes",
  description: DESC,
  image: "/og/app-store-screenshots.png",
});

const px = (w: number, h: number) => `${w} × ${h}`;

const d: ToolPageData = {
  slug: "app-store-screenshots",
  crumb: "App Store screenshots",
  description: DESC,
  ogImage: "/og/app-store-screenshots.png",
  h1: (
    <>
      Free App Store screenshot generator, at <em>Apple&apos;s exact sizes</em>
    </>
  ),
  lede: `Build a set of ${SET_MIN_SLIDES} to ${SET_MAX_SLIDES} App Store screenshots with headlines, your screens in a phone or tablet frame, and one style across all of them. Export a ZIP of PNGs App Store Connect accepts.`,
  style: "sherbet",
  frameLabel: "App Store set",
  editorHref: "/?mode=appstore",
  target: {
    mode: "appstore",
    multiple: { max: SET_MAX_SLIDES },
    title: `Drop up to ${SET_MAX_SLIDES} app screenshots`,
    hint: "or paste one — they fill the slides of a set, in order",
    button: "Choose files",
  },
  hero: {
    src: "/showcase/appstore-hero.webp",
    alt: "Three App Store slides for a habit tracker in the Sherbet style, each with a headline above the same phone screenshot in a drawn phone frame",
    pills: ['iPhone 6.9"', "1320 × 2868", "Sherbet"],
    width: 1100,
    height: 800,
  },
  stepsTitle: "How to make App Store screenshots",
  steps: [
    [
      "Add your screens",
      "Drop your app screenshots above, or open App Store mode and add them slide by slide.",
    ],
    [
      "Write the headlines",
      "Each slide has a headline and a subhead. Pick a style and it applies to every slide at once.",
    ],
    [
      "Export the set",
      "Choose the size and download every slide as a PNG in one ZIP, ready for App Store Connect.",
    ],
  ],
  examplesTitle: "Sets made in App Store mode",
  more: { label: "Open App Store mode", href: "/?mode=appstore" },
  examples: [
    {
      src: "/showcase/appstore-1.webp",
      name: "Grape Soda",
      note: 'iPhone 6.9"',
      width: 720,
      height: 524,
      alt: "Three iPhone App Store slides on a purple background with white headlines",
    },
    {
      src: "/showcase/appstore-2.webp",
      name: "Mint Julep",
      note: 'iPhone 6.9"',
      width: 720,
      height: 524,
      alt: "Three iPhone App Store slides on a mint green background with dark green headlines",
    },
    {
      src: "/showcase/appstore-3.webp",
      name: "Paper",
      note: 'iPad 13", landscape',
      width: 720,
      height: 524,
      alt: "Two landscape iPad App Store slides for a reading app on a paper background",
    },
  ],
  uses: {
    title: "What you can do with it",
    intro:
      "App Store mode is a small, focused tool: a set of slides that share one design, at a size Apple accepts.",
    items: [
      [
        "A first set for a new app",
        "Five slides with a headline each is enough for a launch. Start from the example headlines and replace them.",
      ],
      [
        "iPad screenshots",
        'Switch the size to iPad 13", 12.9" or 11" and the frame becomes a tablet. Landscape works too.',
      ],
      [
        "A background that flows",
        "Turn on the flowing background and it's painted across all slides, so the set reads as one strip in the store.",
      ],
      [
        "Refreshing an old set",
        "Drop in new screenshots over the old ones; headlines and style stay as they were.",
      ],
      [
        "Wide screenshots in a phone",
        "A landscape screenshot can be cropped to a phone shape on a slide, so you can show one part of a larger screen.",
      ],
      [
        "Store listing images elsewhere",
        "Use the same slides on your website or in a Product Hunt gallery; export them again at another size.",
      ],
    ],
  },
  sections: [
    {
      id: "sizes",
      title: "App Store screenshot sizes (2026)",
      body: (
        <>
          <p>
            These are the sizes Shotcandy exports, from Apple&apos;s{" "}
            <a href={APPLE} target="_blank" rel="noopener noreferrer">
              screenshot specifications
            </a>
            . Apple accepts a few other sizes for some displays too.
          </p>
          <div className="compare-scroll" role="region" aria-label="App Store sizes" tabIndex={0}>
            <table className="compare">
              <thead>
                <tr>
                  <th scope="col">Display</th>
                  <th scope="col">Portrait (px)</th>
                  <th scope="col">Landscape (px)</th>
                </tr>
              </thead>
              <tbody>
                {APPSTORE_SIZES.map((s) =>
                  s.size.kind === "fixed" ? (
                    <tr key={s.id}>
                      <th scope="row">{s.label}</th>
                      <td>{px(s.size.width, s.size.height)}</td>
                      <td>{px(s.size.height, s.size.width)}</td>
                    </tr>
                  ) : null,
                )}
              </tbody>
            </table>
          </div>
          <p>
            Apple asks for iPhone screenshots at 6.9&quot; (or 6.5&quot; if you don&apos;t provide
            6.9&quot;) and, if the app runs on iPad, at 13&quot;. Smaller displays use scaled copies
            of the larger ones unless you upload their own. You can upload 1 to 10 screenshots per
            size, as JPEG or PNG, with no transparency.
          </p>
        </>
      ),
    },
    {
      title: "PNGs App Store Connect accepts",
      body: (
        <>
          <p>
            App Store Connect rejects images with an alpha channel. Shotcandy writes the set&apos;s
            PNGs without one, so rounded corners and shadows sit on the background colour instead of
            transparency, and the upload goes through.
          </p>
          <p>
            Each slide is the exact pixel size of the preset. The ZIP names files by slide number
            and headline, like <code>01-habits-that-actually-stick.png</code>, so they sort in the
            order you upload them.
          </p>
        </>
      ),
    },
    {
      title: "Style every slide at once",
      body: (
        <p>
          Six set styles (Sherbet, Grape Soda, Mint Julep, Aurora, Licorice and Paper) change the
          background, frame, shadow and text colours of every slide together. You can still set the
          headline font and size, put text above or below the device, align it left or centre, and
          let the device fit the slide or run off its edge. For single screenshots in the same
          styles, use the <Link href="/screenshot-beautifier/">screenshot beautifier</Link>.
        </p>
      ),
    },
    {
      title: "What it doesn't do",
      body: (
        <p>
          There are no Google Play sizes yet, no localisation of headlines, and no direct upload to
          App Store Connect. If you need those for many languages, a paid tool like AppScreens is
          built for it.
        </p>
      ),
    },
  ],
  compare: {
    title: "Free App Store screenshot tools compared",
    tools: [
      TOOLS.shotcandy,
      TOOLS.studio,
      TOOLS.appscreens,
      TOOLS.applaunchpad,
      TOOLS.screenshotspro,
    ],
    rows: [
      {
        feature: "Price",
        values: [
          "Free",
          "Free",
          "Free tier; Pro $25/mo or $99/yr",
          "Free tier; Pro $29/mo or $15/mo yearly",
          "Free Basic; from $19/mo",
        ],
      },
      {
        feature: "Free tier",
        values: [
          `Everything, ${SET_MIN_SLIDES} to ${SET_MAX_SLIDES} slides`,
          "Up to 10 slides",
          "5 screenshots, 1 project",
          "Limited exports",
          "All devices and templates",
        ],
      },
      {
        feature: "Account",
        values: ["None", "None", "Yes", "Not listed", "Sign-up button"],
      },
      {
        feature: "Google Play sizes",
        values: ["No", "Not listed", "Yes", "Not listed", "Not listed"],
      },
      {
        feature: "Localised headlines",
        values: ["No", "Not listed", "Pro", "Pro (AI)", "Standard plan"],
      },
      {
        feature: "Open source",
        values: ["Yes, MIT", "Yes, Apache 2.0", "No", "No", "No"],
      },
    ],
    checked: COMPARE_CHECKED,
  },
  faqTitle: "App Store screenshot FAQ",
  faq: [
    [
      "What size should App Store screenshots be?",
      "For iPhone, 1320 × 2868 (6.9-inch) portrait or 2868 × 1320 landscape. For iPad, 2064 × 2752 (13-inch). Apple scales these down for smaller displays if you don't upload their own.",
    ],
    [
      "How many screenshots can I upload?",
      "Apple allows 1 to 10 per display size. Shotcandy sets have 3 to 10 slides.",
    ],
    [
      "Why was my PNG rejected by App Store Connect?",
      "Usually because it has an alpha channel (transparency). Shotcandy's App Store exports are saved without one.",
    ],
    [
      "Is it really free, with no watermark?",
      "Yes. There's no account, no plan and no watermark. The project is open source under the MIT license.",
    ],
    [
      "Are my app screenshots uploaded?",
      "No. The slides are rendered in your browser, and the ZIP is built there too.",
    ],
    [
      "Can I make Google Play screenshots?",
      "Not with a Play preset. You can export slides at an iPhone size and check them against Google Play's own rules, but there's no dedicated Play size yet.",
    ],
  ],
  related: [
    { label: "Batch screenshot editor", href: "/batch-screenshot-editor/" },
    { label: "Multi-screen mockup", href: "/screenshot-mockup/" },
    { label: "Screenshot beautifier", href: "/screenshot-beautifier/" },
    { label: "Phone mockup", href: "/?style=phone-sorbet" },
  ],
  cta: "Open App Store mode with a five-slide set ready to fill.",
};

export default function Page() {
  return <ToolLanding d={d} />;
}
