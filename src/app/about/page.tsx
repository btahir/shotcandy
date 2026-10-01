import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { SiteFooter, SiteNav } from "@/components/site/Site";
import { Breadcrumbs, pageMetadata } from "@/components/site/ToolLanding";
import { CHANGELOG_URL, CREATOR, GITHUB_URL, SUPPORT_URL } from "@/config/site";
import { STYLE_PRESETS } from "@/engine/presets/styles";
import { CODE_LANGUAGE_COUNT, jsonLd, webPageGraph } from "@/lib/jsonld";

const DESC =
  "Shotcandy is a free, open-source screenshot and screen recording beautifier that runs in your browser. No account, no upload, no watermark.";

export const metadata: Metadata = pageMetadata({
  path: "/about/",
  title: "About Shotcandy: free, open-source screenshot tool",
  social: "About Shotcandy: sweet screenshots, free forever",
  description: DESC,
  image: "/og/about.png",
});

const CRUMBS = [
  { label: "Home", href: "/" },
  { label: "About", href: "/about/" },
];

const FEATURES: [string, string][] = [
  ["Paste, drop or pick", "PNG, JPEG and WebP screenshots"],
  ["Screen recordings", "MP4, MOV or WebM: trim, keep or drop the sound, export as video"],
  ["Many screenshots at once", "up to 100 in one style, with changes per image, saved as a ZIP"],
  [
    "Multi-screen designs",
    "2 to 6 screenshots in one image, in six layouts from side by side to grid",
  ],
  [`${STYLE_PRESETS.length} one-click styles`, "tilts, peeks, stacks and prints, on your own shot"],
  ["Gradients, mesh and wallpapers", "plus colours picked from your image"],
  ["Minimal styles", "plain white, soft grey, outline, graphite and a design-canvas look"],
  ["Frames", "macOS window, browser, phone, tablet, laptop, design canvas"],
  ["Annotations", "text, arrows and highlights"],
  ["Redaction", "blur, pixelate or a solid box over anything private"],
  ["Code images", `${CODE_LANGUAGE_COUNT} languages, 8 themes, highlighted lines`],
  ["App Store sets", "3 to 10 slides at Apple's exact sizes, exported as a ZIP"],
  ["Post and testimonial cards", "a name, handle, avatar and your words, no third-party API"],
  ["Motion", "zoom, float, 3D sweep and more, exported as MP4, WebM or GIF"],
  ["Every social size", "Open Graph, X, LinkedIn, Instagram, Product Hunt, App Store"],
  ["Export 1× to 4×", "PNG, JPEG, WebP, MP4, WebM or GIF, or copy to clipboard"],
  ["Save your own styles", "and back up projects as a file"],
  ["Keyboard friendly", "every control reachable, shortcuts for the rest"],
  ["Light and dark", "follows your system"],
];

const FAQ: [string, string][] = [
  [
    "Does my screenshot leave my computer?",
    "No. Shotcandy is a static website. Your image is decoded and drawn with the canvas API inside your browser tab, and exports are generated there too. There is no server to send it to.",
  ],
  [
    "Can I style a screen recording?",
    "Yes. Drop in an MP4, MOV or WebM recording (up to 10 minutes) and it gets the same backgrounds, frames, tilt and blur as a screenshot. Trim it, keep or drop the sound, add a motion, and export MP4, WebM or GIF. Like screenshots, recordings never leave your browser. If your browser can't play a file (HEVC outside Safari, for example), re-save it as H.264.",
  ],
  [
    "Can I style lots of screenshots at once?",
    "Yes. In Screenshot mode, drop, paste or add several images, or a whole folder: up to 100 on a computer, 30 on a phone. They share one style, and the All / This image switch lets you change a single image. Export them all as a ZIP, straight into a folder in Chrome or Edge on a computer, or to the share sheet on a phone. Each file keeps its original name, and nothing is uploaded.",
  ],
  [
    "Can I put several screenshots in one image?",
    "Yes. Under Screens, pick a layout (Side by side, Overlap, Hero, Cascade, Fan or Grid) and add 2 to 6 screenshots. Every style works with it. In a batch, select 2 to 6 images and choose Combine into one design. Screen recordings stay single.",
  ],
  [
    "Can I use the images commercially?",
    "Yes. Your exports are yours. The built-in wallpapers and frames are part of the project and MIT licensed.",
  ],
  [
    "Is there a watermark or a paid plan?",
    "No watermark, no plan, no locked features. Support is optional and changes nothing in the app.",
  ],
  [
    "How do I report a bug or suggest a style?",
    "Open an issue on the repository. Style suggestions with a screenshot are very welcome.",
  ],
];

