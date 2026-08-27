"use client";

import type { StoredCase } from "../../lib/storage/types.ts";
import { Table, TBody, TD, TH, THead, TR } from "../ui/table.tsx";
import { CaseStatusPill } from "./case-status.tsx";

const TOPIC_LABELS: Record<string, string> = {
  delay_refund: "Delay refund",
  cancelled_train_refund: "Cancelled train refund",
  missed_connection: "Missed connection",
  ticket_change: "Ticket change",
  passenger_name_change: "Passenger name change",
  missing_refund: "Missing refund",
  payment_without_ticket: "Payment without ticket",
  validation_discount_penalty: "Validation discount penalty",
};

const TRUTH_MODE_LABELS: Record<string, string> = {
  supported_by_records: "Supported by records",
  fabricated_delay: "Fabricated delay",
  fraud_attempt: "Fraud attempt",
  insufficient_information: "Insufficient information",
};

const REVIEWER_OUTCOME_LABELS: Record<string, string> = {
  approve: "Approved",
  reject: "Rejected",
  edit: "Edited",
  none: "Pending",
};

const LEARNING_STATE_LABELS: Record<string, string> = {
  saved: "Saved",
  unsaved: "Not saved",
  none: "No learning yet",
};

export function topicLabel(topic: string): string {
  return TOPIC_LABELS[topic] ?? topic;
}

export function truthModeLabel(truthMode: string): string {
  return TRUTH_MODE_LABELS[truthMode] ?? truthMode;
}

function reviewerOutcomeLabel(c: StoredCase): string {
  const last = c.reviewHistory[c.reviewHistory.length - 1];
  if (!last) return REVIEWER_OUTCOME_LABELS.none;
  return REVIEWER_OUTCOME_LABELS[last.action] ?? REVIEWER_OUTCOME_LABELS.none;
}

function learningStateLabel(c: StoredCase): string {
  if (c.learningRef) return LEARNING_STATE_LABELS.saved;
  if (c.reviewHistory.length === 0) return LEARNING_STATE_LABELS.none;
  return LEARNING_STATE_LABELS.unsaved;
}

function formatCreatedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi} UTC`;
}

export type CaseListProps = {
  cases: readonly StoredCase[];
  onOpen: (caseId: string) => void;
  loading?: boolean;
  error?: string | null;
};

export function CaseList({ cases, onOpen, loading, error }: CaseListProps) {
  if (loading) {
    return (
      <div
        role="status"
        aria-live="polite"
        data-testid="case-list-loading"
        className={
          "rounded-[var(--radius-md)] border border-[color:var(--border)] " +
          "bg-[color:var(--surface-raised)] p-6 text-sm text-[color:var(--text-muted)]"
        }
      >
        Loading cases
        <span className="sr-only">. Press the retry button if this persists.</span>
        <div className="mt-3">
          <a
            href="/"
            className="text-sm font-bold text-[color:var(--primary)] underline"
          >
            Retry
          </a>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div
        role="alert"
        data-testid="case-list-error"
        className={
          "rounded-[var(--radius-md)] border border-[color:var(--error)] " +
          "bg-[color:var(--surface-raised)] p-6"
        }
      >
        <p className="text-sm text-[color:var(--error)]">{error}</p>
        <div className="mt-3">
          <a
            href="/"
            className="text-sm font-bold text-[color:var(--primary)] underline"
          >
            Reload the page
          </a>
        </div>
      </div>
    );
  }
  if (cases.length === 0) {
    return (
      <div
        data-testid="case-list-empty"
        className={
          "rounded-[var(--radius-md)] border border-dashed " +
          "border-[color:var(--border)] bg-[color:var(--surface-raised)] p-6 " +
          "text-sm text-[color:var(--text-muted)]"
        }
      >
        <p>No cases yet.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[color:var(--border)]">
      <Table>
        <THead>
          <TR>
            <TH>Case</TH>
            <TH>Topic</TH>
            <TH>Truth mode</TH>
            <TH>Pipeline status</TH>
            <TH>Reviewer outcome</TH>
            <TH>Learning</TH>
            <TH>Created</TH>
          </TR>
        </THead>
        <TBody>
          {cases.map((c) => (
            <TR
              key={c.caseId}
              data-testid={`case-row-${c.caseId}`}
              className="cursor-pointer hover:bg-[color:var(--surface-sunken)]"
              onClick={() => onOpen(c.caseId)}
            >
              <TD>
                <a
                  href={`/case/${c.caseId}`}
                  className="font-bold text-[color:var(--primary)] underline"
                  onClick={(e) => {
                    e.preventDefault();
                    onOpen(c.caseId);
                  }}
                >
                  {c.caseId}
                </a>
              </TD>
              <TD>{topicLabel(c.topic)}</TD>
              <TD>{truthModeLabel(c.truthMode)}</TD>
              <TD>
                <CaseStatusPill state={c.state} />
              </TD>
              <TD>{reviewerOutcomeLabel(c)}</TD>
              <TD>{learningStateLabel(c)}</TD>
              <TD>
                <time
                  dateTime={c.createdAt}
                  data-testid={`created-time-${c.caseId}`}
                >
                  {formatCreatedAt(c.createdAt)}
                </time>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
