"use client";

import Image from "next/image";
import Link from "next/link";

export default function WorshipLogo({
  className = "h-11 w-auto max-w-full",
  href = "/",
}: {
  className?: string;
  href?: string | null;
}) {
  const image = (
    <Image
      src="/apostolic-life-logo.png"
      alt="Apostolic Life"
      width={520}
      height={88}
      priority
      className={className}
    />
  );

  if (!href) {
    return <span className="inline-flex shrink-0">{image}</span>;
  }

  return (
    <Link href={href} className="inline-flex shrink-0">
      {image}
    </Link>
  );
}
