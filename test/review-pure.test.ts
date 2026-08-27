import test from "node:test";
import assert from "node:assert/strict";

import { applyReview, applyRevertLearning, ReviewError, MaxRevisionsReached } from "../lib/pipeline/review.ts";
import { CURRENT_SCHEMA_VERSION } from "../lib/storage/types.ts";
import type { AppState, StoredCase } from "../lib/storage/types.ts";
import type { DecisionDraft } from "../lib/llm/types.ts";

function makeDraft(): DecisionDraft {
  return {
    outcome: "refund",
    proposedAmount: 100,
    decisionBasis: [{ claim: "delay", evidenceRef: "record:ticket:TKT-000001", note: "ok" }],
    response: "Refund approved.",
    evidenceRefs: ["record:ticket:TKT-000001"],
  };
}

function makeCase(overrides: Partial<StoredCase> = {}): StoredCase {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    caseId: "case-1",
    topic: "delay_refund",
    truthMode: "supported_by_records",
    state: "reviewable",
    createdAt: now,
    updatedAt: now,
    seed: 1,
    pkg: {} as StoredCase["pkg"],
    trace: [
      {
        id: "ev-1",
        caseId: "case-1",
        runId: "run-1",
        sequence: 1,
        stage: "drafting",
        status: "completed",
        summary: "drafted",
        functionName: "draftDecision",
        recordRefs: [],
        evidenceRefs: [],
        durationMs: 1,
        error: null,
        timestamp: now,
        payload: makeDraft(),
      },
    ],
    reviewHistory: [],
    learningRef: null,
    email: null,
    emailError: null,
    supplements: {},
    version: 1,
    ...overrides,
  };
}

function makeState(stored: StoredCase): AppState {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    cases: [stored],
    events: [...stored.trace],
    learning: [],
  };
}

test("approve transitions to approved and records learning", async () => {
  const { state, updatedCase } = await applyReview(makeState(makeCase()), {
    caseId: "case-1",
    action: "approve",
    expectedVersion: 1,
  });
  assert.equal(updatedCase.state, "approved");
  assert.equal(updatedCase.version, 2);
  assert.equal(updatedCase.reviewHistory.length, 1);
  assert.equal(state.learning.length, 1);
  assert.ok(updatedCase.trace.some((e) => e.stage === "learning_saved"));
});

test("reject requires feedback", async () => {
  await assert.rejects(
    applyReview(makeState(makeCase()), {
      caseId: "case-1",
      action: "reject",
      expectedVersion: 1,
    }),
    ReviewError,
  );
});

test("version mismatch throws", async () => {
  await assert.rejects(
    applyReview(makeState(makeCase()), {
      caseId: "case-1",
      action: "approve",
      expectedVersion: 5,
    }),
    (err: unknown) => err instanceof ReviewError && err.code === "version_mismatch",
  );
});

test("second edit exceeds max revisions", async () => {
  const edited = makeCase({
    reviewHistory: [{ action: "edit", reviewer: "r", feedback: null, editedOutcome: "refund", editedAmount: 50, timestamp: "t" }],
  });
  await assert.rejects(
    applyReview(makeState(edited), {
      caseId: "case-1",
      action: "edit",
      editedDraft: makeDraft(),
      expectedVersion: 1,
    }),
    MaxRevisionsReached,
  );
});

test("applyReview does not mutate the input state", async () => {
  const input = makeState(makeCase());
  const snapshot = JSON.stringify(input);
  const { state } = await applyReview(input, {
    caseId: "case-1",
    action: "approve",
    expectedVersion: 1,
  });
  assert.equal(JSON.stringify(input), snapshot);
  assert.notEqual(state, input);
  assert.notEqual(state.cases, input.cases);
  assert.notEqual(state.events, input.events);
  assert.notEqual(state.learning, input.learning);
});

test("applyRevertLearning removes the record and clears learningRef", async () => {
  const first = await applyReview(makeState(makeCase()), {
    caseId: "case-1",
    action: "approve",
    expectedVersion: 1,
  });
  const learningId = first.state.learning[0]?.id;
  assert.ok(learningId);
  const reverted = await applyRevertLearning(first.state, learningId);
  assert.equal(reverted.undone, true);
  assert.equal(reverted.state.learning.length, 0);
  assert.equal(
    reverted.state.cases.find((c) => c.caseId === "case-1")?.learningRef,
    null,
  );
});
