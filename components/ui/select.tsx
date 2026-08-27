"use client";

import type { SelectHTMLAttributes } from "react";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  id: string;
};

export function Select({ id, className, children, ...rest }: SelectProps) {
  const cls = [
    "h-11 w-full rounded-[var(--radius-md)] border border-[color:var(--border)]",
    "bg-[color:var(--surface-raised)] px-3 text-sm text-[color:var(--text)]",
    "focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-0",
    "focus-visible:outline-[color:var(--primary)]",
    className ?? "",
  ].join(" ").trim();
  return (
    <select id={id} className={cls} {...rest}>
      {children}
    </select>
  );
}
