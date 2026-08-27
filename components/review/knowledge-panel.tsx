import React from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardDescription, CardPanel, CardTitle } from "@/components/ui/card";

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
    <Card data-component="knowledge-panel" data-section="knowledge">
      <CardHeader>
        <CardTitle>Knowledge used by the draft</CardTitle>
        <CardDescription>
          Static policy passages and Hindsight learning context are listed separately.
        </CardDescription>
      </CardHeader>
      <CardPanel className="grid gap-4">
        <div className="grid gap-2">
          <h3 className="m-0 flex items-center gap-2 text-sm font-medium">
            Static knowledge
            <Badge variant="secondary">policy</Badge>
          </h3>
          {staticKnowledge.length === 0 ? (
            <p data-field="none" className="m-0">
              No static knowledge passages were retrieved.
            </p>
          ) : (
            <ul data-field="static-knowledge" className="m-0 grid list-none gap-2 p-0">
              {staticKnowledge.map((k) => (
                <li
                  key={k.id}
                  data-record-ref={`knowledge:${k.sourceId}:${k.heading}`}
                  data-source-kind="static"
                  data-knowledge-id={k.id}
                  className="grid gap-1 rounded-md border p-2"
                  style={{ background: "var(--surface-raised)" }}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <strong data-field="heading">{k.heading}</strong>
                    <code data-field="source-id" className="font-mono text-xs">
                      {k.sourceId}@{k.version}
                    </code>
                  </span>
                  <p data-field="excerpt" className="m-0">
                    {k.excerpt}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="grid gap-2">
          <h3 className="m-0 flex items-center gap-2 text-sm font-medium">
            Hindsight learning
            <Badge
              className="uppercase tracking-wide"
              style={{ background: "var(--fixture)", color: "#ffffff" }}
            >
              learning
            </Badge>
          </h3>
          {hindsightLearning.length === 0 ? (
            <p data-field="hindsight-none" className="m-0">
              No Hindsight learning records applied to this draft.
            </p>
          ) : (
            <ul data-field="hindsight-learning" className="m-0 grid list-none gap-2 p-0">
              {hindsightLearning.map((m) => (
                <li
                  key={m.id}
                  data-source-kind="hindsight"
                  data-knowledge-id={m.id}
                  data-record-ref={`hindsight:${m.topic}:${m.outcome}`}
                  className="grid gap-1 rounded-md border-2 p-2"
                  style={{
                    background: "var(--surface-sunken)",
                    borderColor: "var(--fixture)",
                  }}
                >
                  <span>
                    <strong>{m.topic}</strong>: {m.summary}
                  </span>
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {m.timestamp}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardPanel>
    </Card>
  );
}
