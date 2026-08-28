"use client";

import React from "react";
import { useEffect, useMemo, useState } from "react";
import { Shimmer } from "@/components/beui/atoms/Shimmer.tsx";
import type { PipelineStage, StoredCase, StoredEmail, TraceEvent } from "@/lib/storage/types.ts";
import type {
  CritiqueReport,
  DecisionDraft,
  DecisionOutcome,
  EmailDraft,
  ExtractedClaims,
} from "@/lib/llm/types.ts";
import type { RuleEvaluation } from "@/lib/rules/types.ts";
import type { LearningRecord } from "@/lib/memory/types.ts";
import {
  applyReview,
  applyRevertLearning,
  MaxRevisionsReached,
  ReviewError,
} from "@/lib/pipeline/review.ts";
import { readBrowserState, updateBrowserState } from "@/lib/storage/browser-store.ts";
import {
  buildReviewInput,
  emptyFormState,
  type ReviewFormState,
} from "@/lib/review-form.ts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useCaseRun } from "@/hooks/use-case-run.ts";
import { OUTCOME_LABEL, outcomeLabel } from "./formatters.ts";

import { CaseHeader } from "./case-header.tsx";
import { RecommendationCard } from "./recommendation-card.tsx";
import { EmailPanel } from "./email-panel.tsx";
import { RecordPanels } from "./record-panels.tsx";
import { KnowledgePanel, type KnowledgeExcerptView } from "./knowledge-panel.tsx";
import { ApprovalCard } from "./approval-card.tsx";
import { LearningResult } from "./learning-result.tsx";
import { DraftResponseCard } from "./draft-response-card.tsx";
import { FollowUpCard, buildFollowUpQuestions } from "./follow-up-card.tsx";
import { EventTimeline } from "@/components/trace/event-timeline.tsx";
import { RawEvidenceSheet } from "@/components/trace/raw-evidence-sheet.tsx";

export type CaseReviewPageProps = {
  caseData: StoredCase;
  live?: boolean;
  email: EmailDraft;
  storedEmail?: StoredEmail | null;
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
  onCaseUpdated?: (updated: StoredCase) => void;
};

type EmailPayload = {
  subject?: unknown;
  body?: unknown;
  mentionedFacts?: unknown;
  from?: unknown;
  receivedAt?: unknown;
};
type KnowledgePayload = { count?: unknown; ids?: unknown };
type ReviewablePayload = { outcome?: unknown; claims?: unknown };

const EMPTY_CRITIQUE: CritiqueReport = { passed: true, findings: [], correctedDraft: null };

function completedPayload<T>(events: readonly TraceEvent[], stage: PipelineStage): T | null {
  const event = events.find((e) => e.stage === stage && e.status === "completed");
  if (!event || typeof event.payload !== "object" || event.payload === null) return null;
  return event.payload as T;
}

function stageInFlight(events: readonly TraceEvent[], stage: PipelineStage): boolean {
  return events.some((e) => e.stage === stage && e.status === "started");
}

function normalizeOutcome(value: string | undefined): DecisionOutcome {
  if (
    value === "refund" ||
    value === "change" ||
    value === "follow_up" ||
    value === "unsupported_or_escalate" ||
    value === "information"
  ) {
    return value;
  }
  return "information";
}

function alternativesForOutcome(outcome: DecisionOutcome): string[] {
  return (Object.keys(OUTCOME_LABEL) as DecisionOutcome[])
    .filter((o) => o !== outcome)
    .map((o) => OUTCOME_LABEL[o]);
}

