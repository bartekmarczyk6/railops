import React from "react";
import type { DecisionBasis } from "@/lib/llm/types.ts";

export type DecisionBasisListProps = {
  items: DecisionBasis[];
};

export function DecisionBasisList({ items }: DecisionBasisListProps): React.JSX.Element {
  if (items.length === 0) {
    return (
      <p data-component="decision-basis" data-empty="true">
        No decision basis recorded.
      </p>
    );
  }
  return (
    <ol
      data-component="decision-basis"
      style={{
        display: "grid",
        gap: "var(--space-2)",
        margin: 0,
        padding: 0,
        listStyle: "none",
      }}
    >
      {items.map((item, i) => (
        <li
          key={`${item.evidenceRef}-${i}`}
          data-record-ref={item.evidenceRef}
          style={{
            display: "grid",
            gap: "var(--space-1)",
            padding: "var(--space-2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            background: "var(--surface-raised)",
          }}
        >
          <strong data-field="claim">{item.claim}</strong>
          <span data-field="evidence-ref" style={{ fontFamily: "ui-monospace, monospace" }}>
            {item.evidenceRef}
          </span>
          {item.note ? <span data-field="note">{item.note}</span> : null}
        </li>
      ))}
    </ol>
  );
}
