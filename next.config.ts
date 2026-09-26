import type { NextConfig } from "next";

/**
 * Shotcandy is a static site: no server, no API routes, no image optimizer.
 * `next build` writes a fully static site to `out/` that any file server can host.
 */
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
