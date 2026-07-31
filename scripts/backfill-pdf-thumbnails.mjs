/**
 * Generate first-page PNG thumbnails for PDFs already in the library.
 * Usage from project root:
 *   node scripts/backfill-pdf-thumbnails.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i).trim();
    const v = line
      .slice(i + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnvLocal();

// pdfjs polyfill
if (typeof Math.sumPrecise !== "function") {
  Math.sumPrecise = (...n) => n.reduce((s, x) => s + x, 0);
}

const BUCKET = "worship-tech-docs";
const META_PATH = "meta/library.json";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing Supabase env");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function renderPdfFirstPagePng(pdfBytes) {
  const { renderPageAsImage } = await import("unpdf");
  const data =
    pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes);
  const image = await renderPageAsImage(data, 1, {
    canvasImport: () => import("@napi-rs/canvas"),
    scale: 1.25,
    width: 320,
  });
  return Buffer.from(image);
}

function isPdf(doc) {
  const t = (doc.contentType || "").toLowerCase();
  const n = (doc.originalFilename || "").toLowerCase();
  return t === "application/pdf" || n.endsWith(".pdf");
}

const { data: metaBlob, error: metaErr } = await supabase.storage
  .from(BUCKET)
  .download(META_PATH);
if (metaErr) {
  console.error(metaErr);
  process.exit(1);
}
const meta = JSON.parse(await metaBlob.text());
let created = 0;

for (let i = 0; i < meta.documents.length; i++) {
  const doc = meta.documents[i];
  if (!isPdf(doc)) continue;
  if (doc.thumbnailPath) {
    console.log("skip (has thumb)", doc.title);
    continue;
  }
  console.log("processing", doc.title);
  const { data: file, error } = await supabase.storage
    .from(BUCKET)
    .download(doc.storagePath);
  if (error) {
    console.error("download fail", error.message);
    continue;
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const png = await renderPdfFirstPagePng(bytes);
  const thumbnailPath = `thumbs/${doc.id}.png`;
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(thumbnailPath, png, { contentType: "image/png", upsert: true });
  if (upErr) {
    console.error("thumb upload fail", upErr.message);
    continue;
  }
  meta.documents[i] = { ...doc, thumbnailPath };
  created++;
  console.log("created", thumbnailPath, "bytes", png.length);
}

if (created > 0) {
  const { error: saveErr } = await supabase.storage
    .from(BUCKET)
    .upload(META_PATH, JSON.stringify(meta, null, 2), {
      contentType: "application/json",
      upsert: true,
    });
  if (saveErr) {
    console.error("meta save fail", saveErr.message);
    process.exit(1);
  }
}

console.log("DONE created=", created);
