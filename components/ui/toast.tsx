"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";

type ToastState = { id: number; message: string } | null;

let externalSetter: ((t: ToastState) => void) | null = null;
let counter = 0;

export function pushToast(message: string): void {
  if (externalSetter) {
    externalSetter({ id: ++counter, message });
  }
}

export function Toast({ children }: { children?: ReactNode }) {
  void children;
  const [toast, setToast] = useState<ToastState>(null);

  useEffect(() => {
    externalSetter = setToast;
    return () => {
      if (externalSetter === setToast) externalSetter = null;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!toast) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="toast"
      className={
        "fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-[var(--radius-md)] " +
        "border border-[color:var(--border)] bg-[color:var(--surface-raised)] " +
        "px-4 py-2 text-sm text-[color:var(--text)]"
      }
    >
      {toast.message}
    </div>
  );
}
