import type { ReviewInput } from "./pipeline/review.ts";
import type { DecisionDraft } from "./llm/types.ts";

export type ReviewFormState = {
  feedback: string;
  editedDraft: DecisionDraft | null;
};

export type BuildReviewInputArgs = {
  action: "approve" | "reject" | "edit";
  caseId: string;
  version: number;
  form: ReviewFormState;
  baseDraft: DecisionDraft;
};

export type BuildReviewInputResult =
  | { ok: true; value: ReviewInput }
  | { ok: false; error: "feedback_required" | "edited_draft_required" };

const DECISION_OUTCOMES: ReadonlySet<DecisionDraft["outcome"]> = new Set<DecisionDraft["outcome"]>([
  "refund",
  "change",
  "follow_up",
  "unsupported_or_escalate",
  "information",
]);

export function isValidDecisionDraft(value: unknown): value is DecisionDraft {
  if (value === null || typeof value !== "object") return false;
  const d = value as Record<string, unknown>;
  if (typeof d.outcome !== "string" || !DECISION_OUTCOMES.has(d.outcome as DecisionDraft["outcome"])) {
    return false;
  }
  if (d.proposedAmount !== null && typeof d.proposedAmount !== "number") return false;
  if (!Array.isArray(d.decisionBasis)) return false;
  if (typeof d.response !== "string") return false;
  if (!Array.isArray(d.evidenceRefs)) return false;
  return true;
}

export function buildReviewInput(args: BuildReviewInputArgs): BuildReviewInputResult {
  const { action, caseId, version, form } = args;
  if (action === "reject") {
    if (!form.feedback || form.feedback.trim().length === 0) {
      return { ok: false, error: "feedback_required" };
    }
    return {
      ok: true,
      value: {
        action,
        caseId,
        expectedVersion: version,
        feedback: form.feedback,
      },
    };
  }
  if (action === "edit") {
    if (!isValidDecisionDraft(form.editedDraft)) {
      return { ok: false, error: "edited_draft_required" };
    }
    return {
      ok: true,
      value: {
        action,
        caseId,
        expectedVersion: version,
        feedback: form.feedback.trim().length > 0 ? form.feedback : undefined,
        editedDraft: form.editedDraft,
      },
    };
  }
  return {
    ok: true,
    value: {
      action: "approve",
      caseId,
      expectedVersion: version,
    },
  };
}

export function emptyFormState(baseDraft: DecisionDraft): ReviewFormState {
  return { feedback: "", editedDraft: { ...baseDraft } };
}
