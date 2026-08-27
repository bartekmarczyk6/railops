import React from "react";
import { Shimmer } from "@/components/beui/atoms/Shimmer.tsx";
import { topicLabel } from "@/components/cases/case-list.tsx";
import { formatDateTime, humanize } from "./formatters.ts";

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
  retrievedCount?: number | null;
  retrieving?: boolean;
};

export function KnowledgePanel({
  staticKnowledge,
  hindsightLearning,
  retrievedCount = null,
  retrieving = false,
}: KnowledgePanelProps): React.JSX.Element {
  return (
    <section
      data-component="knowledge-panel"
      data-section="knowledge"
      aria-label="Knowledge"
      className="overflow-hidden rounded-card bg-surface shadow-card"
    >
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <h2 className="m-0 font-display text-[14px] font-semibold text-ink">Knowledge</h2>
        {retrieving ? (
          <Shimmer className="text-[12px] font-medium">Searching…</Shimmer>
        ) : staticKnowledge.length > 0 ? (
          <span className="inline-flex h-5 items-center rounded-md bg-inset px-1.5 text-[11px] font-medium tabular-nums text-ink-2">
            {staticKnowledge.length} passages
          </span>
        ) : null}
      </div>
      <div className="grid gap-4 p-4">
        <div className="grid gap-2">
          <h3 className="m-0 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">
            Policy passages
          </h3>
          {retrieving ? (
            <p data-field="retrieving" className="m-0 text-[13px]" role="status">
              <Shimmer>Searching the policy library…</Shimmer>
            </p>
          ) : staticKnowledge.length === 0 ? (
            retrievedCount !== null ? (
              <p data-field="retrieved-count" className="m-0 text-[13px] text-ink-2">
                Retrieved {retrievedCount} passages — excerpts appear after the page refreshes.
              </p>
            ) : (
              <p data-field="none" className="m-0 text-[13px] text-ink-3">
                No policy passages were retrieved.
              </p>
            )
          ) : (
            <ul data-field="static-knowledge" className="enter-fade-up m-0 grid list-none gap-2 p-0">
              {staticKnowledge.map((k) => (
                <li
                  key={k.id}
                  data-record-ref={`knowledge:${k.sourceId}:${k.heading}`}
                  data-source-kind="static"
                  data-knowledge-id={k.id}
                  className="grid gap-1 rounded-control bg-inset/60 px-3 py-2.5"
                >
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <strong data-field="heading" className="text-[13px] font-semibold text-ink">
                      {k.heading}
                    </strong>
                    <span data-field="source-id" className="text-[11.5px] text-ink-3">
                      {humanize(k.sourceId)} policy
                    </span>
                  </span>
                  <p data-field="excerpt" className="m-0 text-[12.5px] leading-relaxed text-ink-2">
                    {k.excerpt}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="grid gap-2">
          <h3 className="m-0 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">
            Learned from past reviews
          </h3>
          {hindsightLearning.length === 0 ? (
            <p data-field="hindsight-none" className="m-0 text-[13px] text-ink-3">
              No past learning applied to this draft.
            </p>
          ) : (
            <ul data-field="hindsight-learning" className="m-0 grid list-none gap-2 p-0">
              {hindsightLearning.map((m) => (
                <li
                  key={m.id}
                  data-source-kind="hindsight"
                  data-knowledge-id={m.id}
                  data-record-ref={`hindsight:${m.topic}:${m.outcome}`}
                  className="grid gap-0.5 rounded-control border-l-2 border-(--fixture) bg-inset/60 px-3 py-2.5"
                >
                  <span className="text-[13px] font-medium text-ink">
                    {topicLabel(m.topic)}
                  </span>
                  <span className="text-[12.5px] text-ink-2">{m.summary}</span>
                  <span className="font-mono text-[11px] tabular-nums text-ink-3">
                    {formatDateTime(m.timestamp)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
