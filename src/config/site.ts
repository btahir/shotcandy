/**
 * Site-wide constants. SUPPORT_URL is the single place the owner sets the
 * "Support this project" destination; every support link reads it from here.
 */
export const SUPPORT_URL = "https://example.com/support";
export const GITHUB_URL = "https://github.com/btahir/shotcandy";
/** Canonical origin for metadata, sitemap and robots (update when the domain is known). */
export const SITE_URL = "https://shotcandy.app";
export const SITE_NAME = "Shotcandy";
export const APP_VERSION = "0.1.0";
export const SITE_DESCRIPTION =
  "Turn any screenshot into a beautiful, share-ready image in seconds. Free, open source, and it runs entirely in your browser.";

export const TOOL_PAGES = [
  { href: "/screenshot-beautifier/", label: "Screenshot beautifier" },
  { href: "/macos-window-frame/", label: "macOS window frame" },
  { href: "/og-image-maker/", label: "Open Graph image maker" },
] as const;
