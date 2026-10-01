/** SEO tool landing page template (docs/design/mocks/landing-template.html). */
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { STYLE_PRESETS } from "@/engine/presets/styles";
import { jsonLd, pageGraph } from "@/lib/jsonld";
import { Icon, LogoMark } from "../icons";
import { SiteFooter, SiteNav } from "./Site";
import { DropInline, type DropTarget } from "./SiteClient";

export interface Crumb {
  label: string;
  href: string;
}

/** A dated, sourced comparison table. */
export interface Comparison {
  title: string;
  intro?: ReactNode;
  /** Column heads after the first (feature) column; the first is Shotcandy. */
  tools: { name: string; href?: string }[];
  rows: { feature: string; values: ReactNode[] }[];
  /** When the facts were checked on each tool's site, e.g. "30 September 2026". */
  checked?: string;
  note?: ReactNode;
}

export interface ToolPageData {
  /** Path without slashes, e.g. "screenshot-beautifier" or "alternatives/screely". */
  slug: string;
  crumb: string;
  /** The crumb between Home and this page (default: Tools; null for none). */
  parent?: Crumb | null;
  /** Name in the page's structured data (default: "Shotcandy <crumb>"). */
  appName?: string;
  /** Meta description and OG image, also used for the page's structured data. */
  description: string;
  ogImage: string;
  h1: ReactNode;
  lede: ReactNode;
  style: string;
  size?: string;
  frameLabel: string;
  /** What the drop zone opens (mode, layout, tool, several images) and its words. */
  target?: DropTarget & { title?: string; hint?: string; button?: string };
  hero: { src: string; alt: string; pills: string[]; width: number; height: number };
  stepsTitle?: string;
  steps: [string, string][];
  examplesTitle?: string;
  examples: {
    src: string;
    name: string;
    note: string;
    width: number;
    height: number;
    alt?: string;
    /** A link under the example (e.g. open the editor with this layout). */
    link?: { label: string; href: string };
  }[];
  /** "What you can do with it": use cases with specifics. */
  uses?: { title?: string; intro?: string; items: [string, string][] };
  /** Longer sections, each with its own H2. */
  sections?: { id?: string; title: string; body: ReactNode }[];
  compare?: Comparison;
  faqTitle?: string;
  faq: [string, string][];
  related: { label: string; href: string }[];
  cta: string;
  /** Replaces the paste-a-screenshot box (e.g. a paste-your-code box). */
  drop?: ReactNode;
  /** Editor link override (default: the style/size preset). */
  editorHref?: string;
  /** The "see more" link above the examples. */
  more?: { label: string; href: string };
}

const TOOLS: Crumb = { label: "Tools", href: "/tools/" };

