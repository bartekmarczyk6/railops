import React from "react";
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
    <section
      data-component="learning-result"
      data-section="learning"
      data-learning-saved={learningSaved ? "true" : "false"}
      style={{
        display: "grid",
        gap: "var(--space-2)",
        padding: "var(--space-4)",
        background: "var(--surface-raised)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
      }}
    >
      <h2 style={{ margin: 0 }}>What the AI Agent learned</h2>
      {record ? (
        <>
          <p style={{ margin: 0 }}>
            <span
              data-field="action-badge"
              data-action={record.reviewerAction}
              style={{
                display: "inline-block",
                padding: "2px var(--space-2)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                fontSize: "12px",
                color: "var(--text-muted)",
              }}
            >
              {ACTION_LABELS[record.reviewerAction]}
            </span>
          </p>
          <p data-field="summary" style={{ margin: 0 }}>
            {learningSummary(record)}
          </p>
          {record.changedGuidance.length > 0 ? (
            <ul data-field="guidance" style={{ margin: 0, paddingLeft: "var(--space-4)" }}>
              {record.changedGuidance.map((g, i) => (
                <li key={i}>{g}</li>
              ))}
            </ul>
          ) : null}
          {onUndo && record.id ? (
            <button
              type="button"
              data-action="undo-learning"
              onClick={() => void onUndo(record.id as string)}
              style={{
                justifySelf: "start",
                minHeight: "44px",
                padding: "var(--space-2) var(--space-3)",
                background: "var(--surface-raised)",
                color: "var(--text)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
              }}
            >
              Undo this learning
            </button>
          ) : null}
        </>
      ) : (
        <p data-field="none" style={{ margin: 0 }}>
          No learning recorded yet for this case.
        </p>
      )}
      {reviewed && !learningSaved && record ? (
        <p
          data-field="learning-warning"
          role="status"
          style={{ margin: 0, color: "var(--error)" }}
        >
          Hindsight unavailable — this learning was saved locally only and is not yet
          shared with future runs.
        </p>
      ) : null}
      <p
        data-field="footnote"
        style={{ margin: 0, fontSize: "12px", color: "var(--text-muted)" }}
      >
        Learning shapes future drafts. It does not change deterministic eligibility or
        approval authority.
      </p>
    </section>
  );
}
