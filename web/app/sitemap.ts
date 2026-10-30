import type { MetadataRoute } from "next";
import { getSummaries } from "@/lib/data";
import { SITE_ORIGIN, SITEMAP_STATIC_PATHS } from "@/lib/seo";

// The fixed public pages, then one entry per college. The list comes from the cached college summaries (the same read the
// pages use), so the sitemap grows with the data and never touches the database at build time.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const colleges = await getSummaries();
  return [
    // "/" is the origin itself, with no trailing slash: the form the home page's canonical link uses.
    ...SITEMAP_STATIC_PATHS.map((path) => ({ url: path === "/" ? SITE_ORIGIN : `${SITE_ORIGIN}${path}` })),
    ...colleges.map((c) => ({ url: `${SITE_ORIGIN}/colleges/${c.slug}` })),
  ];
}
