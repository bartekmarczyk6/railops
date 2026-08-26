import { readState, updateState } from "../storage/store.ts";
import type {
  AppState,
  CaseState,
  ReviewRecord,
  StoredCase,
  TraceEvent,
} from "../storage/types.ts";
import { recallReviewerContext, retainReviewerLearning } from "../memory/hindsight.ts";
import type { CaseTopic, LearningRecord } from "../memory/types.ts";
import type { DecisionDraft } from "../llm/types.ts";

import { createEvent } from "./events.ts";
import { ReviewError, MaxRevisionsReached, MAX_REVISIONS } from "./run-case.ts";

export { MaxRevisionsReached, ReviewError } from "./run-case.ts";

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
  memoryClient?: Parameters<typeof recallReviewerContext>[0]["client"];
  reviewer?: string;
  now?: () => Date;
};

function makeLearningRecord(args: {
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
    topic: args.topic,
    outcome: args.outcome,
    reviewerAction: args.reviewerAction,
    feedback: args.feedback ?? undefined,
    originalDraftSummary: summary(args.originalDraft),
    finalDraftSummary: summary(args.finalDraft),
    changedGuidance,
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

export async function reviewCase(
  input: ReviewInput,
  options: ReviewOptions = {},
): Promise<StoredCase> {
  const dataDir = options.dataDir ?? DEFAULT_DATA_DIR;
  const reviewer = options.reviewer ?? "demo-reviewer";
  const now = options.now ?? (() => new Date());

  const state = await readState({ dataDir });
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

  if (input.action === "approve" || input.action === "reject" || input.action === "edit") {
    if (input.action === "reject" && (!input.feedback || input.feedback.trim().length === 0)) {
      throw new ReviewError("feedback_required", "rejection requires non-empty feedback");
    }
    if (input.action === "edit" && !input.editedDraft) {
      throw new ReviewError("edited_draft_required", "edit action requires editedDraft");
    }
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

  let nextState: CaseState;
  let learning: LearningRecord | null = null;
  let persistLearning = false;
  const finalDraft: DecisionDraft | null =
    input.action === "edit" && input.editedDraft ? input.editedDraft : null;

  if (input.action === "approve") {
    nextState = "approved";
  } else if (input.action === "reject") {
    nextState = "rejected";
    learning = makeLearningRecord({
      topic: existing.topic as CaseTopic,
      outcome: "information",
      reviewerAction: "reject",
      feedback: input.feedback ?? null,
      originalDraft: null,
      finalDraft: null,
      timestamp: ts,
    });
    persistLearning = true;
  } else {
    nextState = "revising";
    learning = makeLearningRecord({
      topic: existing.topic as CaseTopic,
      outcome: outcomeToLearning(input.editedDraft?.outcome ?? null),
      reviewerAction: "edit",
      feedback: input.feedback ?? null,
      originalDraft: null,
      finalDraft: input.editedDraft ?? null,
      timestamp: ts,
    });
    persistLearning = true;
  }

  const reviewTrace: TraceEvent = createEvent({
    caseId: existing.caseId,
    runId: existing.trace[existing.trace.length - 1]?.runId ?? `run-${existing.caseId}`,
    sequence: (existing.trace[existing.trace.length - 1]?.sequence ?? 0) + 1,
    stage: nextState === "revising" ? "revising" : "learning_saved",
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

  await updateState((s: AppState) => {
    const cases = s.cases.map((c) =>
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
    );
    const events = [
      ...s.events.filter(
        (e) => !(e.caseId === existing.caseId && e.id === reviewTrace.id),
      ),
      reviewTrace,
    ];
    return {
      ...s,
      cases,
      events,
      learning: persistLearning && learning ? [...s.learning, learning] : s.learning,
    };
  }, { dataDir });

  if (persistLearning && learning) {
    try {
      const result = await retainReviewerLearning({
        record: learning,
        client: options.memoryClient ?? null,
      });
      if (result.memoryId) {
        const memId = result.memoryId;
        await updateState((s) => {
          const cases = s.cases.map((c) =>
            c.caseId === existing.caseId ? { ...c, learningRef: memId } : c,
          );
          return { ...s, cases };
        }, { dataDir });
      }
    } catch {
    }
  }

  const refreshed = (await readState({ dataDir })).cases.find(
    (c) => c.caseId === existing.caseId,
  );
  if (!refreshed) {
    throw new ReviewError("case_not_found", "case disappeared during review");
  }
  return refreshed;
}
