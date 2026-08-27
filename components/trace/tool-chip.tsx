import React from "react";
import { CircleCheck, CircleX, LoaderCircle } from "lucide-react";
import { ActivityRow } from "@/components/agents/agent-activity/activity-row";
import type { AgentActivityItem } from "@/components/agents/agent-activity/types";
import type { TraceStatus } from "@/lib/storage/types.ts";

export type ToolChipProps = {
  functionName: string | null;
  durationMs: number | null;
  status: TraceStatus;
};

function statusIcon(status: TraceStatus): React.ReactElement {
  if (status === "completed") {
    return <CircleCheck className="size-4" style={{ color: "var(--verified)" }} />;
  }
  if (status === "failed") {
    return <CircleX className="size-4" style={{ color: "var(--error)" }} />;
  }
  return <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />;
}

export function ToolChip({ functionName, durationMs, status }: ToolChipProps): React.JSX.Element {
  const label = functionName ?? "pipeline";
  const item: AgentActivityItem = {
    id: `${label}-${status}`,
    type: "trace",
    kind: status === "failed" ? "error" : "run",
    label,
    detail: durationMs !== null ? `${durationMs} ms` : "—",
    icon: statusIcon(status),
  };
  return (
    <div
      data-component="tool-chip"
      data-status={status}
      data-function-name={functionName ?? ""}
      className="inline-flex max-w-full"
    >
      <ActivityRow item={item} />
    </div>
  );
}
