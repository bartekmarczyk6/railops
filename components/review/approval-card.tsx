"use client";

import React from "react";
import { useRef, useState } from "react";
import { CircleCheck, CircleX } from "lucide-react";
import { Button } from "@/components/beui/atoms/Button.tsx";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button as UIButton } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import type { CaseState } from "@/lib/storage/types.ts";
import type { DecisionDraft } from "@/lib/llm/types.ts";
import type { ReviewFormState } from "@/lib/review-form.ts";
import { DraftDiff, draftDiffFields } from "./draft-diff.tsx";

export type ApprovalCardProps = {
  state: CaseState;
  decision: DecisionDraft;
  form: ReviewFormState;
  onFormChange: (next: ReviewFormState) => void;
  editing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => Promise<boolean> | boolean;
  onApprove: () => Promise<boolean> | boolean;
  onReject: () => Promise<boolean> | boolean;
  onRetry?: () => void;
  pending: boolean;
  lastError?: string | null;
};

const REVIEWABLE: ReadonlySet<CaseState> = new Set<CaseState>(["reviewable", "revising"]);

function errorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  if (code === "feedback_required") return "Feedback is required to reject this case.";
  if (code === "edited_draft_required") return "An edited draft is required to save changes.";
  if (code === "max_revisions_reached") return "One revision per case — further edits are blocked.";
  if (code === "version_mismatch") return "The case changed while you were editing. Refresh and retry.";
  if (code === "invalid_state") return "The case is no longer reviewable.";
  return `Review action failed: ${code}`;
}

function stateReadout(state: CaseState): string {
  switch (state) {
    case "reviewable":
      return "The draft is ready. Approve it, request changes, or reject it with feedback.";
    case "revising":
      return "This is the revised draft. Approve or reject — one revision per case, so editing is locked.";
    case "approved":
      return "You approved this draft.";
    case "rejected":
      return "You rejected this draft.";
    case "escalated":
      return "The agent's self-review flagged problems it could not fix, so the case was escalated to you instead of guessing. Run the agent again to retry, or handle it manually.";
    case "learning_saved":
      return "Review complete — the learning was saved.";
    case "error":
      return "The agent run failed. You can run the agent again to retry.";
    default:
      return "Approval unlocks once the agent finishes and the case is reviewable.";
  }
}

export type RejectDialogBodyProps = {
  feedback: string;
  onFeedback: (value: string) => void;
  onConfirm: () => void;
  busy: boolean;
};

export function RejectDialogBody({
  feedback,
  onFeedback,
  onConfirm,
  busy,
}: RejectDialogBodyProps): React.JSX.Element {
  const canSubmit = feedback.trim().length > 0 && !busy;
  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>Confirm rejection</AlertDialogTitle>
        <AlertDialogDescription>
          Rejecting this case stores a Hindsight learning record. Feedback is required.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <div className="grid gap-2 px-6">
        <Field>
          <FieldLabel htmlFor="reject-feedback">Feedback</FieldLabel>
          <Textarea
            id="reject-feedback"
            data-field="reject-feedback"
            value={feedback}
            onChange={(e) => onFeedback(e.currentTarget.value)}
            rows={4}
          />
        </Field>
      </div>
      <AlertDialogFooter>
        <AlertDialogClose render={<UIButton variant="outline" />} data-action="cancel-reject">
          Cancel
        </AlertDialogClose>
        <UIButton
          variant="destructive"
          data-action="confirm-reject"
          disabled={!canSubmit}
          onClick={onConfirm}
        >
          Confirm reject
        </UIButton>
      </AlertDialogFooter>
    </>
  );
}

function useStickyFlip(flag: boolean): boolean {
  const ref = useRef({ prev: flag, hit: false });
  if (flag && !ref.current.prev) ref.current.hit = true;
  ref.current.prev = flag;
  return ref.current.hit;
}

