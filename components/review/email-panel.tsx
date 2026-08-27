"use client";

import React from "react";
import { Shimmer } from "@/components/beui/atoms/Shimmer.tsx";
import type { DecisionDraft, EmailDraft, ExtractedClaims } from "@/lib/llm/types.ts";
import { DraftEditor } from "./draft-editor.tsx";
import {
  formatDateTime,
  formatEvidenceRef,
  formatMoney,
  humanize,
  outcomeLabel,
  requestedActionLabel,
} from "./formatters.ts";

export type EmailPanelProps = {
  email: EmailDraft;
  claims: ExtractedClaims | null;
  decision: DecisionDraft | null;
  editing: boolean;
  editedDraft: DecisionDraft | null;
  onChangeEditedDraft: (next: DecisionDraft) => void;
  account?: { fullName: string; email: string } | null;
  from?: string;
  receivedAt?: string | null;
  emailStreaming?: boolean;
  claimsStreaming?: boolean;
  decisionStreaming?: boolean;
};

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.charAt(0) ?? "?";
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
  return (first + last).toUpperCase();
}

function parseFrom(value: string): { name: string | null; address: string } {
  const match = /^(.*?)\s*<([^>]+)>$/.exec(value.trim());
  if (match) return { name: match[1].trim() || null, address: match[2].trim() };
  return { name: null, address: value.trim() };
}

function StreamingCaret(): React.JSX.Element {
  return <span aria-hidden="true" className="stream-caret is-streaming" />;
}

function FactChip({
  refValue,
  children,
}: {
  refValue?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <span
      data-record-ref={refValue}
      className="inline-flex h-6 items-center rounded-full bg-inset px-2.5 text-[12px] font-medium text-ink-2"
    >
      {children}
    </span>
  );
}

