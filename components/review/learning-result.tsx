import React from "react";
import type { LearningRecord } from "@/lib/memory/types.ts";

export type LearningResultProps = {
  records: LearningRecord[];
};

export function LearningResult({ records }: LearningResultProps): React.JSX.Element {
  if (records.length === 0) {
    return (
      <section data-component="learning-result" data-section="learning">
        <h2>Learning result</h2>
        <p data-field="none">No learning record yet — populated by Task 11.</p>
      </section>
    );
  }
  const last = records[records.length - 1]!;
  return (
    <section data-component="learning-result" data-section="learning">
      <h2>Learning result</h2>
      <p data-field="summary">
        {last.originalDraftSummary} → {last.finalDraftSummary}
      </p>
      {last.changedGuidance.length > 0 ? (
        <ul data-field="guidance">
          {last.changedGuidance.map((g, i) => (
            <li key={i}>{g}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
