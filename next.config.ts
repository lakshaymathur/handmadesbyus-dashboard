import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server build for Docker / any Node host (keeps hosting portable).
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
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
