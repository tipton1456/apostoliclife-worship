import type { Metadata, Viewport } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-montserrat",
});

export const metadata: Metadata = {
  title: {
    default: "Apostolic Worship Tech Portal",
    template: "%s · Apostolic Worship Tech Portal",
  },
  description: "Apostolic Worship Tech Portal",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/apostolic-worship-icon.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apostolic-worship-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0c14",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={montserrat.variable}>
      <body className={montserrat.className}>
        <div className="al-backdrop" aria-hidden="true">
          <div className="al-blob al-blob-a" />
          <div className="al-blob al-blob-b" />
          <div className="al-blob al-blob-c" />
        </div>
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}
