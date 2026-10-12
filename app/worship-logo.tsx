import Image from "next/image";
import Link from "next/link";

export default function WorshipLogo({
  className = "h-auto w-56 max-w-full",
  href = "/",
}: {
  className?: string;
  href?: string;
}) {
  return (
    <Link href={href} className="inline-flex">
      <Image
        src="/ApostolicWorship_DarkBackGround_Transparent.png"
        alt="Apostolic Worship"
        width={500}
        height={500}
        priority
        className={className}
      />
    </Link>
  );
}
