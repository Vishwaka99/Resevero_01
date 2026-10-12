import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The BFF reads per-request data (session, "now", query filters), so pages are
  // rendered on demand rather than cached at build time.
  cacheComponents: false,
};

export default nextConfig;
