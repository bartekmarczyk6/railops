import React from "react";
import { Button } from "@/components/beui/atoms/Button.tsx";
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

const ACTION_TONE: Record<LearningRecord["reviewerAction"], string> = {
  approve: "bg-green-tint text-green",
  reject: "bg-red-tint text-red",
  edit: "bg-accent-tint text-accent-ink",
};

function learningSummary(record: LearningRecord): string {
  if (record.reviewerAction === "approve") {
    return "The reviewer approved the agent's draft as written.";
  }
  if (record.reviewerAction === "reject") {
    return "The reviewer rejected the agent's draft.";
  }
  return "The reviewer edited the agent's draft before it went out.";
}

export function LearningResult({
  record,
  learningSaved,
  reviewed,
  onUndo,
}: LearningResultProps): React.JSX.Element | null {
  if (!record && !reviewed) return null;
  return (
    <section
      data-component="learning-result"
      data-section="learning"
      data-learning-saved={learningSaved ? "true" : "false"}
      aria-label="What the agent learned"
      className="enter-fade-up overflow-hidden rounded-card bg-surface shadow-card"
    >
      <div className="border-b border-line px-4 py-2.5">
        <h2 className="m-0 font-display text-[14px] font-semibold text-ink">
          What the AI Agent learned
        </h2>
      </div>
      <div className="grid gap-2.5 p-4">
        {record ? (
          <>
            <p className="m-0">
              <span
                data-field="action-badge"
                data-action={record.reviewerAction}
                className={`inline-flex h-6 items-center rounded-full px-2.5 text-[12px] font-medium ${ACTION_TONE[record.reviewerAction]}`}
              >
                {ACTION_LABELS[record.reviewerAction]}
              </span>
            </p>
            <p data-field="summary" className="m-0 text-[13px] text-ink">
              {learningSummary(record)}
            </p>
            {record.changedGuidance.length > 0 ? (
              <ul data-field="guidance" className="m-0 grid list-none gap-1 p-0">
                {record.changedGuidance.map((g, i) => (
                  <li key={i} className="flex gap-2 text-[12.5px] text-ink-2">
                    <span aria-hidden className="mt-[7px] size-1 shrink-0 rounded-full bg-line-strong" />
                    {g}
                  </li>
                ))}
              </ul>
            ) : null}
            {onUndo && record.id ? (
              <div>
                <Button
                  variant="secondary"
                  size="sm"
                  data-action="undo-learning"
                  onClick={() => void onUndo(record.id as string)}
                >
                  Undo this learning
                </Button>
              </div>
            ) : null}
          </>
        ) : (
          <p data-field="none" className="m-0 text-[13px] text-ink-3">
            No learning recorded yet for this case.
          </p>
        )}
        {reviewed && !learningSaved && record ? (
          <p
            data-field="learning-warning"
            role="status"
            className="m-0 rounded-control border border-orange/30 bg-orange-tint px-3 py-2 text-[12.5px] font-medium text-orange"
          >
            Hindsight unavailable — this learning was saved locally only and is not yet
            shared with future runs.
          </p>
        ) : null}
        <p data-field="footnote" className="m-0 text-[11.5px] text-ink-3">
          Learning shapes future drafts. It does not change deterministic eligibility or
          approval authority.
        </p>
      </div>
    </section>
  );
}
