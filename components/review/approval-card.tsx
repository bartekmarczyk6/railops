"use client";

import React from "react";
import { useState } from "react";
import { ApprovalCard as BeuiApprovalCard } from "@/components/agents/approval-card";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from "@/components/ui/card";
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
        <AlertDialogClose render={<Button variant="outline" />} data-action="cancel-reject">
          Cancel
        </AlertDialogClose>
        <Button
          variant="destructive"
          data-action="confirm-reject"
          disabled={!canSubmit}
          onClick={onConfirm}
        >
          Confirm reject
        </Button>
      </AlertDialogFooter>
    </>
  );
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
  pending,
  lastError,
}: ApprovalCardProps): React.JSX.Element {
  const isReviewable = REVIEWABLE.has(state);
  const disabled = !isReviewable;
  const [rejectOpen, setRejectOpen] = useState(false);
  const errMsg = errorMessage(lastError ?? null);
  const edited = form.editedDraft ?? decision;
  const changed = draftDiffFields(decision, edited).length > 0;

  return (
    <section
      data-component="approval-card"
      data-state={state}
      data-disabled={disabled ? "true" : "false"}
    >
      <Card>
        <CardHeader>
          <CardTitle>Reviewer actions</CardTitle>
          <CardDescription data-field="state-readout">
            Current state: <strong>{state}</strong>
            {disabled ? " — approval actions are disabled until the case is reviewable." : ""}
          </CardDescription>
        </CardHeader>
        <CardPanel className="grid gap-3">
          {isReviewable ? (
            <BeuiApprovalCard
              title="Reviewer decision"
              description={
                state === "revising"
                  ? "Revised draft. Approve or reject — one revision per case, editing is now locked."
                  : "Approve the draft, request changes (edit), or reject with feedback."
              }
              status={pending ? "submitting" : "pending"}
              onApprove={() => void onApprove()}
              onReject={() => setRejectOpen(true)}
              onRequestChanges={state === "revising" ? undefined : onStartEdit}
              approveLabel="Approve"
            />
          ) : state === "approved" ? (
            <BeuiApprovalCard
              title="Reviewer decision"
              status="approved"
              result="The draft was approved."
            />
          ) : state === "rejected" ? (
            <BeuiApprovalCard
              title="Reviewer decision"
              status="rejected"
              result="The draft was rejected."
            />
          ) : (
            <div role="group" aria-label="Reviewer actions" className="flex flex-wrap gap-2">
              <Button data-action="approve" disabled>
                Approve
              </Button>
              <Button data-action="reject" variant="outline" disabled>
                Reject
              </Button>
              <Button data-action="edit" variant="outline" disabled>
                Edit draft
              </Button>
            </div>
          )}
          {editing && isReviewable && state !== "revising" ? (
            <div data-component="edit-surface" className="grid gap-3 rounded-xl border p-3">
              <p className="m-0">
                Save the edited draft. The case moves to <strong>revising</strong> and you
                cannot edit again.
              </p>
              <DraftDiff base={decision} edited={edited} />
              <div className="flex flex-wrap gap-2">
                <Button
                  data-action="save-edit"
                  disabled={!changed || pending}
                  onClick={() => void onSaveEdit()}
                >
                  Save edit
                </Button>
                <Button data-action="cancel-edit" variant="outline" onClick={onCancelEdit}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}
          {errMsg ? (
            <Alert variant="error" data-field="error">
              <AlertTitle>Review action failed</AlertTitle>
              <AlertDescription>{errMsg}</AlertDescription>
            </Alert>
          ) : null}
        </CardPanel>
      </Card>
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
