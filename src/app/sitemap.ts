import type { MetadataRoute } from "next";
import { SITE_URL, TOOL_PAGES } from "@/config/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date("2026-09-26");
  return [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE_URL}/about/`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    ...TOOL_PAGES.map((t) => ({
      url: `${SITE_URL}${t.href}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];
}
