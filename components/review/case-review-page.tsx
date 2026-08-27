"use client";

import React from "react";
import { useState } from "react";
import type { StoredCase, TraceEvent } from "@/lib/storage/types.ts";
import type {
  CritiqueReport,
  DecisionDraft,
  EmailDraft,
  ExtractedClaims,
} from "@/lib/llm/types.ts";
import type { LearningRecord } from "@/lib/memory/types.ts";
import type { ReviewInput } from "@/lib/pipeline/review.ts";

import { CaseHeader } from "./case-header.tsx";
import { RecommendationCard } from "./recommendation-card.tsx";
import { EmailPanel } from "./email-panel.tsx";
import { RecordPanels } from "./record-panels.tsx";
import { KnowledgePanel, type KnowledgeExcerptView } from "./knowledge-panel.tsx";
import { ApprovalCard } from "./approval-card.tsx";
import { LearningResult } from "./learning-result.tsx";
import { DraftDiff } from "./draft-diff.tsx";
import { ThinkingState } from "@/components/trace/thinking-state.tsx";
import { RawEvidenceSheet } from "@/components/trace/raw-evidence-sheet.tsx";

export type CaseReviewPageProps = {
  caseData: StoredCase;
  email: EmailDraft;
  claims: ExtractedClaims;
  decision: DecisionDraft;
  critique: CritiqueReport;
  knowledge: KnowledgeExcerptView[];
  hindsight: LearningRecord[];
  priorHistory: Array<{
    caseId: string;
    topic: string;
    state: string;
    updatedAt: string;
  }>;
  rulesSummary: { outcome: string; amount: number | null } | null;
  confidence: "high" | "medium" | "low";
  alternatives: string[];
  followUp: string[];
  onReviewAction: (input: ReviewInput) => Promise<{ error: string | null; case: StoredCase | null }>;
  onUndoLearning?: (learningId: string) => void | Promise<void>;
};

export function CaseReviewPage(props: CaseReviewPageProps): React.JSX.Element {
  const {
    caseData,
    email,
    claims,
    decision,
    critique,
    knowledge,
    hindsight,
    priorHistory,
    rulesSummary,
    confidence,
    alternatives,
    followUp,
    onReviewAction,
    onUndoLearning,
  } = props;

  const [editedDraft, setEditedDraft] = useState<DecisionDraft | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<TraceEvent | null>(null);
  const [currentCase, setCurrentCase] = useState<StoredCase>(caseData);

  async function handleAction(input: ReviewInput): Promise<void> {
    setLastError(null);
    const res = await onReviewAction(input);
    if (res.error) {
      setLastError(res.error);
      return;
    }
    if (res.case) {
      setCurrentCase(res.case);
    }
  }

  return (
    <main
      data-component="case-review-page"
      data-case-id={caseData.caseId}
      data-case-state={currentCase.state}
      style={{
        display: "grid",
        gap: "var(--space-4)",
        padding: "var(--space-4)",
        maxWidth: "1280px",
        margin: "0 auto",
      }}
    >
      <CaseHeader caseData={currentCase} />
      <RecommendationCard
        caseData={currentCase}
        decision={decision}
        claims={claims}
        critique={critique}
        rulesSummary={rulesSummary}
        confidence={confidence}
        alternatives={alternatives}
        followUp={followUp}
      />
      <ApprovalCard
        state={currentCase.state}
        caseId={currentCase.caseId}
        version={currentCase.version}
        decision={decision}
        onAction={handleAction}
        lastError={lastError}
      />
      <EmailPanel
        email={email}
        claims={claims}
        decision={decision}
        editedDraft={editedDraft}
        onChangeEditedDraft={setEditedDraft}
      />
      {editedDraft ? <DraftDiff base={decision} edited={editedDraft} /> : null}
      <RecordPanels pkg={caseData.pkg} priorHistory={priorHistory} />
      <KnowledgePanel staticKnowledge={knowledge} hindsightLearning={hindsight.map(toHindsightView)} />
      <LearningResult
        record={latestLearningForCase(hindsight, currentCase)}
        learningSaved={currentCase.learningRef !== null}
        reviewed={currentCase.reviewHistory.length > 0}
        onUndo={onUndoLearning}
      />
      <ThinkingState events={caseData.trace} onSelectEvent={setSelectedEvent} />
      <RawEvidenceSheet event={selectedEvent} />
    </main>
  );
}

function latestLearningForCase(
  records: readonly LearningRecord[],
  caseData: StoredCase,
): LearningRecord | null {
  const own = records.filter((r) => r.caseId === caseData.caseId);
  return own[own.length - 1] ?? null;
}

function toHindsightView(record: LearningRecord): {
  id: string;
  topic: string;
  summary: string;
  timestamp: string;
  outcome: string;
} {
  return {
    id: `lr-${record.timestamp}`,
    topic: record.topic,
    summary: `${record.finalDraftSummary}`,
    timestamp: record.timestamp,
    outcome: record.outcome,
  };
}
