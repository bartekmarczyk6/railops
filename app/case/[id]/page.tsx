import React from "react";
import { readState } from "@/lib/storage/store.ts";
import { getDataDir } from "@/app/api/_shared/data-dir.ts";
import { loadKnowledgeIndex } from "@/lib/knowledge/indexer.ts";
import { recallReviewerContext } from "@/lib/memory/hindsight.ts";
import type {
  CritiqueReport,
  DecisionDraft,
  EmailDraft,
  ExtractedClaims,
} from "@/lib/llm/types.ts";
import type { LearningRecord } from "@/lib/memory/types.ts";
import type { StoredCase, TraceEvent } from "@/lib/storage/types.ts";
import type { KnowledgeExcerpt, KnowledgePassage } from "@/lib/knowledge/types.ts";
import { CaseReviewPage } from "@/components/review/case-review-page.tsx";
import type { ReviewInput } from "@/lib/pipeline/review.ts";
import { reviewCase, revertLearning } from "@/lib/pipeline/review.ts";
import type { KnowledgeExcerptView } from "@/components/review/knowledge-panel.tsx";

type Params = { id: string };

const KNOWLEDGE_INDEX_PATH = "./knowledge/index.json";

type PipelineOutputs = {
  email: EmailDraft;
  claims: ExtractedClaims;
  decision: DecisionDraft;
  critique: CritiqueReport;
  knowledge: KnowledgeExcerpt[];
};

function buildKnowledgeView(items: readonly KnowledgeExcerpt[]): KnowledgeExcerptView[] {
  return items.map((k) => ({
    id: k.id,
    sourceId: k.sourceId,
    heading: k.heading,
    version: String(k.version),
    excerpt: k.text,
    score: k.score,
  }));
}

function confidenceFor(decision: DecisionDraft, critique: CritiqueReport): "high" | "medium" | "low" {
  if (!critique.passed) return "low";
  const hasAmount = decision.proposedAmount !== null;
  if (!hasAmount) return "medium";
  return "high";
}

