import React from "react";
import { StatusPill } from "@/components/beui/atoms/StatusPill.tsx";
import { topicLabel, truthModeLabel } from "@/components/cases/case-list.tsx";
import type { CaseState, StoredCase } from "@/lib/storage/types.ts";
import { formatDateTime } from "./formatters.ts";

export type CaseHeaderProps = {
  caseData: StoredCase;
};

const STATE_PILL: Record<CaseState, { tone: "green" | "orange" | "red" | "accent" | "neutral"; label: string }> = {
  created: { tone: "neutral", label: "Queued" },
  running: { tone: "accent", label: "Agent working" },
  reviewable: { tone: "accent", label: "Ready for your review" },
  approved: { tone: "green", label: "Approved" },
  rejected: { tone: "red", label: "Rejected" },
  escalated: { tone: "orange", label: "Escalated" },
  revising: { tone: "orange", label: "Revised draft" },
  learning_saved: { tone: "green", label: "Learning saved" },
  error: { tone: "red", label: "Run failed" },
};

export function CaseHeader({ caseData }: CaseHeaderProps): React.JSX.Element {
  const state = STATE_PILL[caseData.state];
  return (
    <header
      data-component="case-header"
      data-section="header"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card bg-surface px-4 py-3 shadow-card"
    >
      <span
        data-badge="synthetic"
        className="inline-flex h-6 items-center gap-1.5 rounded-full bg-accent-tint px-2.5 text-[12px] font-medium text-accent-ink"
      >
        <span aria-hidden className="size-1.5 rounded-full bg-(--accent)" />
        Synthetic data
      </span>
      <span data-field="case-id" className="max-w-40 truncate font-mono text-[12px] text-ink-3">
        {caseData.caseId}
      </span>
      <span aria-hidden className="hidden h-4 w-px bg-line-strong sm:block" />
      <h1 data-field="topic" className="font-display text-[15px] font-semibold text-ink">
        {topicLabel(caseData.topic)}
      </h1>
      <span
        data-field="truth-mode"
        aria-label="Scenario"
        className="inline-flex h-6 items-center rounded-full bg-inset px-2.5 text-[12px] font-medium text-ink-2"
      >
        Scenario: {truthModeLabel(caseData.truthMode)}
      </span>
      <span data-field="state" data-state-badge={caseData.state} className="contents">
        <StatusPill tone={state.tone}>{state.label}</StatusPill>
      </span>
      <time
        data-field="created-at"
        className="ms-auto font-mono text-[12px] tabular-nums text-ink-3"
      >
        {formatDateTime(caseData.createdAt)}
      </time>
    </header>
  );
}
