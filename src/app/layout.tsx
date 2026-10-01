import type { Metadata, Viewport } from "next";
import { preload } from "react-dom";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/config/site";
import { jsonLd, siteGraph } from "@/lib/jsonld";
import { THEME_INIT_SCRIPT } from "@/lib/theme-script";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Shotcandy — make your screenshots look lovely",
    template: "%s · Shotcandy",
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: "Shotcandy contributors" }],
  keywords: [
    "screenshot beautifier",
    "screenshot editor",
    "macOS window frame",
    "browser mockup",
    "Open Graph image",
    "device mockup",
    "free",
    "open source",
  ],
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: "Shotcandy — make your screenshots look lovely",
    description: SITE_DESCRIPTION,
    url: "/",
    images: [{ url: "/og/default.png", width: 1200, height: 630, alt: "Shotcandy" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Shotcandy — make your screenshots look lovely",
    description: SITE_DESCRIPTION,
    images: ["/og/default.png"],
  },
  icons: {
    icon: [
      { url: "/icons/favicon.svg", type: "image/svg+xml" },
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    shortcut: "/icons/favicon.ico",
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  manifest: "/manifest.webmanifest",
  alternates: { canonical: "/" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FBF5EC" },
    { media: "(prefers-color-scheme: dark)", color: "#1A1411" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  preload("/fonts/figtree-latin-wght-normal.woff2", {
    as: "font",
    type: "font/woff2",
    crossOrigin: "anonymous",
  });
  preload("/fonts/bricolage-grotesque-latin-opsz-normal.woff2", {
    as: "font",
    type: "font/woff2",
    crossOrigin: "anonymous",
  });
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        {children}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd(siteGraph()) }}
        />
      </body>
    </html>
  );
}
