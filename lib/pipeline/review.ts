import { readState, updateState } from "../storage/store.ts";
import type {
  AppState,
  CaseState,
  ReviewRecord,
  StoredCase,
  TraceEvent,
} from "../storage/types.ts";
import {
  retainReviewerLearning,
  undoReviewerLearning,
  type HindsightLike,
} from "../memory/hindsight.ts";
import type { CaseTopic, LearningRecord } from "../memory/types.ts";
import { sanitizeLearningText } from "../memory/sanitize.ts";
import type { DecisionDraft, DecisionOutcome } from "../llm/types.ts";

import { createEvent } from "./events.ts";
import { ReviewError, MaxRevisionsReached, MAX_REVISIONS } from "./errors.ts";

export { MaxRevisionsReached, ReviewError } from "./errors.ts";

export const DEFAULT_DATA_DIR = ".railops/data";

export type ReviewInput = {
  caseId: string;
  action: "approve" | "reject" | "edit";
  feedback?: string;
  editedDraft?: DecisionDraft;
  expectedVersion: number;
};

export type ReviewOptions = {
  dataDir?: string;
  memoryClient?: HindsightLike | null;
  reviewer?: string;
  now?: () => Date;
};

const DECISION_OUTCOMES: ReadonlySet<DecisionOutcome> = new Set<DecisionOutcome>([
  "refund",
  "change",
  "follow_up",
  "unsupported_or_escalate",
  "information",
]);

function isDecisionDraft(value: unknown): value is DecisionDraft {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const d = value as Record<string, unknown>;
  return (
    typeof d.outcome === "string" &&
    DECISION_OUTCOMES.has(d.outcome as DecisionOutcome) &&
    (d.proposedAmount === null || typeof d.proposedAmount === "number") &&
    Array.isArray(d.decisionBasis) &&
    typeof d.response === "string" &&
    Array.isArray(d.evidenceRefs)
  );
}

function latestDraftFromTrace(trace: readonly TraceEvent[]): DecisionDraft | null {
  for (let i = trace.length - 1; i >= 0; i -= 1) {
    const event = trace[i];
    if (!event || event.stage !== "drafting" || event.status !== "completed") continue;
    if (isDecisionDraft(event.payload)) return event.payload;
  }
  return null;
}

function makeLearningRecord(args: {
  caseId: string;
  id: string;
  topic: CaseTopic;
  outcome: DecisionDraft["outcome"];
  reviewerAction: "approve" | "reject" | "edit";
  feedback: string | null;
  originalDraft: DecisionDraft | null;
  finalDraft: DecisionDraft | null;
  timestamp: string;
}): LearningRecord {
  const summary = (d: DecisionDraft | null): string =>
    d === null
      ? "no draft"
      : `outcome=${d.outcome} amount=${d.proposedAmount ?? "null"} refs=${d.evidenceRefs.length}`;
  const changedGuidance: string[] = [];
  if (
    args.originalDraft &&
    args.finalDraft &&
    args.originalDraft.outcome !== args.finalDraft.outcome
  ) {
    changedGuidance.push(
      `outcome changed from ${args.originalDraft.outcome} to ${args.finalDraft.outcome}`,
    );
  }
  if (
    args.originalDraft &&
    args.finalDraft &&
    (args.originalDraft.proposedAmount ?? null) !==
      (args.finalDraft.proposedAmount ?? null)
  ) {
    changedGuidance.push(
      `amount changed from ${args.originalDraft.proposedAmount ?? "null"} to ${args.finalDraft.proposedAmount ?? "null"}`,
    );
  }
  if (args.feedback) {
    changedGuidance.push(`reviewer feedback: ${args.feedback}`);
  }
  return {
    id: args.id,
    caseId: args.caseId,
    topic: args.topic,
    outcome: outcomeToLearning(args.outcome),
    reviewerAction: args.reviewerAction,
    feedback: args.feedback ? sanitizeLearningText(args.feedback) : undefined,
    originalDraftSummary: sanitizeLearningText(summary(args.originalDraft)),
    finalDraftSummary: sanitizeLearningText(summary(args.finalDraft)),
    changedGuidance: changedGuidance
      .map((g) => sanitizeLearningText(g))
      .filter((g) => g.length > 0),
    timestamp: args.timestamp,
  };
}

