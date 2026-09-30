import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { SiteFooter, SiteNav } from "@/components/site/Site";
import { DONATION_LINKS, GITHUB_URL } from "@/config/site";

const TITLE = "Support Shotcandy";
const DESC =
  "Shotcandy is free and open source. If it saves you time, you can support its development with a one-off tip or a small monthly contribution.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESC,
  alternates: { canonical: "/support/" },
  // Kept out of search so the site's topic stays on the tools; still linked in the footer.
  robots: { index: false, follow: true },
  openGraph: {
    title: TITLE,
    description: DESC,
    url: "/support/",
    images: [{ url: "/og/about.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESC,
    images: ["/og/about.png"],
  },
};

function PayLink({
  href,
  className,
  children,
}: {
  href: string;
  className: string;
  children: React.ReactNode;
}) {
  if (!href)
    return (
      <span
        className={className}
        aria-disabled="true"
        title="Coming soon"
        style={{ opacity: 0.55, cursor: "not-allowed" }}
      >
        {children}
      </span>
    );
  return (
    <a className={className} href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

export default function SupportPage() {
  return (
    <div className="page">
      <SiteNav />
      <main>
        <section className="wrap" style={{ paddingTop: 56, paddingBottom: 72 }}>
          <div className="support">
            <div style={{ position: "relative", zIndex: 1 }}>
              <span className="eyebrow">
                <span className="dot">
                  <Icon name="heart" size="xs" />
                </span>{" "}
                Support this project
              </span>
              <h1 className="h1" style={{ marginTop: 16 }}>
                Keep the candy jar <em>full.</em>
              </h1>
              <p className="lede" style={{ marginTop: 14, maxWidth: 520 }}>
                Shotcandy costs nothing to use and never will. Support is voluntary: it funds
                maintenance, fixes, new styles and the evenings that go into them. Every feature
                stays free and MIT licensed either way.
              </p>

              <div style={{ display: "flex", gap: 10, marginTop: 26, flexWrap: "wrap" }}>
                <PayLink href={DONATION_LINKS.once} className="btn btn-primary btn-xl">
                  <Icon name="heart" /> Give once
                </PayLink>
                <a
                  className="btn btn-secondary btn-xl"
                  href={GITHUB_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  Star the repo
                </a>
              </div>
              <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>
                Choose your own amount; $20 is a lovely default.
              </p>

              <h2 className="h3" style={{ marginTop: 34 }}>
                Or support monthly
              </h2>
              <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                {DONATION_LINKS.monthly.map((t) => (
                  <PayLink key={t.label} href={t.href} className="btn btn-secondary">
                    <b>{t.label}</b>/mo · {t.note}
                  </PayLink>
                ))}
              </div>
              <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>
                Payments are handled by Stripe. Monthly support renews until you cancel.
              </p>

              <p className="body-copy" style={{ marginTop: 28 }}>
                Not in a position to give? Sharing an image you made, starring the repo or{" "}
                <a
                  className="support-link"
                  href={`${GITHUB_URL}/issues`}
                  target="_blank"
                  rel="noreferrer"
                >
                  reporting a bug
                </a>{" "}
                helps just as much.{" "}
                <Link style={{ color: "var(--sc-accent-text)", fontWeight: 600 }} href="/">
                  Back to the editor
                </Link>
              </p>
            </div>
            <div className="jar-illo">
              <img src="/icons/icon-512.png" alt="" width={220} height={220} />
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
