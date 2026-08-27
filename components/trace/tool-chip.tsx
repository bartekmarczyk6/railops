import React from "react";
import { CircleCheck, CircleX, LoaderCircle } from "lucide-react";
import type { TraceStatus } from "@/lib/storage/types.ts";

export type ToolChipProps = {
  functionName: string | null;
  durationMs: number | null;
  status: TraceStatus;
};

function statusIcon(status: TraceStatus): React.ReactElement | null {
  if (status === "completed") {
    return <CircleCheck className="size-3" style={{ color: "var(--green)" }} />;
  }
  if (status === "failed") {
    return <CircleX className="size-3" style={{ color: "var(--red)" }} />;
  }
  return <LoaderCircle className="size-3 animate-spin motion-reduce:animate-none" />;
}

export function ToolChip({ functionName, durationMs, status }: ToolChipProps): React.JSX.Element | null {
  if (!functionName) return null;
  return (
    <span
      data-component="tool-chip"
      data-status={status}
      data-function-name={functionName}
      className="inline-flex h-5.5 max-w-full items-center gap-1.5 rounded-chip bg-field px-2 font-mono text-[11px] text-ink-2 shadow-hairline"
    >
      {statusIcon(status)}
      <span className="truncate">{functionName}</span>
      <span className="shrink-0 tabular-nums text-ink-3">
        {durationMs !== null ? `${durationMs} ms` : "—"}
      </span>
    </span>
  );
}
