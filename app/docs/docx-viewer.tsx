"use client";

import { useEffect, useRef, useState } from "react";

export default function DocxViewer({
  src,
  headers,
  title,
}: {
  src: string;
  headers: Record<string, string>;
  title: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    host.replaceChildren();

    (async () => {
      const response = await fetch(src, { headers });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || "Could not open this Word file");
      }
      const bytes = await response.arrayBuffer();
      if (cancelled) return;
      const { renderAsync } = await import("docx-preview");
      if (cancelled || !hostRef.current) return;
      hostRef.current.replaceChildren();
      await renderAsync(bytes, hostRef.current, undefined, {
        className: "docx",
        inWrapper: true,
        breakPages: true,
        ignoreWidth: false,
      });
    })()
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not open this Word file");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [src, headers]);

  return (
    <div className="h-full w-full overflow-auto bg-[#d7dbe8]">
      {loading ? (
        <p className="px-6 py-8 text-center text-sm text-[#101536]">Opening Word file…</p>
      ) : null}
      {error ? (
        <p className="px-6 py-8 text-center text-sm text-red-700">{error}</p>
      ) : null}
      <div ref={hostRef} aria-label={title} className="min-h-full" />
    </div>
  );
}
