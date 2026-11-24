export function publicSiteOrigin() {
  const configured = (process.env.NEXT_PUBLIC_SITE_URL || "").trim().replace(/\/$/, "");
  const usable = configured && !/localhost|127\.0\.0\.1/.test(configured) ? configured : "";
  if (usable) return usable;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_ENV === "production") return "https://apostoliclife-worship.vercel.app";
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return configured || "http://localhost:3000";
}
