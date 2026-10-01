/**
 * Site-wide constants. Every "Support this project" link goes to our own
 * /support/ page, which reads its payment links from DONATION_LINKS below.
 */
export const SUPPORT_URL = "/support/";

/**
 * Owner: paste the Stripe payment links here. An empty href shows the button
 * as "coming soon" instead of a broken link.
 */
export const DONATION_LINKS = {
  once: "https://buy.stripe.com/fZu14m0FO3v050PfqP3ks00",
  monthly: [
    { label: "$5", note: "Supporter", href: "https://buy.stripe.com/9B68wOewEaXsgJxdiH3ks01" },
    { label: "$15", note: "Backer", href: "https://buy.stripe.com/7sYbJ088g3v0gJx4Mb3ks02" },
    { label: "$50", note: "Sponsor", href: "https://buy.stripe.com/28EeVc88g5D80Kz2E33ks03" },
    {
      label: "$100",
      note: "Company sponsor",
      href: "https://buy.stripe.com/00w14m6088PkbpdceD3ks04",
    },
  ],
} as const;
export const GITHUB_URL = "https://github.com/btahir/shotcandy";
/** Canonical origin for metadata, sitemap and robots (update when the domain is known). */
export const SITE_URL = "https://shotcandy.app";
export const SITE_NAME = "Shotcandy";
export const APP_VERSION = "0.2.0";
/** The one-line definition, used word for word on the site, README and listings. */
export const SITE_DEFINITION =
  "Shotcandy is a free, open-source screenshot beautifier that runs in your browser. Nothing is uploaded, and there's no account.";
export const SITE_DESCRIPTION =
  "Turn any screenshot or screen recording into a beautiful, share-ready image or video in seconds. Free, open source, and it runs entirely in your browser.";
export const CREATOR = { name: "Bilal Tahir", url: "https://github.com/btahir" } as const;
export const CHANGELOG_URL = `${GITHUB_URL}/blob/main/CHANGELOG.md`;

export interface SitePage {
  href: string;
  /** Name in menus, footers and breadcrumbs. */
  label: string;
  /** One line for the tools hub, llms.txt and the homepage links. */
  blurb: string;
  /** Last real change to the page's content (sitemap lastmod), YYYY-MM-DD. */
  updated: string;
}

/** Tool landing pages: the Tools menu, footer, /tools/ hub, sitemap and llms.txt. */
export const TOOL_PAGES: readonly SitePage[] = [
  {
    href: "/screenshot-beautifier/",
    label: "Screenshot beautifier",
    blurb: "Backgrounds, shadows, frames and exact social sizes for any screenshot.",
    updated: "2026-09-30",
  },
  {
    href: "/batch-screenshot-editor/",
    label: "Batch screenshot editor",
    blurb: "Style up to 100 screenshots at once and export them as a ZIP.",
    updated: "2026-09-30",
  },
  {
    href: "/screenshot-mockup/",
    label: "Multi-screen mockup",
    blurb: "Put 2 to 6 screenshots in one image, in six layouts.",
    updated: "2026-09-30",
  },
  {
    href: "/app-store-screenshots/",
    label: "App Store screenshots",
    blurb: "A 3 to 10 slide set at Apple's exact sizes, with headlines.",
    updated: "2026-09-30",
  },
  {
    href: "/code-screenshot/",
    label: "Code screenshot",
    blurb: "Highlighted code in a window, as PNG, MP4 or GIF.",
    updated: "2026-09-30",
  },
  {
    href: "/og-image-maker/",
    label: "Open Graph image maker",
    blurb: "1200 × 630 link previews, plus X, LinkedIn and Facebook sizes.",
    updated: "2026-09-30",
  },
  {
    href: "/macos-window-frame/",
    label: "macOS window frame",
    blurb: "A light or dark macOS-style window around any screenshot.",
    updated: "2026-09-30",
  },
  {
    href: "/redact-screenshot/",
    label: "Redact a screenshot",
    blurb: "Blur, pixelate or cover private details with a solid box before you share.",
    updated: "2026-09-30",
  },
];

/** Honest comparisons: the footer's Compare column, the sitemap and llms.txt. */
export const COMPARE_PAGES: readonly SitePage[] = [
  {
    href: "/alternatives/",
    label: "All alternatives",
    blurb: "Shotcandy next to Shots.so, Screely, Pika, Xnapper, CleanShot X and more.",
    updated: "2026-09-30",
  },
  {
    href: "/alternatives/shots-so/",
    label: "Shots.so alternative",
    blurb: "A free, open-source alternative to Shots.so.",
    updated: "2026-09-30",
  },
  {
    href: "/alternatives/screely/",
    label: "Screely alternative",
    blurb: "A free alternative to Screely for window mockups.",
    updated: "2026-09-30",
  },
];

/** Every indexable page with its last change (support is noindex, so it's not here). */
export const INDEXED_PAGES: readonly Pick<SitePage, "href" | "updated">[] = [
  { href: "/", updated: "2026-09-30" },
  { href: "/tools/", updated: "2026-09-30" },
  ...TOOL_PAGES,
  ...COMPARE_PAGES,
  { href: "/about/", updated: "2026-09-30" },
];
