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
  once: "",
  monthly: [
    { label: "$5", note: "Supporter", href: "" },
    { label: "$15", note: "Backer", href: "" },
    { label: "$50", note: "Sponsor", href: "" },
    { label: "$100", note: "Company sponsor", href: "" },
  ],
} as const;
export const GITHUB_URL = "https://github.com/btahir/shotcandy";
/** Canonical origin for metadata, sitemap and robots (update when the domain is known). */
export const SITE_URL = "https://shotcandy-dev.vercel.app";
export const SITE_NAME = "Shotcandy";
export const APP_VERSION = "0.1.0";
export const SITE_DESCRIPTION =
  "Turn any screenshot into a beautiful, share-ready image in seconds. Free, open source, and it runs entirely in your browser.";

export const TOOL_PAGES = [
  { href: "/screenshot-beautifier/", label: "Screenshot beautifier" },
  { href: "/macos-window-frame/", label: "macOS window frame" },
  { href: "/og-image-maker/", label: "Open Graph image maker" },
  { href: "/code-screenshot/", label: "Code screenshot" },
] as const;
