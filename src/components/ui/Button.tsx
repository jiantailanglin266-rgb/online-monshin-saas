"use client";

import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const styles: Record<Variant, string> = {
  primary:
    "bg-primary text-white hover:bg-primary-dark disabled:bg-l4/40 disabled:cursor-not-allowed",
  secondary:
    "bg-surface text-primary border border-primary/40 hover:bg-primary-soft",
  ghost: "bg-transparent text-ink-sub hover:bg-l4-soft",
  danger: "bg-l1 text-white hover:opacity-90",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`min-h-12 rounded-xl px-5 text-[17px] font-bold transition-colors ${styles[variant]} ${className}`}
      {...props}
    />
  );
}
