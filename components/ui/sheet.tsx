"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

export type SheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
};

export function Sheet({ open, onClose, title, children }: SheetProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex justify-end"
    >
      <div
        className="absolute inset-0 bg-[color:var(--text)]/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={ref}
        className={
          "relative h-full w-full max-w-md overflow-y-auto " +
          "border-l border-[color:var(--border)] bg-[color:var(--surface-raised)] p-6"
        }
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[color:var(--text)]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className={
              "h-11 rounded-[var(--radius-md)] px-3 text-sm " +
              "text-[color:var(--text)] hover:bg-[color:var(--surface-sunken)] " +
              "focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-0 " +
              "focus-visible:outline-[color:var(--primary)]"
            }
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
