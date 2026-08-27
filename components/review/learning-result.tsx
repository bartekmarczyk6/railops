import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardPanel, CardTitle } from "@/components/ui/card";
import type { LearningRecord } from "@/lib/memory/types.ts";

export type LearningResultProps = {
  record: LearningRecord | null;
  learningSaved: boolean;
  reviewed: boolean;
  onUndo?: (learningId: string) => void | Promise<void>;
};

const ACTION_LABELS: Record<LearningRecord["reviewerAction"], string> = {
  approve: "Approved",
  reject: "Rejected",
  edit: "Edited",
};

const ACTION_BADGE: Record<LearningRecord["reviewerAction"], "success" | "error" | "info"> = {
  approve: "success",
  reject: "error",
  edit: "info",
};

function learningSummary(record: LearningRecord): string {
  if (record.reviewerAction === "approve") {
    return `The reviewer approved the agent's draft (${record.finalDraftSummary}).`;
  }
  if (record.reviewerAction === "reject") {
    const guidance = record.changedGuidance[0] ?? "the draft did not meet policy";
    return `The reviewer rejected the draft: ${guidance}.`;
  }
  return `The reviewer edited the draft: ${record.originalDraftSummary} became ${record.finalDraftSummary}.`;
}

export function LearningResult({
  record,
  learningSaved,
  reviewed,
  onUndo,
}: LearningResultProps): React.JSX.Element {
  return (
    <Card
      data-component="learning-result"
      data-section="learning"
      data-learning-saved={learningSaved ? "true" : "false"}
    >
      <CardHeader>
        <CardTitle>What the AI Agent learned</CardTitle>
      </CardHeader>
      <CardPanel className="grid gap-2">
        {record ? (
          <>
            <p className="m-0">
              <Badge
                variant={ACTION_BADGE[record.reviewerAction]}
                data-field="action-badge"
                data-action={record.reviewerAction}
              >
                {ACTION_LABELS[record.reviewerAction]}
              </Badge>
            </p>
            <p data-field="summary" className="m-0">
              {learningSummary(record)}
            </p>
            {record.changedGuidance.length > 0 ? (
              <ul data-field="guidance" className="m-0 ps-4">
                {record.changedGuidance.map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ul>
            ) : null}
            {onUndo && record.id ? (
              <div>
                <Button
                  variant="outline"
                  data-action="undo-learning"
                  onClick={() => void onUndo(record.id as string)}
                >
                  Undo this learning
                </Button>
              </div>
            ) : null}
          </>
        ) : (
          <p data-field="none" className="m-0">
            No learning recorded yet for this case.
          </p>
        )}
        {reviewed && !learningSaved && record ? (
          <p
            data-field="learning-warning"
            role="status"
            className="m-0"
            style={{ color: "var(--error)" }}
          >
            Hindsight unavailable — this learning was saved locally only and is not yet
            shared with future runs.
          </p>
        ) : null}
        <p data-field="footnote" className="m-0 text-xs" style={{ color: "var(--text-muted)" }}>
          Learning shapes future drafts. It does not change deterministic eligibility or
          approval authority.
        </p>
      </CardPanel>
    </Card>
  );
}
