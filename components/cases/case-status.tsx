import {
  BookOpen,
  Check,
  Circle,
  Inbox,
  LoaderCircle,
  PenLine,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";

import type { CaseState } from "../../lib/storage/types.ts";

const STATE_LABELS: Record<CaseState, string> = {
  created: "Created",
  running: "Running",
  reviewable: "Reviewable",
  approved: "Approved",
  rejected: "Rejected",
  escalated: "Escalated",
  revising: "Revising",
  learning_saved: "Learning saved",
  error: "Error",
};

const STATE_ICONS: Record<CaseState, LucideIcon> = {
  created: Circle,
  running: LoaderCircle,
  reviewable: Inbox,
  approved: Check,
  rejected: X,
  escalated: TriangleAlert,
  revising: PenLine,
  learning_saved: BookOpen,
  error: TriangleAlert,
};

const STATE_ICON_NAMES: Record<CaseState, string> = {
  created: "dot",
  running: "spinner",
  reviewable: "inbox",
  approved: "check",
  rejected: "x",
  escalated: "alert",
  revising: "edit",
  learning_saved: "book",
  error: "alert",
};

const STATE_ARIA: Record<CaseState, string> = {
  created: "Case has been created but the pipeline has not started",
  running: "Case pipeline is running",
  reviewable: "Case is ready for review",
  approved: "Reviewer approved this case",
  rejected: "Reviewer rejected this case",
  escalated: "Case was escalated",
  revising: "Case is being revised after reviewer edit",
  learning_saved: "Reviewer learning has been saved",
  error: "Case pipeline encountered an error",
};

const ALERT_STATES: ReadonlySet<CaseState> = new Set(["escalated", "error"]);

export type CaseStatusPillProps = {
  state: CaseState;
};

export function CaseStatusPill({ state }: CaseStatusPillProps) {
  const Icon = STATE_ICONS[state];
  return (
    <span
      role="status"
      aria-label={STATE_ARIA[state]}
      data-testid="case-status-pill"
      data-state={state}
      className={
        "inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] " +
        "bg-[color:var(--surface-raised)] px-3 py-1 text-sm " +
        (ALERT_STATES.has(state)
          ? "text-[color:var(--error)]"
          : "text-[color:var(--text)]")
      }
    >
      <Icon
        data-icon={STATE_ICON_NAMES[state]}
        aria-hidden="true"
        className={
          "size-3.5 shrink-0" + (state === "running" ? " motion-safe:animate-spin" : "")
        }
      />
      <span>{STATE_LABELS[state]}</span>
    </span>
  );
}
