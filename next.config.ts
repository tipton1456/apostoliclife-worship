import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.1.13"],
  // Native / heavy PDF thumbnail deps must not be bundled by Turbopack
  serverExternalPackages: [
    "@napi-rs/canvas",
    "unpdf",
    "atem-connection",
    "exceljs",
    "pdfkit",
  ],
};

export default nextConfig;
