import React from "react";
"use client";

import { useState } from "react";
import type { TraceEvent } from "@/lib/storage/types.ts";
import { ToolChip } from "./tool-chip.tsx";
import { RawEvidenceSheet } from "./raw-evidence-sheet.tsx";

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

function fmtDuration(ms: number | null): string {
  if (ms === null) return "—";
  return `${ms} ms`;
}

export function EventTimeline({ events, onSelectEvent }: EventTimelineProps): React.JSX.Element {
  const [openId, setOpenId] = useState<string | null>(null);
  const selected = openId ? events.find((e) => e.id === openId) ?? null : null;

  return (
    <section data-component="event-timeline" data-section="trace">
      <h2>Trace</h2>
      <ol
        data-role="timeline-list"
        style={{
          display: "grid",
          gap: "var(--space-2)",
          margin: 0,
          padding: 0,
          listStyle: "none",
        }}
      >
        {events.map((ev) => {
          const isOpen = ev.id === openId;
          return (
            <li
              key={ev.id}
              data-event-id={ev.id}
              data-stage={ev.stage}
              data-status={ev.status}
              style={{
                display: "grid",
                gap: "var(--space-2)",
                padding: "var(--space-3)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                background: "var(--surface-raised)",
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setOpenId(isOpen ? null : ev.id);
                  onSelectEvent(ev);
                }}
                aria-expanded={isOpen}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: "var(--space-2)",
                  alignItems: "center",
                  padding: 0,
                  border: "none",
                  background: "transparent",
                  textAlign: "left",
                  cursor: "pointer",
                  minHeight: "44px",
                }}
              >
                <span data-field="stage-label">
                  {STAGE_LABEL[ev.stage] ?? ev.stage} — {ev.summary}
                </span>
                <span data-field="duration">{fmtDuration(ev.durationMs)}</span>
              </button>
              <ToolChip functionName={ev.functionName} durationMs={ev.durationMs} status={ev.status} />
              {ev.evidenceRefs.length > 0 ? (
                <p data-field="evidence-refs" style={{ margin: 0 }}>
                  Evidence: {ev.evidenceRefs.map((r) => (
                    <code
                      key={r}
                      data-record-ref={r}
                      style={{
                        display: "inline-block",
                        marginRight: "var(--space-2)",
                        fontFamily: "ui-monospace, monospace",
                      }}
                    >
                      {r}
                    </code>
                  ))}
                </p>
              ) : null}
              {ev.error ? (
                <p data-field="error" role="alert" style={{ margin: 0, color: "var(--error)" }}>
                  {ev.error}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
      <RawEvidenceSheet event={selected} />
    </section>
  );
}
