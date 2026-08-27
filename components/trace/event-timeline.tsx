"use client";

import React from "react";
import { CircleCheck, CircleX, LoaderCircle } from "lucide-react";
import {
  Timeline,
  TimelineContent,
  TimelineDate,
  TimelineHeader,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
  TimelineTitle,
} from "@/components/reui/timeline";
import { ThinkingShimmer } from "@/components/agents/loading-states/thinking-shimmer";
import type { TraceEvent, TraceStatus } from "@/lib/storage/types.ts";
import { ToolChip } from "./tool-chip.tsx";

export type EventTimelineProps = {
  events: TraceEvent[];
  onSelectEvent: (event: TraceEvent) => void;
};

const STAGE_LABEL: Record<TraceEvent["stage"], string> = {
  generating_email: "Generating email",
  extracting_claims: "Extracting claims",
  retrieving_knowledge: "Retrieving knowledge",
  checking_records: "Checking records",
  evaluating_rules: "Evaluating rules",
  drafting: "Drafting decision",
  critiquing: "Critiquing draft",
  reviewable: "Ready for review",
  revising: "Revising",
  learning_saved: "Learning saved",
};

export function stageLabel(stage: TraceEvent["stage"]): string {
  return STAGE_LABEL[stage] ?? stage;
}

function fmtDuration(ms: number | null): string {
  if (ms === null) return "—";
  return `${ms} ms`;
}

function fmtTime(timestamp: string): string {
  return timestamp.length >= 19 ? timestamp.slice(11, 19) : timestamp;
}

function StatusIcon({ status }: { status: TraceStatus }): React.ReactElement {
  if (status === "completed") {
    return (
      <span aria-label="completed" data-status-icon="completed">
        <CircleCheck className="size-4" style={{ color: "var(--verified)" }} />
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span aria-label="failed" data-status-icon="failed">
        <CircleX className="size-4" style={{ color: "var(--error)" }} />
      </span>
    );
  }
  return (
    <span aria-label="running" data-status-icon="started">
      <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
    </span>
  );
}

export function EventTimeline({ events, onSelectEvent }: EventTimelineProps): React.JSX.Element {
  const doneCount = events.filter((e) => e.status !== "started").length;
  return (
    <section data-component="event-timeline" data-section="trace" className="grid gap-2">
      <Timeline value={doneCount} className="w-full">
        {events.map((ev, i) => (
          <TimelineItem
            key={ev.id}
            step={i + 1}
            data-event-id={ev.id}
            data-stage={ev.stage}
            data-status={ev.status}
          >
            <TimelineHeader>
              <TimelineDate>
                {fmtTime(ev.timestamp)} · {fmtDuration(ev.durationMs)}
              </TimelineDate>
              <TimelineTitle className="flex items-center gap-2">
                <StatusIcon status={ev.status} />
                <button
                  type="button"
                  data-action="open-evidence"
                  onClick={() => onSelectEvent(ev)}
                  aria-label={`${stageLabel(ev.stage)} — open raw evidence`}
                  className="min-h-11 flex-1 cursor-pointer rounded-md text-left outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {ev.status === "started" ? (
                    <ThinkingShimmer>{stageLabel(ev.stage)}…</ThinkingShimmer>
                  ) : (
                    stageLabel(ev.stage)
                  )}
                </button>
              </TimelineTitle>
            </TimelineHeader>
            <TimelineIndicator />
            <TimelineSeparator />
            <TimelineContent className="grid gap-1">
              <p className="m-0">{ev.summary}</p>
              <ToolChip functionName={ev.functionName} durationMs={ev.durationMs} status={ev.status} />
              {ev.evidenceRefs.length > 0 ? (
                <p data-field="evidence-refs" className="m-0">
                  Evidence:{" "}
                  {ev.evidenceRefs.map((r) => (
                    <code
                      key={r}
                      data-record-ref={r}
                      className="me-2 inline-block font-mono text-xs"
                    >
                      {r}
                    </code>
                  ))}
                </p>
              ) : null}
              {ev.error ? (
                <p data-field="error" role="alert" className="m-0" style={{ color: "var(--error)" }}>
                  {ev.error}
                </p>
              ) : null}
            </TimelineContent>
          </TimelineItem>
        ))}
      </Timeline>
    </section>
  );
}