/** Metadata for a content page: title (used as is), description, canonical and cards. */
export function pageMetadata(p: {
  path: string;
  title: string;
  description: string;
  image: string;
  /** Social card title (default: the page title). */
  social?: string;
}): Metadata {
  const social = p.social ?? p.title;
  return {
    title: { absolute: p.title },
    description: p.description,
    alternates: { canonical: p.path },
    openGraph: {
      title: social,
      description: p.description,
      url: p.path,
      images: [{ url: p.image, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: social,
      description: p.description,
      images: [p.image],
    },
  };
}

export function Breadcrumbs({ trail }: { trail: Crumb[] }) {
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      {trail.map((c, i) =>
        i === trail.length - 1 ? (
          <span key={c.href} aria-current="page">
            {c.label}
          </span>
        ) : (
          <span key={c.href} className="crumb">
            <Link href={c.href}>{c.label}</Link>
            <Icon name="chevronRight" size="xs" />
          </span>
        ),
      )}
    </nav>
  );
}

export function CompareTable({ c }: { c: Comparison }) {
  return (
    <>
      <div className="compare-scroll" role="region" aria-label={c.title} tabIndex={0}>
        <table className="compare">
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">Feature</span>
              </th>
              {c.tools.map((t, i) => (
                <th key={t.name} scope="col" className={i === 0 ? "ours" : undefined}>
                  {t.href ? (
                    <a href={t.href} target="_blank" rel="noopener noreferrer">
                      {t.name}
                    </a>
                  ) : (
                    t.name
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {c.rows.map((r) => (
              <tr key={r.feature}>
                <th scope="row">{r.feature}</th>
                {r.values.map((v, i) => (
                  <td key={i} className={i === 0 ? "ours" : undefined}>
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="fine">
        {c.checked && (
          <>
            Checked on {c.checked} on each tool&apos;s own site (linked in the table). &quot;Not
            listed&quot; means we couldn&apos;t find it there. Prices and features change, so check
            before you decide.{" "}
          </>
        )}
        {c.note}
      </p>
    </>
  );
}

export function ToolLanding({ d }: { d: ToolPageData }) {
  const editorHref = d.editorHref ?? `/?style=${d.style}${d.size ? `&size=${d.size}` : ""}`;
  const path = `/${d.slug}/`;
  const parent = d.parent === undefined ? TOOLS : d.parent;
  const trail: Crumb[] = [
    { label: "Home", href: "/" },
    ...(parent ? [parent] : []),
    { label: d.crumb, href: path },
  ];
  const { title, hint, button, ...target } = d.target ?? {};
  return (
    <div className="page">
      <SiteNav active={parent === TOOLS ? "tools" : undefined} />
      <main>
        <section className="wrap tool-hero">
          <div>
            <Breadcrumbs trail={trail} />
            <h1 className="h1">{d.h1}</h1>
            <p className="lede" style={{ marginTop: 16, maxWidth: 500 }}>
              {d.lede}
            </p>
            {d.drop ?? (
              <DropInline
                style={d.style}
                size={d.size}
                frameLabel={d.frameLabel}
                title={title}
                hint={hint}
                button={button}
                {...target}
              />
            )}
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
              decoding="async"
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
              {d.stepsTitle ?? "Three steps, about ten seconds"}
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
              <h2 className="h2">{d.examplesTitle ?? "Made with this tool"}</h2>
              <Link
                className="support-link"
                href={d.more?.href ?? "/?gallery=1"}
                style={{ color: "var(--sc-ink-2)" }}
              >
                {d.more?.label ?? `See all ${STYLE_PRESETS.length} styles`}{" "}
                <Icon name="chevronRight" size="sm" />
              </Link>
            </div>
            <div className={`${d.examples.length === 4 ? "grid-2" : "grid-3"} examples`}>
              {d.examples.map((e) => (
                <figure key={e.src} style={{ margin: 0 }}>
                  <div className="ex">
                    <img
                      src={e.src}
                      alt={e.alt ?? `${e.name} style example`}
                      width={e.width}
                      height={e.height}
                      loading="lazy"
                    />
                  </div>
                  <figcaption className="ex-cap">
                    <b>{e.name}</b>
                    <span>{e.note}</span>
                  </figcaption>
                  {e.link && (
                    <Link className="ex-link" href={e.link.href}>
                      {e.link.label} <Icon name="chevronRight" size="xs" />
                    </Link>
                  )}
                </figure>
              ))}
            </div>
          </div>
        </section>

        {d.uses && (
          <section className="section" style={{ paddingTop: 8 }}>
            <div className="wrap split-2 tight">
              <div>
                <h2 className="h2">{d.uses.title ?? "What you can do with it"}</h2>
                {d.uses.intro && (
                  <p className="body-copy" style={{ marginTop: 12 }}>
                    {d.uses.intro}
                  </p>
                )}
              </div>
              <ul className="uses">
                {d.uses.items.map(([h, p]) => (
                  <li key={h}>
                    <h3>{h}</h3>
                    <p>{p}</p>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {d.sections?.map((s) => (
          <section key={s.title} className="section prose-section" id={s.id}>
            <div className="wrap split-2 tight">
              <h2 className="h2">{s.title}</h2>
              <div className="prose">{s.body}</div>
            </div>
          </section>
        ))}

        {d.compare && (
          <section className="section alt">
            <div className="wrap">
              <h2 className="h2">{d.compare.title}</h2>
              {d.compare.intro && (
                <p className="body-copy" style={{ marginTop: 12, maxWidth: 720 }}>
                  {d.compare.intro}
                </p>
              )}
              <CompareTable c={d.compare} />
            </div>
          </section>
        )}

        <section className="section">
          <div className="wrap split-2">
            <div>
              <h2 className="h2">{d.faqTitle ?? "Questions"}</h2>
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
          __html: jsonLd(
            pageGraph({
              path,
              name: d.appName ?? `Shotcandy ${d.crumb}`,
              description: d.description,
              image: d.ogImage,
              crumbs: trail,
            }),
          ),
        }}
      />
    </div>
  );
}
