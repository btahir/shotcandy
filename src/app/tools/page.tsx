import Link from "next/link";
import { Icon } from "@/components/icons";
import { SiteFooter, SiteNav } from "@/components/site/Site";
import { Breadcrumbs, pageMetadata } from "@/components/site/ToolLanding";
import { COMPARE_PAGES, SITE_DEFINITION, TOOL_PAGES } from "@/config/site";
import { STYLE_PRESETS } from "@/engine/presets/styles";
import { jsonLd, webPageGraph } from "@/lib/jsonld";

const DESC =
  "Every Shotcandy tool in one place: beautifier, batch editor, multi-screen mockups, App Store sets, code images, OG images, window frames and redaction.";

export const metadata = pageMetadata({
  path: "/tools/",
  title: "Free screenshot tools, all in your browser · Shotcandy",
  social: "Free screenshot tools that run in your browser",
  description: DESC,
  image: "/og/tools.png",
});

/** A little more on each tool than the one-line blurb: what it's for and where to start. */
const MORE: Record<string, string> = {
  "/screenshot-beautifier/": `The main editor, with ${STYLE_PRESETS.length} one-click styles, wallpapers and 3D tilt. Start here if you have one screenshot and want it to look finished.`,
  "/batch-screenshot-editor/":
    "Drop them in, or a whole folder (30 on a phone). Any image can have its own changes, and file names are kept.",
  "/screenshot-mockup/":
    "Side by side, Overlap, Hero, Cascade, Fan and Grid. Every style and frame works, and you can combine images straight from a batch.",
  "/app-store-screenshots/":
    "Your screens go in a phone or tablet frame, one style covers the set, and the PNGs have no transparency, as App Store Connect wants.",
  "/code-screenshot/":
    "Eight themes, highlighted lines, line numbers and a window title. Add a motion for a video.",
  "/og-image-maker/":
    "There are Instagram and Product Hunt presets too, and a check that the file fits each platform's limit.",
  "/macos-window-frame/":
    "Auto matches the window to your screenshot, and you can add a title. There's a browser frame with your own URL too.",
  "/redact-screenshot/":
    "Drag over anything private. It happens in your browser, so the original is never uploaded.",
};

const CRUMBS = [
  { label: "Home", href: "/" },
  { label: "Tools", href: "/tools/" },
];

export default function ToolsPage() {
  return (
    <div className="page">
      <SiteNav active="tools" />
      <main>
        <section className="wrap hub-hero">
          <Breadcrumbs trail={CRUMBS} />
          <h1 className="h1">
            Free <em>screenshot tools</em> that run in your browser
          </h1>
          <p className="lede" style={{ marginTop: 16 }}>
            {SITE_DEFINITION} Each tool below is a way into the same editor, set up for one job.
          </p>
          <div style={{ display: "flex", gap: 10, marginTop: 24, flexWrap: "wrap" }}>
            <Link className="btn btn-primary btn-xl" href="/">
              Open the editor
            </Link>
          </div>
        </section>

        <section className="section" style={{ paddingTop: 16 }}>
          <div className="wrap">
            <h2 className="h2" style={{ marginBottom: 20 }}>
              All tools
            </h2>
            <ul className="hub-list">
              {TOOL_PAGES.map((t) => (
                <li key={t.href}>
                  <Link href={t.href}>
                    {t.label} <Icon name="chevronRight" size="sm" />
                  </Link>
                  <p>
                    {t.blurb} {MORE[t.href]}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="section alt">
          <div className="wrap split-2 tight">
            <div>
              <h2 className="h2">Compare</h2>
              <p className="body-copy" style={{ marginTop: 12 }}>
                Fair, dated comparisons with other screenshot tools, including when they&apos;re the
                better pick.
              </p>
            </div>
            <ul className="hub-list" style={{ gridTemplateColumns: "1fr" }}>
              {COMPARE_PAGES.map((t) => (
                <li key={t.href}>
                  <Link href={t.href}>
                    {t.label} <Icon name="chevronRight" size="sm" />
                  </Link>
                  <p>{t.blurb}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="section">
          <div className="wrap split-2 tight">
            <h2 className="h2">Also in the editor</h2>
            <div className="prose">
              <p>
                Some features don&apos;t have a page of their own yet. <b>Screen recordings</b>:
                drop in an MP4, MOV or WebM file and it gets the same backgrounds, frames and blur
                as a screenshot, then exports as MP4, WebM or GIF. <b>Post and testimonial cards</b>
                : type a post or a quote and get a styled card with a name, handle and avatar.{" "}
                <b>Motion</b>: eight presets, from Zoom in to 3D sweep, turn any design into a short
                loop.
              </p>
              <p>
                Everything is free, with no account and no watermark, and the code is on{" "}
                <a href="https://github.com/btahir/shotcandy" target="_blank" rel="noreferrer">
                  GitHub
                </a>{" "}
                under the MIT license. <Link href="/about/">About Shotcandy</Link>.
              </p>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(
            webPageGraph({
              path: "/tools/",
              type: "CollectionPage",
              name: "Shotcandy tools",
              description: DESC,
              crumbs: CRUMBS,
            }),
          ),
        }}
      />
    </div>
  );
}
