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

const STATE_ICONS: Record<CaseState, string> = {
  created: "dot",
  running: "spinner",
  reviewable: "check",
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

export type CaseStatusPillProps = {
  state: CaseState;
};

export function CaseStatusPill({ state }: CaseStatusPillProps) {
  const label = STATE_LABELS[state];
  const icon = STATE_ICONS[state];
  return (
    <span
      role="status"
      aria-label={STATE_ARIA[state]}
      data-testid="case-status-pill"
      className={
        "inline-flex items-center gap-2 rounded-[var(--radius-lg)] " +
        "border border-[color:var(--border)] bg-[color:var(--surface-raised)] " +
        "px-3 py-1 text-sm text-[color:var(--text)]"
      }
    >
      <StatusIcon name={icon} />
      <span>{label}</span>
    </span>
  );
}

function StatusIcon({ name }: { name: string }) {
  const common = {
    width: 14,
    height: 14,
    viewBox: "0 0 14 14",
    "aria-hidden": true,
  } as const;
  if (name === "check") {
    return (
      <svg data-icon="check" {...common}>
        <path d="M2 7l3 3 7-7" stroke="currentColor" strokeWidth="2" fill="none" />
      </svg>
    );
  }
  if (name === "x") {
    return (
      <svg data-icon="x" {...common}>
        <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="2" fill="none" />
      </svg>
    );
  }
  if (name === "alert") {
    return (
      <svg data-icon="alert" {...common}>
        <path d="M7 1l6 12H1z" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <path d="M7 5v4" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="7" cy="11" r="0.8" fill="currentColor" />
      </svg>
    );
  }
  if (name === "edit") {
    return (
      <svg data-icon="edit" {...common}>
        <path d="M2 10l8-8 2 2-8 8H2z" stroke="currentColor" strokeWidth="1.5" fill="none" />
      </svg>
    );
  }
  if (name === "book") {
    return (
      <svg data-icon="book" {...common}>
        <path d="M2 2h5a3 3 0 0 1 3 3v7H4a2 2 0 0 1-2-2z" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <path d="M12 2H7a3 3 0 0 0-3 3v7h6a2 2 0 0 0 2-2z" stroke="currentColor" strokeWidth="1.5" fill="none" />
      </svg>
    );
  }
  if (name === "spinner") {
    return (
      <svg data-icon="spinner" {...common} className="motion-safe:animate-spin">
        <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeDasharray="20 8" />
      </svg>
    );
  }
  return (
    <svg data-icon="dot" {...common}>
      <circle cx="7" cy="7" r="3" fill="currentColor" />
    </svg>
  );
}
