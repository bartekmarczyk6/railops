"use client";

import React from "react";
import { Shimmer } from "@/components/beui/atoms/Shimmer.tsx";
import { EventTimeline } from "@/components/trace/event-timeline.tsx";
import type { TraceEvent } from "@/lib/storage/types.ts";

export function activitySummary(events: readonly TraceEvent[]): string {
  const totalMs = events.reduce((sum, e) => sum + (e.durationMs ?? 0), 0);
  return `${events.length} steps · ${totalMs} ms`;
}

export function AgentActivityCard({
  events,
  running,
  onSelectEvent,
  embedded = false,
}: {
  events: TraceEvent[];
  running: boolean;
  onSelectEvent: (event: TraceEvent) => void;
  embedded?: boolean;
}): React.JSX.Element {
  const totalMs = events.reduce((sum, e) => sum + (e.durationMs ?? 0), 0);
  const body = (
    <div className={embedded ? "grid" : "p-2"}>
      {events.length === 0 ? (
        <p className="m-0 flex items-center gap-2 px-2 py-1.5 text-[13px] text-ink-2" role="status">
          <span
            aria-hidden
            className="size-3.5 rounded-full border-[1.5px] border-line-strong border-t-ink-2"
            style={{ animation: "spin 700ms linear infinite" }}
          />
          Starting the agent…
        </p>
      ) : (
        <EventTimeline events={events} onSelectEvent={onSelectEvent} />
      )}
    </div>
  );
  if (embedded) {
    return (
      <div data-component="agent-activity" data-section="agent-activity" aria-label="Agent activity">
        {body}
      </div>
    );
  }
  return (
    <section
      data-component="agent-activity"
      data-section="agent-activity"
      aria-label="Agent activity"
      className="overflow-hidden rounded-card bg-surface shadow-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <h2 className="m-0 font-display text-[14px] font-semibold text-ink">Agent activity</h2>
        {running ? (
          <Shimmer className="text-[12px] font-medium">Working through the case…</Shimmer>
        ) : events.length > 0 ? (
          <span className="font-mono text-[11.5px] tabular-nums text-ink-3">
            {events.length} steps · {totalMs} ms
          </span>
        ) : null}
      </div>
      {body}
    </section>
  );
}
