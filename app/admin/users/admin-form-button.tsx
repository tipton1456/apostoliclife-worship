"use client";

import type React from "react";
import { useFormStatus } from "react-dom";

export default function AdminFormButton({
  children,
  pendingLabel,
  variant = "primary",
  className = "",
  disabled = false,
}: {
  children: React.ReactNode;
  pendingLabel: string;
  variant?: "primary" | "danger";
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  const isDisabled = pending || disabled;
  const variantClass =
    variant === "danger"
      ? "border border-white/10 text-red-300 transition hover:border-red-300/60 hover:bg-red-400/10"
      : "bg-[#7bbc07] text-neutral-950 transition hover:bg-[#8ed20a]";

  return (
    <button
      type="submit"
      disabled={isDisabled}
      className={`${variantClass} inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
