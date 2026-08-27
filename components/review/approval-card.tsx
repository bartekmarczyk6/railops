"use client";

import React from "react";
import { useState } from "react";
import type { CaseState } from "@/lib/storage/types.ts";
import type { DecisionDraft } from "@/lib/llm/types.ts";
import {
  buildReviewInput,
  emptyFormState,
  type ReviewFormState,
} from "@/lib/review-form.ts";
import type { ReviewInput } from "@/lib/pipeline/review.ts";

export type ApprovalCardProps = {
  state: CaseState;
  caseId: string;
  version: number;
  decision: DecisionDraft;
  onAction: (input: ReviewInput) => Promise<void>;
  lastError?: string | null;
};

const REVIEWABLE: ReadonlySet<CaseState> = new Set<CaseState>([
  "reviewable",
  "revising",
]);

function errorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  if (code === "feedback_required") return "Feedback is required to reject this case.";
  if (code === "edited_draft_required") return "An edited draft is required to save changes.";
  if (code === "max_revisions_reached") return "One revision per case — further edits are blocked.";
  if (code === "version_mismatch") return "The case changed while you were editing. Refresh and retry.";
  if (code === "invalid_state") return "The case is no longer reviewable.";
  return `Review action failed: ${code}`;
}

export function ApprovalCard({
  state,
  caseId,
  version,
  decision,
  onAction,
  lastError,
}: ApprovalCardProps): React.JSX.Element {
  const isReviewable = REVIEWABLE.has(state);
  const disabled = !isReviewable;
  const [form, setForm] = useState<ReviewFormState>(emptyFormState(decision));
  const [dialog, setDialog] = useState<null | "reject" | "edit">(null);
  const [pending, setPending] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleAction(action: "approve" | "reject" | "edit"): Promise<void> {
    setLocalError(null);
    if (action === "approve" && isReviewable) {
      const result = buildReviewInput({
        action: "approve",
        caseId,
        version,
        form,
        baseDraft: decision,
      });
      if (!result.ok) {
        setLocalError(result.error);
        return;
      }
      setPending(true);
      try {
        await onAction(result.value);
      } finally {
        setPending(false);
      }
      return;
    }
    if (action === "reject") {
      if (dialog !== "reject") {
        setDialog("reject");
        return;
      }
      const result = buildReviewInput({
        action: "reject",
        caseId,
        version,
        form,
        baseDraft: decision,
      });
      if (!result.ok) {
        setLocalError(result.error);
        return;
      }
      setPending(true);
      try {
        await onAction(result.value);
      } finally {
        setPending(false);
      }
      return;
    }
    if (action === "edit") {
      if (dialog !== "edit") {
        setDialog("edit");
        return;
      }
      const result = buildReviewInput({
        action: "edit",
        caseId,
        version,
        form,
        baseDraft: decision,
      });
      if (!result.ok) {
        setLocalError(result.error);
        return;
      }
      setPending(true);
      try {
        await onAction(result.value);
      } finally {
        setPending(false);
      }
    }
  }

  const errMsg = errorMessage(localError ?? lastError ?? null);
  return (
    <section
      data-component="approval-card"
      data-state={state}
      data-disabled={disabled ? "true" : "false"}
      style={{
        display: "grid",
        gap: "var(--space-3)",
        padding: "var(--space-4)",
        background: "var(--surface-raised)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
      }}
    >
      <h2 style={{ margin: 0 }}>Reviewer actions</h2>
      <p data-field="state-readout" style={{ margin: 0, color: "var(--text-muted)" }}>
        Current state: <strong>{state}</strong>
        {disabled ? " — approval actions are disabled until the case is reviewable." : ""}
      </p>
      <div role="group" aria-label="Reviewer actions" style={{ display: "flex", gap: "var(--space-2)" }}>
        <button
          type="button"
          data-action="approve"
          disabled={disabled || pending}
          onClick={() => handleAction("approve")}
          style={primaryButtonStyle}
        >
          Approve
        </button>
        <button
          type="button"
          data-action="reject"
          disabled={disabled || pending}
          onClick={() => handleAction("reject")}
          style={secondaryButtonStyle}
        >
          Reject
        </button>
        <button
          type="button"
          data-action="edit"
          disabled={disabled || pending}
          onClick={() => handleAction("edit")}
          style={secondaryButtonStyle}
        >
          Edit draft
        </button>
      </div>
      {errMsg ? (
        <p data-field="error" role="alert" style={{ margin: 0, color: "var(--error)" }}>
          {errMsg}
        </p>
      ) : null}
      {dialog === "reject" ? (
        <RejectDialog
          onCancel={() => setDialog(null)}
          onSubmit={async () => {
            await handleAction("reject");
            setDialog(null);
          }}
          feedback={form.feedback}
          onFeedback={(v) => setForm((f) => ({ ...f, feedback: v }))}
        />
      ) : null}
      {dialog === "edit" ? (
        <EditSummary
          onCancel={() => setDialog(null)}
          onSubmit={async () => {
            await handleAction("edit");
            setDialog(null);
          }}
          edited={form.editedDraft ?? decision}
          base={decision}
        />
      ) : null}
    </section>
  );
}

