/** SEO tool landing page template (docs/design/mocks/landing-template.html). */
import Link from "next/link";
import type { ReactNode } from "react";
import { TOOL_PAGES } from "@/config/site";
import { Icon, LogoMark } from "../icons";
import { SiteFooter, SiteNav } from "./Site";
import { DropInline } from "./SiteClient";

export interface ToolPageData {
  slug: string;
  crumb: string;
  h1: ReactNode;
  lede: string;
  style: string;
  size?: string;
  frameLabel: string;
  hero: { src: string; alt: string; pills: string[]; width: number; height: number };
  steps: [string, string][];
  examples: { src: string; name: string; note: string; width: number; height: number }[];
  faq: [string, string][];
  related: { label: string; href: string }[];
  cta: string;
}

export function ToolLanding({ d }: { d: ToolPageData }) {
  const editorHref = `/?style=${d.style}${d.size ? `&size=${d.size}` : ""}`;
  return (
    <div className="page">
      <SiteNav active="tools" />
      <main>
        <section className="wrap tool-hero">
          <div>
            <nav className="crumbs" aria-label="Breadcrumb">
              <Link href={TOOL_PAGES[0].href}>Tools</Link>
              <Icon name="chevronRight" size="xs" /> <span aria-current="page">{d.crumb}</span>
            </nav>
            <h1 className="h1">{d.h1}</h1>
            <p className="lede" style={{ marginTop: 16, maxWidth: 500 }}>
              {d.lede}
            </p>
            <DropInline style={d.style} size={d.size} frameLabel={d.frameLabel} />
            <div className="checks">
              <span>
                <Icon name="check" size="sm" /> No sign-up
              </span>
              <span>
                <Icon name="check" size="sm" /> No watermark
              </span>
              <span>
                <Icon name="check" size="sm" /> Stays on your device
              </span>
            </div>
          </div>
          <div className="hero-art">
            <img
              src={d.hero.src}
              alt={d.hero.alt}
              width={d.hero.width}
              height={d.hero.height}
              fetchPriority="high"
            />
            <div className="pill" aria-hidden="true">
              {d.hero.pills.map((p) => (
                <span key={p}>{p}</span>
              ))}
            </div>
          </div>
        </section>

        <section className="section alt">
          <div className="wrap">
            <h2 className="h2" style={{ textAlign: "center" }}>
              Three steps, about ten seconds
            </h2>
            <ol className="grid-3" style={{ marginTop: 36, padding: 0, listStyle: "none" }}>
              {d.steps.map(([h, p], i) => (
                <li key={h} className="card-soft">
                  <div className="step-num" aria-hidden="true">
                    {i + 1}
                  </div>
                  <h3 className="h3">{h}</h3>
                  <p className="body-copy" style={{ marginTop: 6 }}>
                    {p}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="section">
          <div className="wrap">
            <div
              style={{
                display: "flex",
                alignItems: "end",
                justifyContent: "space-between",
                marginBottom: 24,
                gap: 16,
                flexWrap: "wrap",
              }}
            >
              <h2 className="h2">Made with this tool</h2>
              <Link
                className="support-link"
                href="/?gallery=1"
                style={{ color: "var(--sc-ink-2)" }}
              >
                See all 24 styles <Icon name="chevronRight" size="sm" />
              </Link>
            </div>
            <div className="grid-3">
              {d.examples.map((e) => (
                <figure key={e.src} style={{ margin: 0 }}>
                  <div className="ex">
                    <img
                      src={e.src}
                      alt={`${e.name} style example`}
                      width={e.width}
                      height={e.height}
                      loading="lazy"
                    />
                  </div>
                  <figcaption className="ex-cap">
                    <b>{e.name}</b>
                    <span>{e.note}</span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        <section className="section" style={{ paddingTop: 8 }}>
          <div className="wrap split-2">
            <div>
              <h2 className="h2">Questions</h2>
              <div style={{ marginTop: 24 }}>
                <h3 className="sub" style={{ fontSize: 13 }}>
                  Related tools
                </h3>
                <div className="tag-list">
                  {d.related.map((r) => (
                    <Link key={r.label} href={r.href}>
                      {r.label}{" "}
                      <Icon name="chevronRight" size="sm" style={{ width: 14, height: 14 }} />
                    </Link>
                  ))}
                </div>
              </div>
            </div>
            <div className="faq">
              {d.faq.map(([q, a], i) => (
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

        <section className="wrap" style={{ paddingBottom: 72 }}>
          <div className="cta-band">
            <LogoMark className="cta-mark" />
            <div style={{ flex: 1 }}>
              <h2 className="h2">Your next screenshot deserves better</h2>
              <p>{d.cta}</p>
            </div>
            <Link className="btn btn-primary btn-xl" href={editorHref}>
              Open the editor
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebApplication",
            name: `Shotcandy — ${d.crumb}`,
            applicationCategory: "DesignApplication",
            operatingSystem: "Any (web browser)",
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          }),
        }}
      />
    </div>
  );
}
