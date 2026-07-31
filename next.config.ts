import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native / heavy PDF thumbnail deps must not be bundled by Turbopack
  serverExternalPackages: [
    "@napi-rs/canvas",
    "unpdf",
  ],
};

export default nextConfig;