type RejectDialogProps = {
  onCancel: () => void;
  onSubmit: () => Promise<void> | void;
  feedback: string;
  onFeedback: (v: string) => void;
};

function RejectDialog({ onCancel, onSubmit, feedback, onFeedback }: RejectDialogProps): React.JSX.Element {
  const canSubmit = feedback.trim().length > 0;
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="Confirm rejection"
      data-component="reject-dialog"
      style={{
        display: "grid",
        gap: "var(--space-3)",
        padding: "var(--space-3)",
        background: "var(--surface-sunken)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
      }}
    >
      <p style={{ margin: 0 }}>
        Rejecting this case stores a Hindsight learning record. Feedback is required.
      </p>
      <label style={{ display: "grid", gap: "var(--space-1)" }}>
        <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Feedback</span>
        <textarea
          data-field="reject-feedback"
          value={feedback}
          onChange={(e) => onFeedback(e.target.value)}
          rows={4}
          style={{
            padding: "var(--space-2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            minHeight: "44px",
            fontFamily: "Lato, system-ui, sans-serif",
          }}
        />
      </label>
      <div style={{ display: "flex", gap: "var(--space-2)" }}>
        <button
          type="button"
          data-action="confirm-reject"
          onClick={() => void onSubmit()}
          disabled={!canSubmit}
          style={dangerButtonStyle}
        >
          Confirm reject
        </button>
        <button type="button" data-action="cancel-reject" onClick={onCancel} style={secondaryButtonStyle}>
          Cancel
        </button>
      </div>
    </div>
  );
}

type EditSummaryProps = {
  onCancel: () => void;
  onSubmit: () => Promise<void> | void;
  edited: DecisionDraft;
  base: DecisionDraft;
};

function EditSummary({ onCancel, onSubmit, edited, base }: EditSummaryProps): React.JSX.Element {
  const changed =
    edited.outcome !== base.outcome ||
    (edited.proposedAmount ?? null) !== (base.proposedAmount ?? null) ||
    edited.response !== base.response;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Confirm edit"
      data-component="edit-dialog"
      style={{
        display: "grid",
        gap: "var(--space-3)",
        padding: "var(--space-3)",
        background: "var(--surface-sunken)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
      }}
    >
      <p style={{ margin: 0 }}>
        Save the edited draft. The case moves to <strong>revising</strong> and you cannot edit again.
      </p>
      <p data-field="edit-changed" data-changed={changed ? "true" : "false"} style={{ margin: 0 }}>
        {changed ? "Differences detected." : "No differences from the proposed draft."}
      </p>
      <div style={{ display: "flex", gap: "var(--space-2)" }}>
        <button
          type="button"
          data-action="confirm-edit"
          onClick={() => void onSubmit()}
          disabled={!changed}
          style={primaryButtonStyle}
        >
          Save edit
        </button>
        <button type="button" data-action="cancel-edit" onClick={onCancel} style={secondaryButtonStyle}>
          Cancel
        </button>
      </div>
    </div>
  );
}

const primaryButtonStyle: React.CSSProperties = {
  minHeight: "44px",
  padding: "var(--space-2) var(--space-3)",
  background: "var(--primary)",
  color: "var(--text-2)",
  border: "1px solid var(--primary)",
  borderRadius: "var(--radius-sm)",
  cursor: "pointer",
};
const secondaryButtonStyle: React.CSSProperties = {
  minHeight: "44px",
  padding: "var(--space-2) var(--space-3)",
  background: "var(--surface-raised)",
  color: "var(--text)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  cursor: "pointer",
};
const dangerButtonStyle: React.CSSProperties = {
  minHeight: "44px",
  padding: "var(--space-2) var(--space-3)",
  background: "var(--error)",
  color: "var(--text-2)",
  border: "1px solid var(--error)",
  borderRadius: "var(--radius-sm)",
  cursor: "pointer",
};
