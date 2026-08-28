"use client";

import React from "react";
import { Shimmer } from "@/components/beui/atoms/Shimmer.tsx";
import { StatusPill } from "@/components/beui/atoms/StatusPill.tsx";
import type { DecisionDraft } from "@/lib/llm/types.ts";
import { isCaseTopic, isTruthMode } from "@/app/api/_shared/validation.ts";
import { DraftEditor } from "./draft-editor.tsx";
import { DraftSelectionActions } from "./draft-selection-actions.tsx";
import { formatMoney, outcomeHeadline, outcomeLabel } from "./formatters.ts";

export type DraftResponseCardProps = {
  decision: DecisionDraft | null;
  editing: boolean;
  editedDraft: DecisionDraft | null;
  onChangeEditedDraft: (next: DecisionDraft) => void;
  account?: { fullName: string; email: string } | null;
  subject?: string;
  currency?: string;
  streaming?: boolean;
  pending?: boolean;
  caseId?: string;
  topic?: string;
  truthMode?: string;
  rewriteEnabled?: boolean;
  onApplyRewrite?: (newResponse: string) => void;
};

export function DraftResponseCard({
  decision,
  editing,
  editedDraft,
  onChangeEditedDraft,
  account,
  subject,
  currency = "PLN",
  streaming = false,
  pending = false,
  caseId,
  topic,
  truthMode,
  rewriteEnabled = false,
  onApplyRewrite,
}: DraftResponseCardProps): React.JSX.Element {
  const draft = editedDraft ?? decision;
  return (
    <section
      data-component="draft-response"
      data-section="draft"
      aria-label="Draft reply"
      className="rounded-card bg-surface shadow-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <h2 className="m-0 font-display text-[14px] font-semibold text-ink">Draft reply</h2>
        {editing ? (
          <span className="text-[12px] font-medium text-ink-3">Editing</span>
        ) : decision ? (
          <StatusPill tone={decision.outcome === "refund" ? "green" : "accent"} dot={false}>
            {outcomeLabel(decision.outcome)}
            {decision.proposedAmount !== null
              ? ` · ${formatMoney(decision.proposedAmount, currency)}`
              : ""}
          </StatusPill>
        ) : streaming || pending ? (
          <Shimmer className="text-[12px] font-medium">Drafting the reply…</Shimmer>
        ) : null}
      </div>
      <div className="grid gap-3 p-4">
        {account || subject ? (
          <div className="grid gap-px text-[12.5px]">
            {account ? (
              <p className="m-0 truncate">
                <span className="text-ink-3">To:</span>{" "}
                <span className="font-medium text-ink">{account.fullName}</span>{" "}
                <span className="font-mono text-[11.5px] text-ink-3">&lt;{account.email}&gt;</span>
              </p>
            ) : null}
            {subject ? (
              <p className="m-0 truncate">
                <span className="text-ink-3">Re:</span>{" "}
                <span className="text-ink-2">{subject}</span>
              </p>
            ) : null}
          </div>
        ) : null}
        {editing && draft ? (
          <DraftEditor draft={draft} onChange={onChangeEditedDraft} />
        ) : decision ? (
          <div className="enter-fade-up grid gap-2">
            <p data-field="reply-headline" className="m-0 text-[13px] font-medium text-ink">
              {outcomeHeadline(decision.outcome)}
              {decision.proposedAmount !== null
                ? ` — ${formatMoney(decision.proposedAmount, currency)}`
                : ""}
            </p>
            {streaming || pending || !caseId || !onApplyRewrite || !isCaseTopic(topic) || !isTruthMode(truthMode) || !account ? (
              <div
                aria-busy={streaming || undefined}
                className="rounded-control bg-inset px-3 py-2.5"
              >
                <p
                  data-field="reply-text"
                  className="m-0 text-[13px] leading-relaxed whitespace-pre-wrap text-ink-2"
                >
                  {decision.response}
                  {streaming ? <span aria-hidden className="stream-caret is-streaming" /> : null}
                </p>
              </div>
            ) : (
              <DraftSelectionActions
                text={decision.response}
                caseId={caseId}
                topic={topic}
                truthMode={truthMode}
                account={account}
                enabled={rewriteEnabled}
                onApply={onApplyRewrite}
              />
            )}
          </div>
        ) : pending ? (
          <div data-field="pending" aria-busy="true" className="grid gap-2">
            <span className="h-4 w-48 animate-skeleton rounded-md bg-inset" />
            <span className="h-3 w-full animate-skeleton rounded-md bg-inset" />
            <span className="h-3 w-5/6 animate-skeleton rounded-md bg-inset" />
            <span className="h-3 w-2/3 animate-skeleton rounded-md bg-inset" />
          </div>
        ) : (
          <p data-field="awaiting-draft" className="m-0 text-[13px] text-ink-3">
            The draft reply appears once the agent starts drafting.
          </p>
        )}
      </div>
    </section>
  );
}