function alternativesFor(decision: DecisionDraft): string[] {
  const all: Array<DecisionDraft["outcome"]> = [
    "refund",
    "change",
    "follow_up",
    "unsupported_or_escalate",
    "information",
  ];
  return all
    .filter((o) => o !== decision.outcome)
    .map((o) => o.replaceAll("_", " "));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getEventPayload<T>(events: readonly TraceEvent[], stage: TraceEvent["stage"]): T | null {
  const completed = events.find((e) => e.stage === stage && e.status === "completed");
  if (!completed) return null;
  const payload = completed.payload;
  if (!isPlainObject(payload)) return null;
  return payload as unknown as T;
}

function extractFromTrace(events: readonly TraceEvent[], passages: readonly KnowledgePassage[]): PipelineOutputs | null {
  const emailPayload = getEventPayload<{
    subject?: unknown;
    body?: unknown;
    mentionedFacts?: unknown;
  }>(events, "generating_email");
  const claims = getEventPayload<ExtractedClaims>(events, "extracting_claims");
  const decision = getEventPayload<DecisionDraft>(events, "drafting");
  const critique = getEventPayload<CritiqueReport>(events, "critiquing");
  if (!emailPayload || !claims || !decision || !critique) return null;
  if (
    typeof emailPayload.subject !== "string" ||
    typeof emailPayload.body !== "string"
  ) {
    return null;
  }
  const knowledgePayload = getEventPayload<{ ids?: unknown }>(events, "retrieving_knowledge");
  const knowledgeIds = Array.isArray(knowledgePayload?.ids)
    ? (knowledgePayload!.ids as unknown[]).filter((v): v is string => typeof v === "string")
    : [];
  const knowledge: KnowledgeExcerpt[] = knowledgeIds
    .map((id) => passages.find((p) => p.id === id))
    .filter((p): p is KnowledgePassage => p !== undefined)
    .map((p) => ({ ...p, score: 1 }));
  const mentionedFacts = Array.isArray(emailPayload.mentionedFacts)
    ? (emailPayload.mentionedFacts as unknown[]).filter((v): v is string => typeof v === "string")
    : [];
  return {
    email: {
      subject: emailPayload.subject,
      body: emailPayload.body,
      mentionedFacts,
    },
    claims,
    decision,
    critique,
    knowledge,
  };
}

function fallbackPipelineOutputs(): PipelineOutputs {
  const email: EmailDraft = {
    subject: "Customer inquiry",
    body: "Synthetic inbound email body.",
    mentionedFacts: [],
  };
  const claims: ExtractedClaims = {
    requestedAction: "information",
    claims: [],
    missingFields: [],
    referencedTicketNumbers: [],
    referencedStations: [],
  };
  const decision: DecisionDraft = {
    outcome: "information",
    proposedAmount: null,
    decisionBasis: [],
    response: "No draft available; please review the trace.",
    evidenceRefs: [],
  };
  const critique: CritiqueReport = { passed: true, findings: [], correctedDraft: null };
  return { email, claims, decision, critique, knowledge: [] };
}

function priorHistoryFromState(
  state: { cases: readonly StoredCase[]; learning: readonly LearningRecord[] },
  accountId: string,
  currentCaseId: string,
): Array<{ caseId: string; topic: string; state: string; updatedAt: string }> {
  return state.cases
    .filter((c) => c.caseId !== currentCaseId && c.pkg.account.id === accountId)
    .slice(0, 5)
    .map((c) => ({ caseId: c.caseId, topic: c.topic, state: c.state, updatedAt: c.updatedAt }));
}

export default async function CasePage({
  params,
}: {
  params: Promise<Params>;
}): Promise<React.JSX.Element> {
  const { id } = await params;
  const dataDir = getDataDir();
  const state = await readState({ dataDir });
  const stored = state.cases.find((c) => c.caseId === id);
  if (!stored) {
    return (
      <main style={{ padding: "var(--space-4)" }}>
        <h1>Case not found</h1>
        <p>The case {id} is not present in local storage.</p>
      </main>
    );
  }

  let knowledgeIndex: { passages: KnowledgePassage[] } = { passages: [] };
  try {
    knowledgeIndex = await loadKnowledgeIndex(KNOWLEDGE_INDEX_PATH);
  } catch {
    knowledgeIndex = { passages: [] };
  }
  const outputs =
    extractFromTrace(stored.trace, knowledgeIndex.passages) ?? fallbackPipelineOutputs();

  const knowledge = buildKnowledgeView(outputs.knowledge);
  const hindsight: LearningRecord[] = state.learning;
  const priorHistory = priorHistoryFromState(state, stored.pkg.account.id, stored.caseId);

  const memoryContext = await recallReviewerContext({
    topic: stored.pkg.topic,
    query: `${stored.pkg.topic} ${outputs.claims.requestedAction ?? ""}`.trim(),
    client: null,
  });
  const followUp: string[] = memoryContext.source === "hindsight"
    ? memoryContext.reviewerGuidance.slice(0, 3)
    : outputs.claims.missingFields.slice(0, 3);

  async function onReviewAction(
    input: ReviewInput,
  ): Promise<{ error: string | null; case: StoredCase | null }> {
    "use server";
    try {
      const updated = await reviewCase(input, { dataDir });
      return { error: null, case: updated };
    } catch (err) {
      const code =
        err && typeof err === "object" && "code" in err && typeof (err as { code: unknown }).code === "string"
          ? (err as { code: string }).code
          : "internal";
      return { error: code, case: null };
    }
  }

  async function onUndoLearning(learningId: string): Promise<void> {
    "use server";
    await revertLearning(learningId, { dataDir });
  }

  return (
    <CaseReviewPage
      caseData={stored}
      email={outputs.email}
      claims={outputs.claims}
      decision={outputs.decision}
      critique={outputs.critique}
      knowledge={knowledge}
      hindsight={hindsight}
      priorHistory={priorHistory}
      rulesSummary={null}
      confidence={confidenceFor(outputs.decision, outputs.critique)}
      alternatives={alternativesFor(outputs.decision)}
      followUp={followUp}
      onReviewAction={onReviewAction}
      onUndoLearning={onUndoLearning}
    />
  );
}
