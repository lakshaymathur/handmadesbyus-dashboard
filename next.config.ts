import type { NextConfig } from "next";

// Next.js loads .env before this file. Let the dev server accept the extra addresses in
// TRUSTED_ORIGINS too (e.g. a phone on the LAN), or its scripts are blocked there.
const devOrigins = (process.env.TRUSTED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .flatMap((origin) => {
    try {
      return [new URL(origin).hostname];
    } catch {
      return []; // reported properly by lib/env at startup
    }
  });

const nextConfig: NextConfig = {
  allowedDevOrigins: devOrigins,
  // Self-contained server build for Docker / any Node host (keeps hosting portable).
  output: "standalone",
  cacheComponents: true,
  experimental: {
    // Product photos are shrunk in the browser, then uploaded through a server action;
    // the action itself caps a photo at 4 MB (features/products/schema.ts).
    serverActions: { bodySizeLimit: "5mb" },
  },
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
