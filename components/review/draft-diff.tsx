import React from "react";
import type { DecisionDraft } from "@/lib/llm/types.ts";
import { outcomeLabel } from "./formatters.ts";

export type DraftDiffProps = {
  base: DecisionDraft;
  edited: DecisionDraft;
};

type Field = { label: string; before: string; after: string };

function displayAmount(amount: number | null): string {
  return amount === null ? "—" : String(amount);
}

function fields(base: DecisionDraft, edited: DecisionDraft): Field[] {
  const out: Field[] = [];
  if (base.outcome !== edited.outcome) {
    out.push({
      label: "Outcome",
      before: outcomeLabel(base.outcome),
      after: outcomeLabel(edited.outcome),
    });
  }
  if ((base.proposedAmount ?? null) !== (edited.proposedAmount ?? null)) {
    out.push({
      label: "Proposed amount",
      before: displayAmount(base.proposedAmount),
      after: displayAmount(edited.proposedAmount),
    });
  }
  if (base.response !== edited.response) {
    out.push({ label: "Response", before: base.response, after: edited.response });
  }
  return out;
}

export function draftDiffFields(base: DecisionDraft, edited: DecisionDraft): Field[] {
  return fields(base, edited);
}

export function DraftDiff({ base, edited }: DraftDiffProps): React.JSX.Element {
  const diffs = fields(base, edited);
  if (diffs.length === 0) {
    return (
      <div data-component="draft-diff" data-empty="true">
        <p className="m-0 text-[12.5px] text-ink-3">No changes yet.</p>
      </div>
    );
  }
  return (
    <div data-component="draft-diff" data-empty="false" className="grid gap-3">
      {diffs.map((d) => (
        <div key={d.label} data-field="diff-row" data-label={d.label} className="grid gap-1.5">
          <span className="text-[11px] font-semibold tracking-wide text-ink-3 uppercase">
            {d.label}
          </span>
          <div className="grid gap-1.5 sm:grid-cols-2">
            <div
              data-field="before"
              className="rounded-control border-l-2 border-red bg-red-tint/40 px-2.5 py-1.5 text-[12.5px] whitespace-pre-wrap text-ink-2"
            >
              <span className="mb-0.5 block text-[10.5px] font-semibold text-red">Was</span>
              {d.before}
            </div>
            <div
              data-field="after"
              className="rounded-control border-l-2 border-green bg-green-tint/40 px-2.5 py-1.5 text-[12.5px] whitespace-pre-wrap text-ink-2"
            >
              <span className="mb-0.5 block text-[10.5px] font-semibold text-green">Now</span>
              {d.after}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
