"use client";

import type { HTMLAttributes, ReactNode } from "react";

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

export function Card({ className, children, ...rest }: CardProps) {
  const cls = [
    "rounded-[var(--radius-md)] border border-[color:var(--border)]",
    "bg-[color:var(--surface-raised)] p-4",
    className ?? "",
  ].join(" ").trim();
  return (
    <div className={cls} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={["mb-3 flex items-center justify-between", className ?? ""].join(" ").trim()}>
      {children}
    </div>
  );
}

export function CardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h3 className={["text-base font-bold text-[color:var(--text)]", className ?? ""].join(" ").trim()}>
      {children}
    </h3>
  );
}
