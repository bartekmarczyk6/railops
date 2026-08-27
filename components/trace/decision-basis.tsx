import React from "react";
import type { DecisionBasis } from "@/lib/llm/types.ts";

export type DecisionBasisListProps = {
  items: DecisionBasis[];
};

export function DecisionBasisList({ items }: DecisionBasisListProps): React.JSX.Element {
  if (items.length === 0) {
    return (
      <p data-component="decision-basis" data-empty="true" className="m-0">
        No decision basis recorded.
      </p>
    );
  }
  return (
    <ol
      data-component="decision-basis"
      className="m-0 grid list-none gap-2 p-0"
    >
      {items.map((item, i) => (
        <li
          key={`${item.evidenceRef}-${i}`}
          data-record-ref={item.evidenceRef}
          className="grid gap-1 rounded-md border p-2"
          style={{ background: "var(--surface-raised)" }}
        >
          <strong data-field="claim">{item.claim}</strong>
          <span data-field="evidence-ref" className="font-mono text-xs">
            {item.evidenceRef}
          </span>
          {item.note ? <span data-field="note">{item.note}</span> : null}
        </li>
      ))}
    </ol>
  );
}
