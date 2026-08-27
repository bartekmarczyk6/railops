"use client";

import type { ReactNode } from "react";

export type FieldProps = {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
};

export function Field({ id, label, hint, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-bold text-[color:var(--text)]">
        {label}
      </label>
      {children}
      {hint ? (
        <p className="text-xs text-[color:var(--text-muted)]">{hint}</p>
      ) : null}
    </div>
  );
}
