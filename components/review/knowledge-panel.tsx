import React from "react";
export type KnowledgeExcerptView = {
  id: string;
  sourceId: string;
  heading: string;
  version: string;
  excerpt: string;
  score?: number;
};

export type KnowledgePanelProps = {
  staticKnowledge: KnowledgeExcerptView[];
  hindsightLearning: Array<{
    id: string;
    topic: string;
    summary: string;
    timestamp: string;
    outcome: string;
  }>;
};

export function KnowledgePanel({
  staticKnowledge,
  hindsightLearning,
}: KnowledgePanelProps): React.JSX.Element {
  return (
    <section
      data-component="knowledge-panel"
      data-section="knowledge"
      style={{
        display: "grid",
        gap: "var(--space-3)",
        padding: "var(--space-4)",
        background: "var(--surface-raised)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
      }}
    >
      <h2 style={{ margin: 0 }}>Knowledge used by the draft</h2>
      {staticKnowledge.length === 0 ? (
        <p data-field="none" style={{ margin: 0 }}>
          No static knowledge passages were retrieved.
        </p>
      ) : (
        <ul
          data-field="static-knowledge"
          style={{ margin: 0, paddingLeft: "var(--space-4)", display: "grid", gap: "var(--space-2)" }}
        >
          {staticKnowledge.map((k) => (
            <li
              key={k.id}
              data-record-ref={`knowledge:${k.sourceId}:${k.heading}`}
              data-source-kind="static"
              data-knowledge-id={k.id}
            >
              <strong data-field="heading">{k.heading}</strong>{" "}
              <span data-field="source-id" style={{ fontFamily: "ui-monospace, monospace" }}>
                {k.sourceId}@{k.version}
              </span>
              <p data-field="excerpt" style={{ margin: "var(--space-1) 0 0" }}>
                {k.excerpt}
              </p>
            </li>
          ))}
        </ul>
      )}
      <h3 style={{ margin: 0 }}>Hindsight learning</h3>
      {hindsightLearning.length === 0 ? (
        <p data-field="hindsight-none" style={{ margin: 0 }}>
          No Hindsight learning records applied to this draft.
        </p>
      ) : (
        <ul
          data-field="hindsight-learning"
          style={{ margin: 0, paddingLeft: "var(--space-4)", display: "grid", gap: "var(--space-2)" }}
        >
          {hindsightLearning.map((m) => (
            <li
              key={m.id}
              data-source-kind="hindsight"
              data-knowledge-id={m.id}
              data-record-ref={`hindsight:${m.topic}:${m.outcome}`}
            >
              <strong>{m.topic}</strong>: {m.summary}
              <span style={{ display: "block", fontSize: "12px", color: "var(--text-muted)" }}>
                {m.timestamp}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
