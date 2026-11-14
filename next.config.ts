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
    // Applies to every server action (parsed before the session is checked), so keep it
    // small: just above the 1.5 MB photo cap (MAX_PHOTO_BYTES, features/products/schema.ts).
    serverActions: { bodySizeLimit: "2mb" },
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