function countEdits(history: readonly ReviewRecord[]): number {
  let n = 0;
  for (const r of history) if (r.action === "edit") n += 1;
  return n;
}

function outcomeToLearning(
  outcome: DecisionDraft["outcome"] | null,
): LearningRecord["outcome"] {
  if (outcome === null) return "information";
  return outcome;
}

export type ApplyReviewOptions = {
  memoryClient?: HindsightLike | null;
  reviewer?: string;
  now?: () => Date;
};

export type ApplyReviewResult = {
  state: AppState;
  updatedCase: StoredCase;
};

export async function applyReview(
  state: AppState,
  input: ReviewInput,
  options: ApplyReviewOptions = {},
): Promise<ApplyReviewResult> {
  const reviewer = options.reviewer ?? "demo-reviewer";
  const now = options.now ?? (() => new Date());

  const existing = state.cases.find((c) => c.caseId === input.caseId);
  if (!existing) {
    throw new ReviewError("case_not_found", `case ${input.caseId} not found`);
  }
  if (existing.state !== "reviewable" && existing.state !== "revising") {
    throw new ReviewError(
      "invalid_state",
      `case ${input.caseId} is in state ${existing.state} and cannot be reviewed`,
    );
  }
  if (existing.version !== input.expectedVersion) {
    throw new ReviewError(
      "version_mismatch",
      `case ${input.caseId} version is ${existing.version}, expected ${input.expectedVersion}`,
    );
  }
  if (input.action === "reject" && (!input.feedback || input.feedback.trim().length === 0)) {
    throw new ReviewError("feedback_required", "rejection requires non-empty feedback");
  }
  if (input.action === "edit" && !input.editedDraft) {
    throw new ReviewError("edited_draft_required", "edit action requires editedDraft");
  }

  const editCount = countEdits(existing.reviewHistory);
  if (input.action === "edit" && editCount >= MAX_REVISIONS) {
    throw new MaxRevisionsReached();
  }

  const ts = now().toISOString();
  const newReviewRecord: ReviewRecord = {
    action: input.action,
    reviewer,
    feedback: input.feedback ?? null,
    editedOutcome: input.editedDraft?.outcome ?? null,
    editedAmount: input.editedDraft?.proposedAmount ?? null,
    timestamp: ts,
  };

  const originalDraft =
    latestDraftFromTrace(state.events.filter((e) => e.caseId === existing.caseId)) ??
    latestDraftFromTrace(existing.trace);
  const finalDraft: DecisionDraft | null =
    input.action === "edit" && input.editedDraft
      ? input.editedDraft
      : input.action === "approve"
        ? originalDraft
        : null;

  let nextState: CaseState;
  if (input.action === "approve") {
    nextState = "approved";
  } else if (input.action === "reject") {
    nextState = "rejected";
  } else {
    nextState = "revising";
  }

  const learningId = `learning-${globalThis.crypto.randomUUID()}`;
  const learning = makeLearningRecord({
    caseId: existing.caseId,
    id: learningId,
    topic: existing.topic as CaseTopic,
    outcome:
      input.action === "reject"
        ? "information"
        : (finalDraft ?? originalDraft)?.outcome ?? "information",
    reviewerAction: input.action,
    feedback: input.feedback ?? null,
    originalDraft,
    finalDraft,
    timestamp: ts,
  });

  const knownEvents = [
    ...existing.trace,
    ...state.events.filter((e) => e.caseId === existing.caseId),
  ];
  const lastSeq = knownEvents.reduce((m, e) => (e.sequence > m ? e.sequence : m), 0);
  const runId =
    knownEvents.find((e) => e.sequence === lastSeq)?.runId ?? `run-${existing.caseId}`;
  const reviewSeq = lastSeq + 1;
  const reviewTrace: TraceEvent = createEvent({
    caseId: existing.caseId,
    runId,
    sequence: reviewSeq,
    stage: nextState === "revising" ? "revising" : "reviewable",
    status: "completed",
    summary:
      input.action === "approve"
        ? "Reviewer approved the decision"
        : input.action === "reject"
          ? `Reviewer rejected: ${input.feedback ?? ""}`
          : `Reviewer edited (${editCount + 1}/${MAX_REVISIONS})`,
    functionName: "reviewCase",
    recordRefs: [],
    evidenceRefs: finalDraft?.evidenceRefs ?? [],
    payload: {
      action: input.action,
      feedback: input.feedback ?? null,
      draft: finalDraft,
    },
  });

  const afterReview: AppState = {
    ...state,
    cases: state.cases.map((c) =>
      c.caseId === existing.caseId
        ? {
            ...c,
            state: nextState,
            reviewHistory: [...c.reviewHistory, newReviewRecord],
            trace: [...c.trace, reviewTrace],
            version: c.version + 1,
            updatedAt: ts,
          }
        : c,
    ),
    events: [...state.events, reviewTrace],
    learning: [...state.learning, learning],
  };

  const retained = await retainReviewerLearning({
    record: learning,
    client: options.memoryClient,
  });
  const memoryId = retained.memoryId;
  const learningSaved = memoryId !== null;
  const learningTrace: TraceEvent = createEvent({
    caseId: existing.caseId,
    runId,
    sequence: reviewSeq + 1,
    stage: "learning_saved",
    status: learningSaved ? "completed" : "failed",
    summary: learningSaved
      ? "Reviewer learning retained in Hindsight"
      : "Learning kept locally: Hindsight unavailable",
    functionName: "retainReviewerLearning",
    recordRefs: [],
    evidenceRefs: [],
    payload: { learning_saved: learningSaved },
    error: learningSaved ? null : "hindsight_unavailable",
  });

  let finalLearning = afterReview.learning;
  if (memoryId !== null) {
    finalLearning = afterReview.learning.map((r) =>
      r.id === learningId ? { ...r, id: memoryId } : r,
    );
  }

  const finalState: AppState = {
    ...afterReview,
    cases: afterReview.cases.map((c) =>
      c.caseId === existing.caseId
        ? {
            ...c,
            learningRef: memoryId !== null ? memoryId : c.learningRef,
            trace: [...c.trace, learningTrace],
          }
        : c,
    ),
    learning: finalLearning,
    events: [...afterReview.events, learningTrace],
  };

  const updatedCase = finalState.cases.find((c) => c.caseId === existing.caseId);
  if (!updatedCase) {
    throw new ReviewError("case_not_found", "case disappeared during review");
  }
  return { state: finalState, updatedCase };
}