export function ApprovalCard({
  state,
  decision,
  form,
  onFormChange,
  editing,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onApprove,
  onReject,
  onRetry,
  pending,
  lastError,
}: ApprovalCardProps): React.JSX.Element {
  const isReviewable = REVIEWABLE.has(state);
  const disabled = !isReviewable;
  const [rejectOpen, setRejectOpen] = useState(false);
  const errMsg = errorMessage(lastError ?? null);
  const edited = form.editedDraft ?? decision;
  const changed = draftDiffFields(decision, edited).length > 0;
  const unlocked = useStickyFlip(isReviewable);
  const approvedFlip = useStickyFlip(state === "approved");
  const rejectedFlip = useStickyFlip(state === "rejected");

  return (
    <section
      data-component="approval-card"
      data-state={state}
      data-disabled={disabled ? "true" : "false"}
      aria-label="Your decision"
    >
      <div className="overflow-hidden rounded-card bg-surface shadow-card">
        <div className="border-b border-line px-4 py-2.5">
          <h2 className="m-0 font-display text-[14px] font-semibold text-ink">Your decision</h2>
        </div>
        <div className="grid gap-3 p-4">
          <p data-field="state-readout" className="m-0 text-[13px] text-ink-2">
            {stateReadout(state)}
          </p>
          {isReviewable ? (
            <div
              role="group"
              aria-label="Reviewer actions"
              className={`flex flex-wrap items-center gap-2${unlocked ? " enter-fade-up" : ""}`}
            >
              <Button
                variant="accent"
                data-action="approve"
                disabled={pending}
                onClick={() => void onApprove()}
              >
                {pending ? "Saving…" : "Approve"}
              </Button>
              {state !== "revising" ? (
                <Button
                  variant="secondary"
                  data-action="edit"
                  disabled={pending || editing}
                  onClick={onStartEdit}
                >
                  Request changes
                </Button>
              ) : null}
              <Button
                variant="ghost"
                data-action="reject"
                disabled={pending}
                onClick={() => setRejectOpen(true)}
              >
                Reject
              </Button>
            </div>
          ) : state === "approved" ? (
            <p
              className={`m-0 inline-flex items-center gap-2 text-[13px] font-medium text-green${
                approvedFlip ? " enter-fade-up" : ""
              }`}
            >
              <CircleCheck className={`size-4${approvedFlip ? " enter-pop" : ""}`} /> Draft approved
            </p>
          ) : state === "rejected" ? (
            <p
              className={`m-0 inline-flex items-center gap-2 text-[13px] font-medium text-red${
                rejectedFlip ? " enter-fade-up" : ""
              }`}
            >
              <CircleX className={`size-4${rejectedFlip ? " enter-pop" : ""}`} /> Draft rejected
            </p>
          ) : state === "escalated" || state === "error" ? (
            <div role="group" aria-label="Reviewer actions" className="flex flex-wrap items-center gap-2">
              {onRetry ? (
                <Button variant="accent" data-action="retry" disabled={pending} onClick={onRetry}>
                  {pending ? "Running…" : "Run the agent again"}
                </Button>
              ) : null}
            </div>
          ) : (
            <div role="group" aria-label="Reviewer actions" className="flex flex-wrap items-center gap-2">
              <Button variant="accent" data-action="approve" disabled>
                Approve
              </Button>
              <Button variant="secondary" data-action="edit" disabled>
                Request changes
              </Button>
              <Button variant="ghost" data-action="reject" disabled>
                Reject
              </Button>
            </div>
          )}
          {editing && isReviewable && state !== "revising" ? (
            <div
              data-component="edit-surface"
              className="enter-fade-up grid gap-3 rounded-control border border-line bg-inset/50 p-3"
            >
              <p className="m-0 text-[12.5px] text-ink-2">
                Saving moves the case to <strong>revising</strong> — you cannot edit again.
              </p>
              <DraftDiff base={decision} edited={edited} />
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="accent"
                  data-action="save-edit"
                  disabled={!changed || pending}
                  onClick={() => void onSaveEdit()}
                >
                  Save changes
                </Button>
                <Button variant="secondary" data-action="cancel-edit" onClick={onCancelEdit}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}
          {errMsg ? (
            <p
              data-field="error"
              role="alert"
              className="m-0 rounded-control border border-red/30 bg-red-tint px-3 py-2 text-[12.5px] font-medium text-red"
            >
              {errMsg}
            </p>
          ) : null}
        </div>
      </div>
      <AlertDialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <AlertDialogPopup>
          <RejectDialogBody
            feedback={form.feedback}
            onFeedback={(v) => onFormChange({ ...form, feedback: v })}
            busy={pending}
            onConfirm={() => {
              void (async () => {
                const ok = await onReject();
                if (ok) setRejectOpen(false);
              })();
            }}
          />
        </AlertDialogPopup>
      </AlertDialog>
    </section>
  );
}
