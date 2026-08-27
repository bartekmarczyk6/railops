"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";
type Size = "md" | "sm";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
};

const base =
  "inline-flex items-center justify-center gap-2 font-medium select-none " +
  "transition-colors disabled:cursor-not-allowed disabled:opacity-50 " +
  "focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-0 " +
  "focus-visible:outline-[color:var(--primary)] min-h-[44px]";

const sizes: Record<Size, string> = {
  md: "h-11 px-4 text-sm rounded-[var(--radius-md)]",
  sm: "h-9 px-3 text-sm rounded-[var(--radius-sm)]",
};

const variants: Record<Variant, string> = {
  primary:
    "bg-[color:var(--primary)] text-white hover:bg-[color:var(--text)]",
  secondary:
    "bg-[color:var(--surface-raised)] text-[color:var(--text)] " +
    "border border-[color:var(--border)] hover:border-[color:var(--primary)]",
  ghost:
    "bg-transparent text-[color:var(--text)] " +
    "hover:bg-[color:var(--surface-sunken)]",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  type,
  children,
  ...rest
}: ButtonProps) {
  const cls = [base, sizes[size], variants[variant], className ?? ""].join(" ").trim();
  return (
    <button type={type ?? "button"} className={cls} {...rest}>
      {children}
    </button>
  );
}
