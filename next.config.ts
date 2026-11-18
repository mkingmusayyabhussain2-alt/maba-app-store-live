import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // cacheComponents + partialPrefetching removed (scaffold defaults):
  // API routes use `export const dynamic = 'force-dynamic'` (auth/session/
  // cookies must never be cached), which is incompatible with
  // cacheComponents in Next 16, and partialPrefetching requires it.
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
