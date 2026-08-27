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

export function DraftDiff({ base, edited }: DraftDiffProps): React.JSX.Element {
  const diffs = fields(base, edited);
  if (diffs.length === 0) {
    return (
      <div data-component="draft-diff" data-empty="true">
        <p style={{ margin: 0 }}>No differences yet.</p>
      </div>
    );
  }
  return (
    <div data-component="draft-diff" data-empty="false">
      <ul style={{ margin: 0, paddingLeft: "var(--space-4)", display: "grid", gap: "var(--space-2)" }}>
        {diffs.map((d) => (
          <li key={d.label} data-field="diff-row" data-label={d.label}>
            <strong>{d.label}</strong>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-2)" }}>
              <pre
                data-field="before"
                style={{
                  margin: 0,
                  padding: "var(--space-2)",
                  background: "var(--surface-sunken)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  whiteSpace: "pre-wrap",
                }}
              >
                {d.before}
              </pre>
              <pre
                data-field="after"
                style={{
                  margin: 0,
                  padding: "var(--space-2)",
                  background: "var(--surface-raised)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  whiteSpace: "pre-wrap",
                }}
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
