/**
 * Render the first page of a PDF to a PNG buffer for list thumbnails.
 * Uses unpdf + @napi-rs/canvas (works on Node / Vercel serverless).
 */
export async function renderPdfFirstPagePng(
  pdfBytes: ArrayBuffer | Uint8Array | Buffer,
  options?: { scale?: number; maxWidth?: number }
): Promise<Buffer> {
  // unpdf/pdfjs may call Math.sumPrecise (newer JS); polyfill for Node runtimes
  const math = Math as Math & { sumPrecise?: (...n: number[]) => number };
  if (typeof math.sumPrecise !== "function") {
    math.sumPrecise = (...n: number[]) => n.reduce((s, x) => s + x, 0);
  }

  const { renderPageAsImage } = await import("unpdf");

  const data =
    pdfBytes instanceof Buffer
      ? new Uint8Array(pdfBytes)
      : pdfBytes instanceof Uint8Array
        ? pdfBytes
        : new Uint8Array(pdfBytes);

  const maxWidth = options?.maxWidth ?? 320;
  const scale = options?.scale ?? 1.25;

  const image = await renderPageAsImage(data, 1, {
    canvasImport: () => import("@napi-rs/canvas"),
    scale,
    width: maxWidth,
  });

  return Buffer.from(image);
}
