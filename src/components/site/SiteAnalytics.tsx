"use client";

import { useSyncExternalStore } from "react";
import { GoogleAnalytics } from "@next/third-parties/google";
import { SITE_URL } from "@/config/site";

const PUBLIC_HOSTS = new Set([new URL(SITE_URL).hostname, `www.${new URL(SITE_URL).hostname}`]);

const subscribe = () => () => {};
const serverSnapshot = () => false;
const browserSnapshot = () => PUBLIC_HOSTS.has(window.location.hostname);

/** Google Analytics on the live domain only, so localhost and preview deploys stay out of the data. */
export function SiteAnalytics({ gaId }: { gaId: string }) {
  const enabled = useSyncExternalStore(subscribe, browserSnapshot, serverSnapshot);
  return enabled ? <GoogleAnalytics gaId={gaId} /> : null;
}
