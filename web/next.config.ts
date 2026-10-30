import type { NextConfig } from "next";
import { securityHeaders, shareHeaders } from "./lib/security-headers";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  // AVIF first, WebP for browsers without it (the default is WebP only). Qualities stay at the default [75].
  images: { formats: ["image/avif", "image/webp"] },
  async headers() {
    const base = securityHeaders({
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      dev: process.env.NODE_ENV === "development",
    });
    return [
      { source: "/:path*", headers: base },
      { source: "/share/:path*", headers: shareHeaders },
      { source: "/extension/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
    ];
  },
  // Old URLs for routes that moved (My colleges tabs, Writing section, Tools, Settings).
  async redirects() {
    return [
      { source: "/my-list", destination: "/application/list", permanent: true },
      { source: "/interested", destination: "/application/interested", permanent: true },
      { source: "/portals", destination: "/application/portals", permanent: true },
      { source: "/application/essays", destination: "/writing/essays", permanent: false },
      { source: "/activities", destination: "/writing/activities", permanent: false },
      { source: "/resume", destination: "/tools/resume", permanent: false },
      { source: "/writing/resume", destination: "/tools/resume", permanent: false },
      { source: "/account", destination: "/settings", permanent: false },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
