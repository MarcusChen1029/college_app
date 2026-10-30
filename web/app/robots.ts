import type { MetadataRoute } from "next";
import { ROBOTS_DISALLOW, SITE_ORIGIN } from "@/lib/seo";

// Public pages are open; account screens, share tokens, APIs and OAuth are not for crawlers.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: [...ROBOTS_DISALLOW] },
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  };
}
