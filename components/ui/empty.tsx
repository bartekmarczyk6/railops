"use client";

import type { ReactNode } from "react";

export type EmptyProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  testId?: string;
  children?: ReactNode;
};

export function Empty({ title, description, action, testId, children }: EmptyProps) {
  return (
    <div
      data-testid={testId ?? "empty"}
      className={
        "flex flex-col items-start gap-3 rounded-[var(--radius-md)] " +
        "border border-dashed border-[color:var(--border)] " +
        "bg-[color:var(--surface-raised)] p-6"
      }
    >
      <h3 className="text-base font-bold text-[color:var(--text)]">{title}</h3>
      {description ? (
        <p className="text-sm text-[color:var(--text-muted)]">{description}</p>
      ) : null}
      {children}
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  );
}