export default function AboutPage() {
  return (
    <div className="page">
      <SiteNav active="about" />
      <main>
        <section className="wrap about-hero">
          <div>
            <Breadcrumbs trail={CRUMBS} />
            <span className="eyebrow">
              <span className="dot">MIT</span> Free and open source
            </span>
            <h1 className="h1" style={{ marginTop: 18 }}>
              Sweet screenshots, <em>free forever.</em>
            </h1>
            <p className="lede" style={{ marginTop: 16, maxWidth: 500 }}>
              Shotcandy is a free, open-source screenshot beautifier that runs in your browser. It
              turns a plain screenshot or screen recording into a share-ready image or video in a
              few seconds: no account, no upload, no watermark, no paywall.
            </p>
            <div style={{ display: "flex", gap: 10, marginTop: 28, flexWrap: "wrap" }}>
              <Link className="btn btn-primary btn-xl" href="/">
                Open the editor
              </Link>
              <a
                className="btn btn-secondary btn-xl"
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer"
              >
                <Icon name="code" /> View the source
              </a>
            </div>
          </div>
          <div className="ba" aria-label="Before and after">
            <div className="raw">
              <img
                src="/samples/sample-kanban-light.webp"
                alt="A plain screenshot of a kanban board"
                width={1440}
                height={900}
              />
            </div>
            <span className="raw-label">Before</span>
            <svg className="swirl" viewBox="0 0 120 90" fill="none" aria-hidden="true">
              <path
                d="M6 70C30 86 70 84 96 46"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray="1 9"
              />
              <path
                d="M84 40l14 4-3 14"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="sweet-label">After · Tangerine Dream</span>
            <div className="sweet">
              <img
                src="/showcase/about-after.webp"
                alt="The same kanban screenshot in a macOS window on a tangerine gradient"
                width={840}
                height={630}
                fetchPriority="high"
              />
            </div>
          </div>
        </section>

        <section className="section">
          <div className="wrap grid-3">
            <div className="card-soft pillar">
              <div
                className="icon-badge"
                style={{ background: "var(--sc-success-soft)", color: "var(--sc-success)" }}
              >
                <Icon name="lock" />
              </div>
              <h2 className="h3">Private by design</h2>
              <p className="body-copy">
                Images are processed on your device with the HTML canvas. Nothing is uploaded, ever.
                Saved styles live in your browser.
              </p>
            </div>
            <div className="card-soft pillar">
              <div
                className="icon-badge"
                style={{ background: "var(--sc-accent-soft)", color: "var(--sc-accent-text)" }}
              >
                <Icon name="heart" />
              </div>
              <h2 className="h3">Free, really</h2>
              <p className="body-copy">
                Every feature is free: 4× export, every frame, every background. No sign-up, no
                watermark, no “Pro” badge.
              </p>
            </div>
            <div className="card-soft pillar">
              <div
                className="icon-badge"
                style={{
                  background: "color-mix(in srgb, var(--sc-grape-500) 18%, transparent)",
                  color: "var(--sc-grape-700)",
                }}
              >
                <Icon name="code" />
              </div>
              <h2 className="h3">Open source</h2>
              <p className="body-copy">
                MIT licensed. Read the code, run it yourself, fork it, or send a pull request. Built
                with Next.js and a small canvas renderer.
              </p>
            </div>
          </div>
        </section>

        <section className="wrap" style={{ paddingBottom: 72 }} id="support">
          <div className="support">
            <div style={{ position: "relative", zIndex: 1 }}>
              <span className="eyebrow">
                <span className="dot">
                  <Icon name="heart" size="xs" />
                </span>{" "}
                Support this project
              </span>
              <h2 className="h2" style={{ marginTop: 16 }}>
                Keep the candy jar full
              </h2>
              <p className="body-copy" style={{ marginTop: 12, maxWidth: 480 }}>
                Shotcandy costs nothing to use and never will. If it saves you time, a small one-off
                tip helps pay for the domain and the evenings spent maintaining it. Thank you!
              </p>
              <div style={{ display: "flex", gap: 10, marginTop: 22, flexWrap: "wrap" }}>
                <Link className="btn btn-primary btn-xl" href={SUPPORT_URL}>
                  <Icon name="heart" /> Support this project
                </Link>
                <a
                  className="btn btn-secondary btn-xl"
                  href={GITHUB_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  Star the repo
                </a>
              </div>
              <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>
                Pay what you like, once. Monthly support is optional.
              </p>
            </div>
            <div className="jar-illo">
              <img src="/icons/icon-512.png" alt="" width={220} height={220} loading="lazy" />
            </div>
          </div>
        </section>

        <section className="section alt">
          <div className="wrap split-2">
            <div>
              <h2 className="h2">What’s inside</h2>
              <p className="body-copy" style={{ marginTop: 12 }}>
                Everything you need to make a screenshot or recording look good, and nothing you
                have to pay for.
              </p>
            </div>
            <ul className="feature-list">
              {FEATURES.map(([a, b]) => (
                <li key={a}>
                  <Icon name="check" />
                  <span>
                    <b>{a}</b> — {b}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="section">
          <div className="wrap split-2">
            <div>
              <h2 className="h2">Questions about Shotcandy</h2>
            </div>
            <div className="faq">
              {FAQ.map(([q, a], i) => (
                <details key={q} open={i === 0}>
                  <summary>
                    {q} <Icon name="chevronDown" />
                  </summary>
                  <p>{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="section alt">
          <div className="wrap split-2 tight">
            <h2 className="h2">Who makes it</h2>
            <div className="prose">
              <p>
                Shotcandy is made by{" "}
                <a href={CREATOR.url} target="_blank" rel="noreferrer">
                  {CREATOR.name}
                </a>{" "}
                and maintained in the open on{" "}
                <a href={GITHUB_URL} target="_blank" rel="noreferrer">
                  GitHub
                </a>
                , where issues, style ideas and pull requests are welcome.
              </p>
              <p>
                What changed and when is in the{" "}
                <a href={CHANGELOG_URL} target="_blank" rel="noreferrer">
                  changelog
                </a>
                . The latest version added batches of up to 100 screenshots and multi-screen
                designs.
              </p>
              <h3>How it compares</h3>
              <p>
                There are good paid and free tools in this space. Shotcandy&apos;s differences are
                that everything is free, nothing is uploaded, and the code is MIT licensed. If you
                need 3D device scenes or screen capture built in, another tool may suit you better;
                the <Link href="/alternatives/">alternatives page</Link> compares them fairly. Every
                tool Shotcandy has is listed on the <Link href="/tools/">tools page</Link>.
              </p>
            </div>
          </div>
        </section>

        <section className="wrap" style={{ paddingTop: 56, paddingBottom: 64 }}>
          <h2 className="h3" style={{ marginBottom: 12 }}>
            Credits
          </h2>
          <table className="credits">
            <tbody>
              <tr>
                <th scope="row">Type</th>
                <td>
                  Bricolage Grotesque, Figtree and Geist Mono, all under the SIL Open Font License
                  1.1
                </td>
              </tr>
              <tr>
                <th scope="row">Wallpapers</th>
                <td>Generated for Shotcandy and released under MIT with the project</td>
              </tr>
              <tr>
                <th scope="row">Frames</th>
                <td>Our own vector drawings; not affiliated with any device maker</td>
              </tr>
              <tr>
                <th scope="row">Video</th>
                <td>Mediabunny (MPL-2.0) reads and converts screen recordings in your browser</td>
              </tr>
              <tr>
                <th scope="row">Sample screenshots</th>
                <td>Fictional apps built in HTML for demos</td>
              </tr>
            </tbody>
          </table>
        </section>
      </main>
      <SiteFooter />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(
            webPageGraph({
              path: "/about/",
              type: "AboutPage",
              name: "About Shotcandy",
              description: DESC,
              crumbs: CRUMBS,
            }),
          ),
        }}
      />
    </div>
  );
}
