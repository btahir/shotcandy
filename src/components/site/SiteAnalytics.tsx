"use client";

import Script from "next/script";
import { useSyncExternalStore } from "react";
import { GoogleAnalytics } from "@next/third-parties/google";
import { SITE_URL } from "@/config/site";

/** Self-hosted Umami on the ShipTiffin box. The website ID is public by design. */
const UMAMI_SCRIPT = "https://project-analytics.shiptiffin.app/script.js";
const UMAMI_WEBSITE_ID = "bf8853d8-edba-4e35-9ea4-a56c5e629901";

const PUBLIC_HOSTS = new Set([new URL(SITE_URL).hostname, `www.${new URL(SITE_URL).hostname}`]);

const subscribe = () => () => {};
const serverSnapshot = () => false;
const browserSnapshot = () => PUBLIC_HOSTS.has(window.location.hostname);

/**
 * Google Analytics and Umami side by side (to compare their counts), on the live domain only,
 * so localhost and preview deploys stay out of the data.
 */
export function SiteAnalytics({ gaId }: { gaId?: string }) {
  const enabled = useSyncExternalStore(subscribe, browserSnapshot, serverSnapshot);
  if (!enabled) return null;
  return (
    <>
      {gaId && <GoogleAnalytics gaId={gaId} />}
      <Script
        src={UMAMI_SCRIPT}
        data-website-id={UMAMI_WEBSITE_ID}
        data-domains={[...PUBLIC_HOSTS].join(",")}
        data-performance="true"
        strategy="afterInteractive"
      />
    </>
  );
}
