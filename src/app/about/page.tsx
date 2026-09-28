import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { SiteFooter, SiteNav } from "@/components/site/Site";
import { GITHUB_URL, SUPPORT_URL } from "@/config/site";
import { STYLE_PRESETS } from "@/engine/presets/styles";

const TITLE = "About Shotcandy — sweet screenshots, free forever";
const DESC =
  "Shotcandy is a free, open-source screenshot and screen recording beautifier that runs entirely in your browser: no account, no upload, no watermark, no paywall.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESC,
  alternates: { canonical: "/about/" },
  openGraph: {
    title: TITLE,
    description: DESC,
    url: "/about/",
    images: [{ url: "/og/about.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESC,
    images: ["/og/about.png"],
  },
};

const FEATURES: [string, string][] = [
  ["Paste, drop or pick", "PNG, JPEG and WebP screenshots"],
  ["Screen recordings", "MP4, MOV or WebM: trim, keep or drop the sound, export as video"],
  [`${STYLE_PRESETS.length} one-click styles`, "tilts, peeks, stacks and prints, on your own shot"],
  ["Gradients, mesh and wallpapers", "plus colours picked from your image"],
  ["Frames", "macOS window, browser, phone, tablet, laptop"],
  ["Annotations", "text, arrows, highlights, blur"],
  ["Motion", "zoom, float, 3D sweep and more, exported as MP4, WebM or GIF"],
  ["Every social size", "Open Graph, X, LinkedIn, Instagram, App Store"],
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
            <span className="eyebrow">
              <span className="dot">MIT</span> Free and open source
            </span>
            <h1 className="h1" style={{ marginTop: 18 }}>
              Sweet screenshots, <em>free forever.</em>
            </h1>
            <p className="lede" style={{ marginTop: 16, maxWidth: 500 }}>
              Shotcandy turns a plain screenshot or screen recording into a share-ready image or
              video in a few seconds. It runs entirely in your browser: no account, no upload, no
              watermark, no paywall.
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
              <h2 className="h2">Questions</h2>
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

        <section className="wrap" style={{ paddingBottom: 64 }}>
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
    </div>
  );
}
