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
import {
  buildReviewInput,
  emptyFormState,
  type ReviewFormState,
} from "@/lib/review-form.ts";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetDescription,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

import { CaseHeader } from "./case-header.tsx";
import { RecommendationCard } from "./recommendation-card.tsx";
import { EmailPanel } from "./email-panel.tsx";
import { RecordPanels } from "./record-panels.tsx";
import { KnowledgePanel, type KnowledgeExcerptView } from "./knowledge-panel.tsx";
import { ApprovalCard } from "./approval-card.tsx";
import { LearningResult } from "./learning-result.tsx";
import { ThinkingState } from "@/components/trace/thinking-state.tsx";
import { EventTimeline } from "@/components/trace/event-timeline.tsx";
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

  const [currentCase, setCurrentCase] = useState<StoredCase>(caseData);
  const [lastError, setLastError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<TraceEvent | null>(null);
  const [form, setForm] = useState<ReviewFormState>(() => emptyFormState(decision));
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);

  async function runAction(action: "approve" | "reject" | "edit"): Promise<boolean> {
    const result = buildReviewInput({
      action,
      caseId: currentCase.caseId,
      version: currentCase.version,
      form,
      baseDraft: decision,
    });
    if (!result.ok) {
      setLastError(result.error);
      return false;
    }
    setLastError(null);
    setPending(true);
    try {
      const res = await onReviewAction(result.value);
      if (res.error) {
        setLastError(res.error);
        return false;
      }
      if (res.case) {
        setCurrentCase(res.case);
        setEditing(false);
      }
      return true;
    } finally {
      setPending(false);
    }
  }

  return (
    <main
      data-component="case-review-page"
      data-case-id={caseData.caseId}
      data-case-state={currentCase.state}
      className="mx-auto grid w-full max-w-320 gap-4 p-4"
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
        decision={decision}
        form={form}
        onFormChange={setForm}
        editing={editing}
        onStartEdit={() => setEditing(true)}
        onCancelEdit={() => {
          setEditing(false);
          setForm((f) => ({ ...f, editedDraft: { ...decision } }));
        }}
        onSaveEdit={() => runAction("edit")}
        onApprove={() => runAction("approve")}
        onReject={() => runAction("reject")}
        pending={pending}
        lastError={lastError}
      />
      <EmailPanel
        email={email}
        claims={claims}
        decision={decision}
        editing={editing}
        editedDraft={form.editedDraft}
        onChangeEditedDraft={(next) => setForm((f) => ({ ...f, editedDraft: next }))}
      />
      <RecordPanels pkg={caseData.pkg} priorHistory={priorHistory} />
      <KnowledgePanel staticKnowledge={knowledge} hindsightLearning={hindsight.map(toHindsightView)} />
      <LearningResult
        record={latestLearningForCase(hindsight, currentCase)}
        learningSaved={currentCase.learningRef !== null}
        reviewed={currentCase.reviewHistory.length > 0}
        onUndo={onUndoLearning}
      />
      <div className="hidden md:block">
        <ThinkingState events={currentCase.trace} onSelectEvent={setSelectedEvent} />
      </div>
      <div className="md:hidden">
        <Sheet>
          <SheetTrigger render={<Button variant="outline" className="w-full" />}>
            Show trace
          </SheetTrigger>
          <SheetPopup side="right">
            <SheetHeader>
              <SheetTitle>Trace</SheetTitle>
              <SheetDescription>Structured work log for this case.</SheetDescription>
            </SheetHeader>
            <SheetPanel>
              <EventTimeline events={currentCase.trace} onSelectEvent={setSelectedEvent} />
            </SheetPanel>
          </SheetPopup>
        </Sheet>
      </div>
      <RawEvidenceSheet event={selectedEvent} onClose={() => setSelectedEvent(null)} />
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
