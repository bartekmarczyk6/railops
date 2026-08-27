"use client";

import { Button } from "../ui/button.tsx";
import { Skeleton } from "../ui/skeleton.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table.tsx";
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
  onCreate?: () => void;
};

export function CaseList({ cases, onOpen, loading, error, onCreate }: CaseListProps) {
  if (loading) {
    return (
      <div
        role="status"
        aria-live="polite"
        data-testid="case-list-loading"
        className="flex flex-col gap-3"
      >
        <Skeleton className="h-10 w-full rounded-[var(--radius-md)]" />
        <Skeleton className="h-10 w-full rounded-[var(--radius-md)]" />
        <Skeleton className="h-10 w-full rounded-[var(--radius-md)]" />
        <p className="text-sm text-[color:var(--text-muted)]">
          Loading cases.{" "}
          <a
            href="/"
            className="font-bold text-[color:var(--primary)] underline underline-offset-4"
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
        className="flex flex-col items-start gap-3 rounded-[var(--radius-md)] border border-[color:var(--error)] bg-[color:var(--surface-raised)] p-6"
      >
        <p className="text-sm text-[color:var(--error)]">{error}</p>
        <Button variant="outline" render={<a href="/" />}>
          Reload the page
        </Button>
      </div>
    );
  }

  if (cases.length === 0) {
    return (
      <div
        data-testid="case-list-empty"
        className="flex flex-col items-start gap-3 rounded-[var(--radius-md)] border border-dashed border-[color:var(--border)] bg-[color:var(--surface-raised)] p-6"
      >
        <p className="text-sm text-[color:var(--text-muted)]">No cases yet.</p>
        {onCreate ? (
          <Button data-testid="case-list-create" onClick={onCreate}>
            Create demo case
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Case</TableHead>
          <TableHead>Topic</TableHead>
          <TableHead>Truth mode</TableHead>
          <TableHead>Pipeline status</TableHead>
          <TableHead>Reviewer outcome</TableHead>
          <TableHead>Learning</TableHead>
          <TableHead>Created</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {cases.map((c) => (
          <TableRow
            key={c.caseId}
            data-testid={`case-row-${c.caseId}`}
            className="cursor-pointer"
            onClick={() => onOpen(c.caseId)}
          >
            <TableCell>
              <a
                href={`/case/${c.caseId}`}
                className="font-bold text-[color:var(--primary)] underline underline-offset-4"
                onClick={(e) => {
                  e.preventDefault();
                  onOpen(c.caseId);
                }}
              >
                {c.caseId}
              </a>
            </TableCell>
            <TableCell>{topicLabel(c.topic)}</TableCell>
            <TableCell>{truthModeLabel(c.truthMode)}</TableCell>
            <TableCell>
              <CaseStatusPill state={c.state} />
            </TableCell>
            <TableCell>{reviewerOutcomeLabel(c)}</TableCell>
            <TableCell>{learningStateLabel(c)}</TableCell>
            <TableCell>
              <time dateTime={c.createdAt} data-testid={`created-time-${c.caseId}`}>
                {formatCreatedAt(c.createdAt)}
              </time>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
