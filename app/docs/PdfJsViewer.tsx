"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  /** Same-origin stream URL or absolute URL that can be fetched with headers */
  src: string;
  headers?: HeadersInit;
  title?: string;
};

/**
 * Renders PDF pages to canvas with PDF.js so Chrome cannot hand the file off
 * to Acrobat (which happens with iframe/object PDF URLs).
 */
export default function PdfJsViewer({ src, headers, title }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Loading PDF…");
  const [pageCount, setPageCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    container.innerHTML = "";
    setError(null);
    setStatus("Loading PDF…");
    setPageCount(0);

    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

        setStatus("Fetching document…");
        const res = await fetch(src, {
          headers,
          credentials: "same-origin",
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            (body as { error?: string }).error ||
              `Failed to load PDF (${res.status})`
          );
        }

        const data = new Uint8Array(await res.arrayBuffer());
        if (cancelled) return;

        setStatus("Rendering pages…");
        const doc = await pdfjs.getDocument({ data }).promise;
        if (cancelled) return;

        setPageCount(doc.numPages);

        for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
          if (cancelled) return;
          const page = await doc.getPage(pageNum);

          const baseViewport = page.getViewport({ scale: 1 });
          const maxWidth = Math.min(
            container.clientWidth || 800,
            960
          );
          const scale = Math.max(1, maxWidth / baseViewport.width);
          const viewport = page.getViewport({ scale: scale * 1.15 });

          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.className =
            "mx-auto mb-4 block max-w-full rounded-md shadow-lg bg-white";
          canvas.setAttribute("data-page", String(pageNum));

          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Canvas not available");

          await page.render({
            canvasContext: ctx,
            viewport,
            // pdfjs types may require canvas in newer versions
            canvas,
          } as Parameters<typeof page.render>[0]).promise;

          if (cancelled) return;
          container.appendChild(canvas);
          setStatus(`Rendered page ${pageNum} of ${doc.numPages}`);
        }

        if (!cancelled) setStatus("");
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "PDF render failed");
          setStatus("");
        }
      }
    })();

    return () => {
      cancelled = true;
      if (container) container.innerHTML = "";
    };
  }, [src, headers]);

  return (
    <div className="h-full w-full flex flex-col bg-neutral-900">
      {(status || pageCount > 0) && !error && (
        <div className="shrink-0 px-3 py-1.5 text-xs text-gray-400 border-b border-white/10 bg-black/40">
          {status || `${pageCount} page${pageCount === 1 ? "" : "s"} · ${title || "PDF"}`}
        </div>
      )}
      {error && (
        <div className="p-6 text-center text-red-300 text-sm">{error}</div>
      )}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-auto p-3 sm:p-4"
      />
    </div>
  );
}
