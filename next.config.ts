import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.1.13"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" }],
      },
    ];
  },
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
