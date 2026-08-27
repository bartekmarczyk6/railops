import React from "react";
import type { TraceStatus } from "@/lib/storage/types.ts";

export type ToolChipProps = {
  functionName: string | null;
  durationMs: number | null;
  status: TraceStatus;
};

const STATUS_LABEL: Record<TraceStatus, string> = {
  started: "running",
  completed: "done",
  failed: "failed",
};

export function ToolChip({ functionName, durationMs, status }: ToolChipProps): React.JSX.Element {
  const label = functionName ?? "pipeline";
  const dur = durationMs !== null ? `${durationMs} ms` : "—";
  return (
    <span
      data-component="tool-chip"
      data-status={status}
      data-function-name={functionName ?? ""}
      style={{
        display: "inline-flex",
        gap: "var(--space-2)",
        alignItems: "center",
        padding: "var(--space-1) var(--space-2)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
        background: "var(--surface-raised)",
        fontSize: "12px",
        lineHeight: "16px",
      }}
    >
      <span aria-hidden="true" data-status-dot={status}>
        ●
      </span>
      <span data-label="function">{label}</span>
      <span data-label="duration">{dur}</span>
      <span data-label="status-text">{STATUS_LABEL[status]}</span>
    </span>
  );
}
