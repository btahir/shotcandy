import type { MetadataRoute } from "next";
import { INDEXED_PAGES, SITE_URL } from "@/config/site";

export const dynamic = "force-static";

/** Each page's lastmod is its own `updated` date (Google ignores priority and changefreq). */
export default function sitemap(): MetadataRoute.Sitemap {
  return INDEXED_PAGES.map((p) => ({
    url: `${SITE_URL}${p.href}`,
    lastModified: p.updated,
  }));
}
