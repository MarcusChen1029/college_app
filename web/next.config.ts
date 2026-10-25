import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Interested, My list and Portals moved under My application.
  async redirects() {
    return [
      { source: "/my-list", destination: "/application/list", permanent: true },
      { source: "/interested", destination: "/application/interested", permanent: true },
      { source: "/portals", destination: "/application/portals", permanent: true },
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
