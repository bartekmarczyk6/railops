"use client";

import { ChevronRight } from "lucide-react";

import { Button } from "../beui/atoms/Button.tsx";
import { Button as LinkButton } from "../ui/button.tsx";
import { Skeleton } from "../ui/skeleton.tsx";
import type { StoredCase } from "../../lib/storage/types.ts";
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

function formatFullTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi} UTC`;
}

function formatRelativeTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diffMs = Date.now() - d.getTime();
  const suffix = diffMs < 0 ? "from now" : "ago";
  const minutes = Math.round(Math.abs(diffMs) / 60000);
  if (minutes < 1) return diffMs < 0 ? "soon" : "just now";
  if (minutes < 60) return `${minutes} min ${suffix}`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ${suffix}`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ${suffix}`;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export type CaseListProps = {
  cases: readonly StoredCase[];
  onOpen: (caseId: string) => void;
  loading?: boolean;
  error?: string | null;
  onCreate?: () => void;
};

export function CaseList({ cases, onOpen, loading, error, onCreate }: CaseListProps) {
  if (loading) {
    return (
      <div
        role="status"
        aria-live="polite"
        data-testid="case-list-loading"
        className="flex flex-col gap-3 rounded-window bg-surface p-4 shadow-card"
      >
        <Skeleton className="h-12 w-full rounded-control" />
        <Skeleton className="h-12 w-full rounded-control" />
        <Skeleton className="h-12 w-full rounded-control" />
        <p className="px-1 text-sm text-ink-2">
          Loading cases.{" "}
          <a
            href="/"
            className="font-medium text-accent-ink underline underline-offset-4"
          >
            Retry
          </a>{" "}
          if this persists.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        data-testid="case-list-error"
        className="flex flex-col items-start gap-3 rounded-window bg-surface p-6 shadow-card"
      >
        <p className="text-sm font-medium text-red">{error}</p>
        <LinkButton variant="outline" render={<a href="/" />}>
          Reload the page
        </LinkButton>
      </div>
    );
  }

  if (cases.length === 0) {
    return (
      <div
        data-testid="case-list-empty"
        className="flex flex-col items-center gap-4 rounded-window bg-surface p-10 text-center shadow-card"
      >
        <p className="text-sm text-ink-2">No cases yet.</p>
        {onCreate ? (
          <Button variant="accent" data-testid="case-list-create" onClick={onCreate}>
            Create demo case
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-window bg-surface shadow-card">
      <table className="w-full whitespace-nowrap text-sm">
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className="px-4 py-3 text-left text-[13px] font-medium text-ink-2">
              Case
            </th>
            <th scope="col" className="px-4 py-3 text-left text-[13px] font-medium text-ink-2">
              Scenario
            </th>
            <th scope="col" className="px-4 py-3 text-left text-[13px] font-medium text-ink-2">
              Status
            </th>
            <th scope="col" className="px-4 py-3 text-left text-[13px] font-medium text-ink-2">
              Reviewer outcome
            </th>
            <th scope="col" className="px-4 py-3 text-left text-[13px] font-medium text-ink-2">
              Learning
            </th>
            <th scope="col" className="px-4 py-3 text-left text-[13px] font-medium text-ink-2">
              Created
            </th>
            <th scope="col" className="w-10 px-4 py-3">
              <span className="sr-only">Open case</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {cases.map((c) => (
            <tr
              key={c.caseId}
              data-testid={`case-row-${c.caseId}`}
              className="group cursor-pointer border-b border-line last:border-b-0 hover:bg-hover"
              onClick={() => onOpen(c.caseId)}
            >
              <td className="px-4 py-3.5">
                <a
                  href={`/case/${c.caseId}`}
                  className="flex flex-col gap-0.5 rounded-chip focus-visible:outline-2"
                  onClick={(e) => {
                    e.preventDefault();
                    onOpen(c.caseId);
                  }}
                >
                  <span className="font-medium text-ink">{topicLabel(c.topic)}</span>
                  <span className="font-mono text-xs text-ink-2 tabular-nums">
                    {c.caseId}
                  </span>
                </a>
              </td>
              <td className="px-4 py-3.5 text-ink">{truthModeLabel(c.truthMode)}</td>
              <td className="px-4 py-3.5">
                <CaseStatusPill state={c.state} />
              </td>
              <td className="px-4 py-3.5 text-ink">{reviewerOutcomeLabel(c)}</td>
              <td className="px-4 py-3.5 text-ink-2">{learningStateLabel(c)}</td>
              <td className="px-4 py-3.5 text-ink-2">
                <time
                  dateTime={c.createdAt}
                  title={formatFullTimestamp(c.createdAt)}
                  data-testid={`created-time-${c.caseId}`}
                >
                  {formatRelativeTimestamp(c.createdAt)}
                </time>
              </td>
              <td className="px-4 py-3.5 text-right">
                <ChevronRight
                  aria-hidden="true"
                  className="inline size-4 text-ink-3 group-hover:text-ink-2"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