export function CaseReviewPage(props: CaseReviewPageProps): React.JSX.Element {
  const {
    caseData,
    live = false,
    email,
    storedEmail = null,
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
    onCaseUpdated,
  } = props;

  const [currentCase, setCurrentCase] = useState<StoredCase>(caseData);
  const [lastError, setLastError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<TraceEvent | null>(null);
  const [form, setForm] = useState<ReviewFormState>(() => emptyFormState(decision));
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [followUpDismissed, setFollowUpDismissed] = useState(false);

  const run = useCaseRun(caseData.caseId, live, {
    getStored: () =>
      readBrowserState().cases.find((c) => c.caseId === caseData.caseId) ?? currentCase,
    getEvents: () =>
      readBrowserState().events.filter((e) => e.caseId === caseData.caseId),
    onDone: (stored, events) => {
      updateBrowserState((s) => ({
        ...s,
        events: [...s.events.filter((e) => e.caseId !== stored.caseId), ...events],
        cases: s.cases.some((c) => c.caseId === stored.caseId)
          ? s.cases.map((c) => (c.caseId === stored.caseId ? stored : c))
          : [...s.cases, stored],
      }));
      setCurrentCase(stored);
      onCaseUpdated?.(stored);
    },
  });
  const runActive = live || run.status !== "idle";

  useEffect(() => {
    setCurrentCase(caseData);
  }, [caseData]);

  const events = useMemo(() => {
    if (!runActive) return currentCase.trace;
    const merged = [...currentCase.trace];
    for (const ev of run.events) {
      const index = merged.findIndex((e) => e.id === ev.id);
      if (index >= 0) merged[index] = ev;
      else merged.push(ev);
    }
    return merged.sort(
      (a, b) => a.sequence - b.sequence || a.timestamp.localeCompare(b.timestamp),
    );
  }, [runActive, currentCase.trace, run.events]);

  const readingEmailPayload = live
    ? completedPayload<EmailPayload>(events, "reading_email")
    : null;
  const legacyEmailPayload =
    live && !readingEmailPayload
      ? completedPayload<EmailPayload>(events, "generating_email")
      : null;
  const emailCompleted = readingEmailPayload ?? legacyEmailPayload;
  const displayEmail: EmailDraft = useMemo(() => {
    if (!live) return email;
    const subject =
      typeof emailCompleted?.subject === "string"
        ? emailCompleted.subject
        : run.emailPartial?.subject ?? "";
    const body =
      typeof emailCompleted?.body === "string"
        ? emailCompleted.body
        : run.emailPartial?.body ?? "";
    const mentionedFacts = Array.isArray(emailCompleted?.mentionedFacts)
      ? (emailCompleted!.mentionedFacts as unknown[]).filter((v): v is string => typeof v === "string")
      : [];
    return { subject, body, mentionedFacts };
  }, [live, email, emailCompleted, run.emailPartial]);
  const emailStreaming =
    live &&
    run.status === "running" &&
    (stageInFlight(events, "reading_email") || stageInFlight(events, "generating_email")) &&
    !emailCompleted;
  const displayEmailFrom = live
    ? typeof emailCompleted?.from === "string"
      ? emailCompleted.from
      : undefined
    : storedEmail?.from;
  const displayReceivedAt = live
    ? typeof emailCompleted?.receivedAt === "string"
      ? emailCompleted.receivedAt
      : caseData.createdAt
    : storedEmail?.receivedAt ?? caseData.createdAt;

  /* While a run is active, payloads come from the run's own events: the
   * merged timeline for the initial live run, only the new events for a
   * follow-up resume (so stale payloads from the first run don't leak in). */
  const payloadEvents = runActive && !live ? run.events : events;

  const liveClaims = runActive
    ? completedPayload<ExtractedClaims>(payloadEvents, "extracting_claims")
    : null;
  const displayClaims = runActive ? liveClaims ?? (live ? null : claims) : claims;
  const claimsStreaming =
    runActive &&
    run.status === "running" &&
    stageInFlight(payloadEvents, "extracting_claims") &&
    !liveClaims;

  const liveRules = runActive ? completedPayload<RuleEvaluation>(payloadEvents, "evaluating_rules") : null;
  const knowledgePayload = runActive
    ? completedPayload<KnowledgePayload>(payloadEvents, "retrieving_knowledge")
    : null;
  const retrievedCount = knowledgePayload
    ? typeof knowledgePayload.count === "number"
      ? knowledgePayload.count
      : Array.isArray(knowledgePayload.ids)
        ? knowledgePayload.ids.length
        : 0
    : null;
  const knowledgeRetrieving =
    runActive && run.status === "running" && liveClaims !== null && !knowledgePayload;
  const recordsVerified =
    !live || events.some((e) => e.stage === "checking_records" && e.status === "completed");

  const liveDecision = runActive
    ? completedPayload<DecisionDraft>(payloadEvents, "drafting")
    : null;
  const reviewableEvent = runActive
    ? payloadEvents.find((e) => e.stage === "reviewable")
    : undefined;
  const shortCircuitDecision: DecisionDraft | null = useMemo(() => {
    if (!runActive || liveDecision || !reviewableEvent || reviewableEvent.status !== "completed") {
      return null;
    }
    const payload =
      typeof reviewableEvent.payload === "object" && reviewableEvent.payload !== null
        ? (reviewableEvent.payload as ReviewablePayload)
        : null;
    const outcome = payload?.outcome;
    if (outcome !== "follow_up" && outcome !== "escalate") return null;
    return {
      outcome: outcome === "escalate" ? "unsupported_or_escalate" : "follow_up",
      proposedAmount: null,
      decisionBasis: [],
      response: reviewableEvent.summary,
      evidenceRefs: reviewableEvent.evidenceRefs,
    };
  }, [runActive, liveDecision, reviewableEvent]);
  const partialDecision: DecisionDraft | null = run.draftPartial
    ? {
        outcome: normalizeOutcome(run.draftPartial.outcome),
        proposedAmount: run.draftPartial.proposedAmount ?? null,
        decisionBasis: [],
        response: run.draftPartial.response ?? "",
        evidenceRefs: [],
      }
    : null;
  const displayDecision = runActive
    ? liveDecision ?? shortCircuitDecision ?? partialDecision
    : decision;
  const draftingStarted = payloadEvents.some((e) => e.stage === "drafting");
  const decisionStreaming =
    runActive &&
    run.status === "running" &&
    stageInFlight(payloadEvents, "drafting") &&
    !liveDecision;
  const decisionPending =
    runActive && run.status === "running" && draftingStarted && !displayDecision;

  const liveCritique = runActive
    ? completedPayload<CritiqueReport>(payloadEvents, "critiquing")
    : null;
  const displayCritique = runActive ? liveCritique ?? EMPTY_CRITIQUE : critique;
  const displayConfidence = runActive
    ? displayDecision
      ? displayCritique.passed
        ? displayDecision.proposedAmount !== null
          ? "high"
          : "medium"
        : "low"
      : "medium"
    : confidence;
  const displayAlternatives =
    runActive && displayDecision ? alternativesForOutcome(displayDecision.outcome) : alternatives;
  const displayFollowUp = runActive ? (displayClaims?.missingFields ?? []).slice(0, 3) : followUp;
  const displayRulesSummary = liveRules
    ? { outcome: liveRules.outcome, amount: liveRules.amount }
    : rulesSummary;

  const latestReviewableEvent = useMemo(() => {
    let best: TraceEvent | null = null;
    for (const e of events) {
      if (e.stage !== "reviewable" || e.status !== "completed") continue;
      if (best === null || e.sequence > best.sequence) best = e;
    }
    return best;
  }, [events]);
  const latestReviewablePayload =
    latestReviewableEvent &&
    typeof latestReviewableEvent.payload === "object" &&
    latestReviewableEvent.payload !== null
      ? (latestReviewableEvent.payload as ReviewablePayload)
      : null;
  const latestReviewableEventId = latestReviewableEvent?.id ?? "";
  useEffect(() => {
    setFollowUpDismissed(false);
  }, [latestReviewableEventId]);
  const isFollowUpCase =
    currentCase.state === "reviewable" &&
    latestReviewableEvent !== null &&
    latestReviewablePayload?.outcome === "follow_up";
  const followUpFields = useMemo<string[]>(() => {
    if (!isFollowUpCase) return [];
    const payloadClaims = latestReviewablePayload?.claims;
    if (
      payloadClaims &&
      typeof payloadClaims === "object" &&
      Array.isArray((payloadClaims as { missingFields?: unknown }).missingFields)
    ) {
      const fields = ((payloadClaims as { missingFields: unknown[] }).missingFields).filter(
        (f): f is string => typeof f === "string" && f.trim().length > 0,
      );
      if (fields.length > 0) return fields;
    }
    return (displayClaims?.missingFields ?? []).filter((f) => f.trim().length > 0);
  }, [isFollowUpCase, latestReviewablePayload, displayClaims]);
  const followUpQuestions = useMemo(
    () => buildFollowUpQuestions(followUpFields, caseData.pkg),
    [followUpFields, caseData.pkg],
  );
  const showFollowUpCard =
    isFollowUpCase && !followUpDismissed && followUpQuestions.length > 0;

  const submitFollowUp = (answers: Record<string, string>): void => {
    setFollowUpDismissed(true);
    run.start({ answers });
  };

  const currency = caseData.pkg.tickets[0]?.currency ?? "PLN";
  const account = {
    fullName: caseData.pkg.account.fullName,
    email: caseData.pkg.account.email,
  };

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
      const current = readBrowserState();
      const { state: next, updatedCase } = await applyReview(
        current,
        result.value,
        { memoryClient: null },
      );
      updateBrowserState(() => next);
      setCurrentCase(updatedCase);
      setEditing(false);
      onCaseUpdated?.(updatedCase);
      return true;
    } catch (err) {
      if (err instanceof MaxRevisionsReached) {
        setLastError("max_revisions_reached");
      } else if (err instanceof ReviewError) {
        setLastError(err.code);
      } else {
        setLastError("internal");
      }
      return false;
    } finally {
      setPending(false);
    }
  }

  async function undoLearning(learningId: string): Promise<void> {
    const current = readBrowserState();
    const result = await applyRevertLearning(current, learningId, { memoryClient: null });
    if (!result.undone) return;
    updateBrowserState(() => result.state);
    const updated = result.state.cases.find((c) => c.caseId === currentCase.caseId);
    if (updated) {
      setCurrentCase(updated);
    }
    onCaseUpdated?.(updated ?? currentCase);
  }

  return (
    <main
      data-component="case-review-page"
      data-case-id={caseData.caseId}
      data-case-state={currentCase.state}
      className="mx-auto grid w-full max-w-[1380px] gap-4 p-4 lg:p-6"
    >
      <CaseHeader caseData={currentCase} />
      {run.status === "error" ? (
        <Alert variant="error" data-field="run-error">
          <AlertTitle>Agent run failed</AlertTitle>
          <AlertDescription>{run.error ?? "Unknown error"} — use “Run the agent again” below to retry.</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start lg:gap-5">
        <div className="order-1 min-w-0 lg:order-none lg:col-span-7 lg:col-start-6 lg:row-start-1">
          <RecommendationCard
            caseData={currentCase}
            decision={displayDecision}
            claims={displayClaims}
            critique={displayCritique}
            rulesSummary={displayRulesSummary}
            confidence={displayConfidence}
            alternatives={displayAlternatives}
            followUp={displayFollowUp}
            pending={decisionPending}
            streaming={decisionStreaming}
          />
        </div>
        <div className="order-6 min-w-0 lg:order-none lg:col-span-5 lg:col-start-1 lg:row-start-2">
          <RecordPanels pkg={caseData.pkg} priorHistory={priorHistory} verified={recordsVerified} />
        </div>
        <div className="order-3 min-w-0 lg:order-none lg:col-span-7 lg:col-start-6 lg:row-start-2">
          <AgentActivityCard
            events={events}
            running={runActive && run.status === "running"}
            onSelectEvent={setSelectedEvent}
          />
        </div>
        <div className="order-4 min-w-0 lg:order-none lg:col-span-7 lg:col-start-6 lg:row-start-3">
          <DraftResponseCard
            decision={displayDecision}
            streaming={decisionStreaming}
            pending={decisionPending}
            editing={editing}
            editedDraft={form.editedDraft}
            onChangeEditedDraft={(next) => setForm((f) => ({ ...f, editedDraft: next }))}
            account={account}
            subject={displayEmail.subject}
            currency={currency}
            caseId={caseData.caseId}
            topic={caseData.topic}
            truthMode={caseData.truthMode}
            rewriteEnabled={
              currentCase.state === "reviewable" && !pending && !decisionStreaming
            }
            onApplyRewrite={(newResponse) => {
              const base = form.editedDraft ?? displayDecision;
              if (!base) return;
              setForm((f) => ({ ...f, editedDraft: { ...base, response: newResponse } }));
              setEditing(true);
            }}
          />
        </div>
        <div className="order-5 grid min-w-0 gap-4 lg:order-none lg:col-span-7 lg:col-start-6 lg:row-start-4">
          {showFollowUpCard ? (
            <FollowUpCard
              key={latestReviewableEventId}
              questions={followUpQuestions}
              busy={run.status === "running"}
              onSubmit={submitFollowUp}
            />
          ) : (
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
              onRetry={() => run.start()}
              pending={pending || (runActive && run.status === "running")}
              lastError={lastError}
            />
          )}
          <LearningResult
            record={latestLearningForCase(hindsight, currentCase)}
            learningSaved={currentCase.learningRef !== null}
            reviewed={currentCase.reviewHistory.length > 0}
            onUndo={undoLearning}
          />
        </div>
        <div className="order-2 min-w-0 lg:order-none lg:col-span-5 lg:col-start-1 lg:row-start-1">
          <EmailPanel
            email={displayEmail}
            claims={displayClaims}
            decision={null}
            editing={false}
            editedDraft={null}
            onChangeEditedDraft={(next) => setForm((f) => ({ ...f, editedDraft: next }))}
            account={account}
            from={displayEmailFrom}
            receivedAt={displayReceivedAt}
            emailStreaming={emailStreaming}
            claimsStreaming={claimsStreaming}
            decisionStreaming={decisionStreaming}
          />
        </div>
        <div className="order-7 min-w-0 lg:order-none lg:col-span-5 lg:col-start-1 lg:row-start-3">
          <KnowledgePanel
            staticKnowledge={knowledge}
            hindsightLearning={hindsight.map(toHindsightView)}
            retrievedCount={runActive ? retrievedCount : null}
            retrieving={knowledgeRetrieving}
          />
        </div>
      </div>
      <RawEvidenceSheet event={selectedEvent} onClose={() => setSelectedEvent(null)} />
    </main>
  );
}

function AgentActivityCard({
  events,
  running,
  onSelectEvent,
}: {
  events: TraceEvent[];
  running: boolean;
  onSelectEvent: (event: TraceEvent) => void;
}): React.JSX.Element {
  const totalMs = events.reduce((sum, e) => sum + (e.durationMs ?? 0), 0);
  return (
    <section
      data-component="agent-activity"
      data-section="agent-activity"
      aria-label="Agent activity"
      className="overflow-hidden rounded-card bg-surface shadow-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <h2 className="m-0 font-display text-[14px] font-semibold text-ink">Agent activity</h2>
        {running ? (
          <Shimmer className="text-[12px] font-medium">Working through the case…</Shimmer>
        ) : events.length > 0 ? (
          <span className="font-mono text-[11.5px] tabular-nums text-ink-3">
            {events.length} steps · {totalMs} ms
          </span>
        ) : null}
      </div>
      <div className="p-2">
        {events.length === 0 ? (
          <p className="m-0 flex items-center gap-2 px-2 py-1.5 text-[13px] text-ink-2" role="status">
            <span
              aria-hidden
              className="size-3.5 rounded-full border-[1.5px] border-line-strong border-t-ink-2"
              style={{ animation: "spin 700ms linear infinite" }}
            />
            Starting the agent…
          </p>
        ) : (
          <EventTimeline events={events} onSelectEvent={onSelectEvent} />
        )}
      </div>
    </section>
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
  const outcome = outcomeLabel(record.outcome);
  const summary =
    record.reviewerAction === "approve"
      ? `${outcome} — the reviewer approved the draft.`
      : record.reviewerAction === "reject"
        ? `${outcome} — the reviewer rejected the draft.`
        : `${outcome} — the reviewer edited the draft.`;
  return {
    id: record.id ?? `lr-${record.timestamp}`,
    topic: record.topic,
    summary,
    timestamp: record.timestamp,
    outcome: record.outcome,
  };
}
