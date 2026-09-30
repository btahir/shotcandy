/** JSON-LD helpers: structured data that matches what the pages say. */
import { CREATOR, GITHUB_URL, SITE_NAME, SITE_URL } from "@/config/site";
import { CODE_LANGUAGES } from "@/engine/code/languages";
import { STYLE_PRESETS } from "@/engine/presets/styles";

export const ORG_ID = `${SITE_URL}/#org`;
export const WEBSITE_ID = `${SITE_URL}/#website`;
export const APP_ID = `${SITE_URL}/#app`;

/** Highlighted languages (the list minus "Plain text"). */
export const CODE_LANGUAGE_COUNT = CODE_LANGUAGES.filter((l) => l.id !== "text").length;

/** JSON for a <script type="application/ld+json">, with `<` escaped (Next.js JSON-LD guide). */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** Organization, WebSite and the app itself: on every page, from the root layout. */
export function siteGraph() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": ORG_ID,
        name: SITE_NAME,
        url: `${SITE_URL}/`,
        logo: `${SITE_URL}/icons/icon-512.png`,
        sameAs: [GITHUB_URL],
        founder: { "@type": "Person", name: CREATOR.name, url: CREATOR.url },
      },
      {
        "@type": "WebSite",
        "@id": WEBSITE_ID,
        name: SITE_NAME,
        url: `${SITE_URL}/`,
        publisher: { "@id": ORG_ID },
      },
      {
        "@type": "WebApplication",
        "@id": APP_ID,
        name: SITE_NAME,
        url: `${SITE_URL}/`,
        description:
          "Free, open-source screenshot beautifier that runs in your browser. Backgrounds, device frames, annotations, batch export, multi-screen mockups, code images, App Store sets and screen recordings. Nothing is uploaded.",
        applicationCategory: "DesignApplication",
        operatingSystem: "Any (web browser)",
        browserRequirements: "Requires a modern browser with JavaScript",
        isAccessibleForFree: true,
        license: "https://opensource.org/licenses/MIT",
        image: `${SITE_URL}/og/default.png`,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        featureList: [
          `${STYLE_PRESETS.length} one-click styles`,
          "Gradient, mesh, wallpaper and image backgrounds",
          "macOS window, browser, phone, tablet, laptop and design canvas frames",
          "3D tilt and shadows",
          "Text, arrows and highlights; blur, pixelate or solid-box redaction",
          "Batch: up to 100 screenshots at once (30 on a phone), exported as a ZIP or into a folder",
          "Multi-screen designs: 2 to 6 screenshots in six layouts (side by side, overlap, hero, cascade, fan, grid)",
          `Code screenshots in ${CODE_LANGUAGE_COUNT} languages`,
          "App Store screenshot sets at Apple's sizes",
          "Screen recordings to MP4, WebM or GIF",
        ],
        publisher: { "@id": ORG_ID },
      },
    ],
  };
}

/** A tool page: the app on this URL (part of the site's app), and its breadcrumb trail. */
export function pageGraph(p: {
  path: string;
  name: string;
  description: string;
  image: string;
  crumbs: { label: string; href: string }[];
}) {
  const url = `${SITE_URL}${p.path}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebApplication",
        "@id": `${url}#app`,
        name: p.name,
        url,
        description: p.description,
        image: `${SITE_URL}${p.image}`,
        applicationCategory: "DesignApplication",
        operatingSystem: "Any (web browser)",
        isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        isPartOf: { "@id": APP_ID },
        publisher: { "@id": ORG_ID },
      },
      breadcrumbList(p.crumbs),
    ],
  };
}

export function breadcrumbList(crumbs: { label: string; href: string }[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.label,
      item: `${SITE_URL}${c.href}`,
    })),
  };
}

/** A plain content page (about, hubs): the page and its breadcrumbs. */
export function webPageGraph(p: {
  path: string;
  type?: "WebPage" | "AboutPage" | "CollectionPage";
  name: string;
  description: string;
  crumbs: { label: string; href: string }[];
}) {
  const url = `${SITE_URL}${p.path}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": p.type ?? "WebPage",
        "@id": `${url}#page`,
        url,
        name: p.name,
        description: p.description,
        isPartOf: { "@id": WEBSITE_ID },
        about: { "@id": APP_ID },
        publisher: { "@id": ORG_ID },
      },
      breadcrumbList(p.crumbs),
    ],
  };
}
