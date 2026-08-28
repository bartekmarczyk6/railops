"use client";

import React from "react";
import { useEffect, useMemo, useRef } from "react";
import { CircleCheck, CircleX, LoaderCircle } from "lucide-react";
import { Shimmer } from "@/components/beui/atoms/Shimmer.tsx";
import { formatEvidenceRef } from "@/components/review/formatters.ts";
import type { TraceEvent, TraceStatus } from "@/lib/storage/types.ts";
import { ToolChip } from "./tool-chip.tsx";

export type EventTimelineProps = {
  events: TraceEvent[];
  onSelectEvent: (event: TraceEvent) => void;
};

const STAGE_LABEL: Record<TraceEvent["stage"], string> = {
  reading_email: "Reading the email",
  locating_account: "Finding the passenger",
  generating_email: "Email received",
  extracting_claims: "Understanding the claim",
  retrieving_knowledge: "Looking up policy",
  checking_records: "Checking the records",
  evaluating_rules: "Applying the rules",
  drafting: "Drafting the decision",
  critiquing: "Reviewing the draft",
  follow_up: "Asking the reviewer",
  reviewable: "Ready for review",
  revising: "Revising the draft",
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
  return timestamp.length >= 16 ? timestamp.slice(11, 16) : timestamp;
}

function StatusIcon({ status, animate }: { status: TraceStatus; animate?: boolean }): React.ReactElement {
  if (status === "completed") {
    return (
      <span
        aria-label="completed"
        data-status-icon="completed"
        className={`text-green${animate ? " enter-fade-in" : ""}`}
      >
        <CircleCheck className="size-4" />
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span aria-label="failed" data-status-icon="failed" className="text-red">
        <CircleX className="size-4" />
      </span>
    );
  }
  return (
    <span aria-label="running" data-status-icon="started" className="text-ink-2">
      <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
    </span>
  );
}

export type TimelineRow = {
  key: string;
  event: TraceEvent;
};

const STANDALONE_STAGES: ReadonlySet<TraceEvent["stage"]> = new Set([
  "reviewable",
  "learning_saved",
]);

/* Fold started/completed pairs into a single row per stage-round: a started
 * event opens a row (keyed by its id); the completed/failed event for that
 * stage replaces the open row's event in place (stable key → the spinner
 * morphs into a check instead of leaving a stuck spinner row). A new started
 * event for a stage whose row already closed opens a new row (revision
 * rounds). reviewable/learning_saved events are always standalone rows. */
export function foldEventsIntoRows(events: readonly TraceEvent[]): TimelineRow[] {
  const rows: TimelineRow[] = [];
  const openRowByStage = new Map<string, number>();
  for (const event of events) {
    if (STANDALONE_STAGES.has(event.stage)) {
      rows.push({ key: event.id, event });
      continue;
    }
    if (event.status === "started") {
      openRowByStage.set(event.stage, rows.length);
      rows.push({ key: event.id, event });
      continue;
    }
    const openIndex = openRowByStage.get(event.stage);
    if (openIndex === undefined) {
      rows.push({ key: event.id, event });
      continue;
    }
    const open = rows[openIndex];
    if (open) {
      rows[openIndex] = { key: open.key, event };
    }
    openRowByStage.delete(event.stage);
  }
  return rows;
}

export function EventTimeline({ events, onSelectEvent }: EventTimelineProps): React.JSX.Element {
  const rows = useMemo(() => foldEventsIntoRows(events), [events]);
  const hasRenderedRef = useRef(false);
  const seenKeys = useRef<Set<string>>(new Set());
  const enteredKeys = useRef<Set<string>>(new Set());
  const prevStatus = useRef<Map<string, TraceStatus>>(new Map());
  const justCompletedKeys = useRef<Set<string>>(new Set());
  const hasRendered = hasRenderedRef.current;
  for (const row of rows) {
    if (hasRendered && !seenKeys.current.has(row.key)) enteredKeys.current.add(row.key);
    if (row.event.status === "completed" && prevStatus.current.get(row.key) === "started") {
      justCompletedKeys.current.add(row.key);
    }
  }
  useEffect(() => {
    hasRenderedRef.current = true;
    for (const row of rows) {
      seenKeys.current.add(row.key);
      prevStatus.current.set(row.key, row.event.status);
    }
  });
  return (
    <section data-component="event-timeline" data-section="trace" aria-label="Agent activity">
      <div className="relative">
        <span aria-hidden className="absolute top-3 bottom-3 left-[22px] w-px -translate-x-1/2 bg-line" />
        <ol className="m-0 grid list-none gap-0.5 p-0">
          {rows.map(({ key, event: ev }) => (
            <li
              key={key}
              data-event-id={ev.id}
              data-stage={ev.stage}
              data-status={ev.status}
              className={`relative${enteredKeys.current.has(key) ? " enter-fade-in" : ""}`}
            >
              <button
                type="button"
                data-action="open-evidence"
                onClick={() => onSelectEvent(ev)}
                aria-label={`${stageLabel(ev.stage)} — open details`}
                className="grid w-full grid-cols-[28px_minmax(0,1fr)_auto] items-start gap-2 rounded-control px-1.5 py-2 text-left transition-colors duration-100 hover:bg-hover"
              >
                <span className="relative z-10 mt-px flex size-7 items-center justify-center rounded-full bg-surface shadow-hairline">
                  <StatusIcon status={ev.status} animate={justCompletedKeys.current.has(key)} />
                </span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-[13px] font-medium text-ink">
                      {ev.status === "started" ? (
                        <Shimmer>{stageLabel(ev.stage)}…</Shimmer>
                      ) : (
                        stageLabel(ev.stage)
                      )}
                    </span>
                    <ToolChip
                      functionName={ev.functionName}
                      durationMs={ev.durationMs}
                      status={ev.status}
                    />
                  </span>
                  <span className="mt-0.5 block text-[12px] leading-snug text-ink-2">
                    {ev.summary}
                  </span>
                  {ev.evidenceRefs.length > 0 ? (
                    <span data-field="evidence-refs" className="mt-1 flex flex-wrap gap-1">
                      {ev.evidenceRefs.map((r) => (
                        <span
                          key={r}
                          data-record-ref={r}
                          className="inline-flex h-5 items-center rounded-full bg-inset px-2 text-[11px] font-medium text-ink-2"
                        >
                          {formatEvidenceRef(r)}
                        </span>
                      ))}
                    </span>
                  ) : null}
                  {ev.error ? (
                    <span
                      data-field="error"
                      role="alert"
                      className="mt-1 block text-[12px] font-medium text-red"
                    >
                      {ev.error}
                    </span>
                  ) : null}
                </span>
                <span className="mt-0.5 shrink-0 font-mono text-[11px] tabular-nums text-ink-3">
                  {fmtTime(ev.timestamp)} · {fmtDuration(ev.durationMs)}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