export function EmailPanel({
  email,
  claims,
  decision,
  editing,
  editedDraft,
  onChangeEditedDraft,
  account,
  from,
  receivedAt,
  emailStreaming = false,
  claimsStreaming = false,
  decisionStreaming = false,
}: EmailPanelProps): React.JSX.Element {
  const draft = editedDraft ?? decision;
  const showDraft = decision !== null || editedDraft !== null;
  const parsedFrom = from ? parseFrom(from) : null;
  const fromName = parsedFrom ? parsedFrom.name : account ? account.fullName : null;
  const fromAddress = parsedFrom
    ? parsedFrom.address
    : account
      ? account.email
      : "";
  const fromInitials = parsedFrom
    ? parsedFrom.name
      ? initialsOf(parsedFrom.name)
      : initialsOf(parsedFrom.address.split("@")[0] ?? "?")
    : account
      ? initialsOf(account.fullName)
      : "?";
  return (
    <section
      data-component="email-panel"
      data-section="email"
      aria-label="Inbound email"
      className="overflow-hidden rounded-card bg-surface shadow-card"
    >
      <div data-field="inbound" className="grid gap-3 p-4">
        {parsedFrom || account ? (
          <div className="flex items-start gap-3">
            <span
              aria-hidden
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-tint font-display text-[12px] font-semibold text-accent-ink"
            >
              {fromInitials}
            </span>
            <div className="grid min-w-0 flex-1 gap-px text-[13px]">
              <p className="m-0 truncate">
                <span className="text-ink-3">From:</span>{" "}
                <span className="font-medium text-ink">{fromName ?? fromAddress}</span>{" "}
                {fromName ? (
                  <span className="font-mono text-[12px] text-ink-3">&lt;{fromAddress}&gt;</span>
                ) : null}
              </p>
              <p className="m-0 truncate">
                <span className="text-ink-3">To:</span>{" "}
                <span className="text-ink-2">support@koleo.pl</span>
              </p>
            </div>
            {receivedAt ? (
              <time className="shrink-0 font-mono text-[11.5px] tabular-nums text-ink-3">
                {formatDateTime(receivedAt)}
              </time>
            ) : null}
          </div>
        ) : null}
        <h2 data-field="inbound-subject" className="m-0 font-display text-[15px] font-semibold text-ink">
          {email.subject}
        </h2>
        <div
          aria-busy={emailStreaming || undefined}
          className="rounded-control bg-inset px-3 py-2.5"
        >
          {emailStreaming && email.body.length === 0 ? (
            <p data-field="inbound-body" role="status" className="m-0 text-[13px] leading-relaxed">
              <Shimmer>Reading the email…</Shimmer>
            </p>
          ) : (
            <p data-field="inbound-body" className="m-0 text-[13px] leading-relaxed whitespace-pre-wrap text-ink-2">
              {email.body}
              {emailStreaming ? <StreamingCaret /> : null}
            </p>
          )}
        </div>
        {email.mentionedFacts.length > 0 ? (
          <div data-field="mentioned-facts" className="flex flex-wrap items-center gap-1.5">
            <span className="text-[12px] font-medium text-ink-3">Mentions</span>
            {email.mentionedFacts.map((fact) => (
              <FactChip key={fact} refValue={fact}>
                {formatEvidenceRef(fact)}
              </FactChip>
            ))}
          </div>
        ) : null}
      </div>

      <div data-field="claims" aria-label="What the passenger wants" className="border-t border-line bg-inset/40 p-4">
        <h3 className="m-0 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">
          What they want
        </h3>
        {claims ? (
          <div className="enter-fade-up mt-2 grid gap-2">
            <p className="m-0">
              <span
                data-field="requested-action"
                className="inline-flex h-6 items-center rounded-full bg-accent-tint px-2.5 text-[12px] font-medium text-accent-ink"
              >
                {requestedActionLabel(claims.requestedAction)}
              </span>
            </p>
            {claims.claims.length > 0 ? (
              <ul className="m-0 grid list-none gap-1 p-0">
                {claims.claims.map((claim, i) => (
                  <li
                    key={i}
                    data-record-ref={claim.ticketNumber ? `record:ticket:${claim.ticketNumber}` : undefined}
                    className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-2"
                  >
                    <span aria-hidden className="size-1 shrink-0 rounded-full bg-line-strong" />
                    <span className="min-w-0 flex-1">{claim.description}</span>
                    {claim.kind ? (
                      <span className="font-mono text-[11px] text-ink-3">{humanize(claim.kind)}</span>
                    ) : null}
                    {claim.ticketNumber ? (
                      <FactChip refValue={`record:ticket:${claim.ticketNumber}`}>
                        Ticket {claim.ticketNumber}
                      </FactChip>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
            {claims.referencedStations.length > 0 ? (
              <p className="m-0 flex flex-wrap items-center gap-1.5">
                <FactChip>{claims.referencedStations.join(" → ")}</FactChip>
              </p>
            ) : null}
            {claims.missingFields.length > 0 ? (
              <p data-field="missing-fields-inline" className="m-0 text-[12.5px] text-ink-3">
                Still needed: {claims.missingFields.map(humanize).join(", ")}
              </p>
            ) : null}
          </div>
        ) : claimsStreaming ? (
          <p className="mt-2 m-0 text-[13px]" role="status">
            <Shimmer>Reading the message…</Shimmer>
          </p>
        ) : (
          <p className="mt-2 m-0 text-[13px] text-ink-3">No claims extracted yet.</p>
        )}
      </div>

      {showDraft ? (
        <div data-field="draft-response" aria-label="Draft response" className="grid gap-2 border-t border-line p-4">
          <h3 className="m-0 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">
            {editing ? "Draft response (editing)" : "Draft response"}
          </h3>
          {editing && draft ? (
            <DraftEditor draft={draft} onChange={onChangeEditedDraft} />
          ) : decision ? (
            <div className="grid gap-1">
              <p className="m-0 text-[12px] text-ink-3">
                {outcomeLabel(decision.outcome)}
                {decision.proposedAmount !== null
                  ? ` · ${formatMoney(decision.proposedAmount)}`
                  : ""}
              </p>
              <p data-field="draft-response-text" className="m-0 text-[13px] leading-relaxed whitespace-pre-wrap">
                {decision.response}
                {decisionStreaming ? <StreamingCaret /> : null}
              </p>
            </div>
          ) : decisionStreaming ? (
            <p className="m-0 text-[13px]" role="status">
              <Shimmer>Drafting the reply…</Shimmer>
            </p>
          ) : (
            <p className="m-0 text-[13px] text-ink-3">No draft response yet.</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
