import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
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