export async function reviewCase(
  input: ReviewInput,
  options: ReviewOptions = {},
): Promise<StoredCase> {
  const dataDir = options.dataDir ?? DEFAULT_DATA_DIR;
  const state = await readState({ dataDir });
  const { state: next, updatedCase } = await applyReview(state, input, options);
  await updateState(() => next, { dataDir });
  return updatedCase;
}

export type RevertLearningOptions = {
  dataDir?: string;
  memoryClient?: HindsightLike | null;
};

export type RevertLearningResult = { undone: boolean; error: string | null };

export type ApplyRevertResult = {
  state: AppState;
  undone: boolean;
  error: string | null;
};

export type ApplyRevertLearningOptions = {
  memoryClient?: HindsightLike | null;
};

export async function applyRevertLearning(
  state: AppState,
  learningId: string,
  options: ApplyRevertLearningOptions = {},
): Promise<ApplyRevertResult> {
  const record = state.learning.find((r) => r.id === learningId);
  const owner = state.cases.find((c) => c.learningRef === learningId);
  if (!record && !owner) {
    return { state, undone: false, error: "learning_not_found" };
  }
  const next: AppState = {
    ...state,
    learning: state.learning.filter((r) => r.id !== learningId),
    cases: state.cases.map((c) =>
      c.learningRef === learningId
        ? { ...c, learningRef: null, updatedAt: new Date().toISOString() }
        : c,
    ),
  };
  if (owner) {
    await undoReviewerLearning({ memoryId: learningId, client: options.memoryClient });
  }
  return { state: next, undone: true, error: null };
}

export async function revertLearning(
  learningId: string,
  options: RevertLearningOptions = {},
): Promise<RevertLearningResult> {
  const dataDir = options.dataDir ?? DEFAULT_DATA_DIR;
  const state = await readState({ dataDir });
  const { state: next, undone, error } = await applyRevertLearning(state, learningId, options);
  if (undone) {
    await updateState(() => next, { dataDir });
  }
  return { undone, error };
}
