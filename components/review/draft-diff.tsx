import React from "react";
import type { DecisionDraft } from "@/lib/llm/types.ts";

export type DraftDiffProps = {
  base: DecisionDraft;
  edited: DecisionDraft;
};

type Field = { label: string; before: string; after: string };

function fields(base: DecisionDraft, edited: DecisionDraft): Field[] {
  const out: Field[] = [];
  if (base.outcome !== edited.outcome) {
    out.push({ label: "Outcome", before: base.outcome, after: edited.outcome });
  }
  if ((base.proposedAmount ?? null) !== (edited.proposedAmount ?? null)) {
    out.push({
      label: "Proposed amount",
      before: base.proposedAmount === null ? "null" : String(base.proposedAmount),
      after: edited.proposedAmount === null ? "null" : String(edited.proposedAmount),
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
        <p className="m-0">No differences yet.</p>
      </div>
    );
  }
  return (
    <div data-component="draft-diff" data-empty="false">
      <ul className="m-0 grid list-none gap-2 p-0">
        {diffs.map((d) => (
          <li key={d.label} data-field="diff-row" data-label={d.label} className="grid gap-1">
            <strong>{d.label}</strong>
            <div className="grid gap-2 [grid-template-columns:1fr_1fr]">
              <pre
                data-field="before"
                className="m-0 whitespace-pre-wrap rounded-md border p-2 text-sm"
                style={{ background: "var(--surface-sunken)" }}
              >
                {d.before}
              </pre>
              <pre
                data-field="after"
                className="m-0 whitespace-pre-wrap rounded-md border p-2 text-sm"
                style={{ background: "var(--surface-raised)" }}
              >
                {d.after}
              </pre>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
