import React from "react";
import type { DecisionBasis } from "@/lib/llm/types.ts";
import { formatEvidenceRef } from "@/components/review/formatters.ts";

export type DecisionBasisListProps = {
  items: DecisionBasis[];
};

export function DecisionBasisList({ items }: DecisionBasisListProps): React.JSX.Element {
  if (items.length === 0) {
    return (
      <p data-component="decision-basis" data-empty="true" className="m-0 text-[12.5px] text-ink-3">
        No decision basis recorded.
      </p>
    );
  }
  return (
    <ol data-component="decision-basis" className="m-0 grid list-none gap-1.5 p-0">
      {items.map((item, i) => (
        <li
          key={`${item.evidenceRef}-${i}`}
          data-record-ref={item.evidenceRef}
          className="grid gap-1 rounded-control bg-inset/60 px-3 py-2"
        >
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <strong data-field="claim" className="text-[13px] font-medium text-ink">
              {item.claim}
            </strong>
            <span
              data-field="evidence-ref"
              className="ms-auto inline-flex h-5 items-center rounded-full bg-surface px-2 text-[11px] font-medium text-ink-2 shadow-hairline"
            >
              {formatEvidenceRef(item.evidenceRef)}
            </span>
          </span>
          {item.note ? (
            <span data-field="note" className="text-[12.5px] text-ink-2">
              {item.note}
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
