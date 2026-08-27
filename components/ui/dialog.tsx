"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

export type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  labelledBy?: string;
};

export function Dialog({ open, onClose, title, description, children, labelledBy }: DialogProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy ?? "dialog-title"}
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
    >
      <div
        className="absolute inset-0 bg-[color:var(--text)]/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={ref}
        tabIndex={-1}
        className={
          "relative w-full max-w-md rounded-t-[var(--radius-lg)] sm:rounded-[var(--radius-md)] " +
          "bg-[color:var(--surface-raised)] border border-[color:var(--border)] " +
          "p-6 outline-none"
        }
      >
        <h2 id={labelledBy ?? "dialog-title"} className="text-lg font-bold text-[color:var(--text)]">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-sm text-[color:var(--text-muted)]">{description}</p>
        ) : null}
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
