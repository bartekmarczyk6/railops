import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import { createDemoCase } from "../lib/domain/case-factory.ts";
import type { StoredCase, TraceEvent, ReviewRecord } from "../lib/storage/types.ts";
import type { LearningRecord } from "../lib/memory/types.ts";
import type {
  DecisionDraft,
  EmailDraft,
  ExtractedClaims,
  CritiqueReport,
  DecisionBasis,
} from "../lib/llm/types.ts";

import { CaseReviewPage } from "../components/review/case-review-page.tsx";
import { EventTimeline } from "../components/trace/event-timeline.tsx";
import { DecisionBasisList } from "../components/trace/decision-basis.tsx";
import { RawEvidenceSheet } from "../components/trace/raw-evidence-sheet.tsx";
import { ApprovalCard, RejectDialogBody } from "../components/review/approval-card.tsx";
import { AlertDialog } from "../components/ui/alert-dialog.tsx";
import { EmailPanel } from "../components/review/email-panel.tsx";
import { DraftDiff } from "../components/review/draft-diff.tsx";
import { ToolChip } from "../components/trace/tool-chip.tsx";
import {
  buildFollowUpAnswers,
  buildFollowUpQuestions,
  type FollowUpQuestion,
} from "../components/review/follow-up-card.tsx";
import { buildRunRequest } from "../hooks/use-case-run.ts";
import {
  buildReviewInput,
  type ReviewFormState,
} from "../lib/review-form.ts";
import type { ReviewInput } from "../lib/pipeline/review.ts";

function makeEmail(): EmailDraft {
  return {
    subject: "Delay refund request",
    body: "My train was delayed by 45 minutes. Please refund ticket TKT-000001.",
    mentionedFacts: ["record:ticket:TKT-000001"],
  };
}

function makeClaims(): ExtractedClaims {
  return {
    requestedAction: "refund",
    claims: [
      { kind: "delay_minutes", description: "Claimed 45 minute delay", value: 45, ticketNumber: "TKT-000001" },
    ],
    missingFields: [],
    referencedTicketNumbers: ["TKT-000001"],
    referencedStations: ["Warszawa Centralna", "Krakow Glowny"],
  };
}

function makeDecision(overrides: Partial<DecisionDraft> = {}): DecisionDraft {
  const basis: DecisionBasis[] = overrides.decisionBasis ?? [
    { claim: "delay 45 minutes", evidenceRef: "rule:1.0.0:delay_30", note: "delay exceeds 30 min threshold" },
  ];
  return {
    outcome: "refund",
    proposedAmount: 50,
    decisionBasis: basis,
    response: "Refund approved at 50% of paid price.",
    evidenceRefs: ["rule:1.0.0:delay_30", "record:ticket:TKT-000001"],
    ...overrides,
  };
}

function makeCritique(): CritiqueReport {
  return { passed: true, findings: [], correctedDraft: null };
}

function makeTraceEvents(caseId: string, runId: string): TraceEvent[] {
  const stages: Array<{ stage: TraceEvent["stage"]; status: TraceEvent["status"]; summary: string; functionName: string | null; durationMs: number }> = [
    { stage: "reading_email", status: "completed", summary: "Email read", functionName: null, durationMs: 40 },
    { stage: "locating_account", status: "completed", summary: "Account matched by email", functionName: null, durationMs: 5 },
    { stage: "extracting_claims", status: "completed", summary: "Claims extracted", functionName: "ExtractCaseClaims", durationMs: 80 },
    { stage: "retrieving_knowledge", status: "completed", summary: "Knowledge retrieved", functionName: "searchKnowledge", durationMs: 60 },
    { stage: "checking_records", status: "completed", summary: "Record refs collected", functionName: "collectRecordRefs", durationMs: 20 },
    { stage: "evaluating_rules", status: "completed", summary: "Rules evaluated", functionName: "evaluateCase", durationMs: 30 },
    { stage: "drafting", status: "completed", summary: "Decision drafted", functionName: "DraftDecision", durationMs: 150 },
    { stage: "critiquing", status: "completed", summary: "Critique passed", functionName: "CritiqueDecision", durationMs: 90 },
    { stage: "reviewable", status: "completed", summary: "Decision ready for review", functionName: null, durationMs: 10 },
  ];
  return stages.map((s, i) => ({
    id: `evt-${runId}-${i}`,
    caseId,
    runId,
    sequence: i + 1,
    stage: s.stage,
    status: s.status,
    summary: s.summary,
    functionName: s.functionName,
    recordRefs: ["record:ticket:TKT-000001"],
    evidenceRefs: ["rule:1.0.0:delay_30"],
    durationMs: s.durationMs,
    error: null,
    timestamp: "2026-08-27T00:00:00.000Z",
  }));
}

function makeStoredCase(overrides: Partial<StoredCase> = {}): StoredCase {
  const pkg = createDemoCase({ topic: "delay_refund", truthMode: "supported_by_records", seed: 7 });
  const now = "2026-08-27T00:00:00.000Z";
  const base: StoredCase = {
    caseId: pkg.id,
    topic: "delay_refund",
    truthMode: "supported_by_records",
    state: "reviewable",
    createdAt: now,
    updatedAt: now,
    seed: 7,
    pkg,
    trace: makeTraceEvents(pkg.id, "run-1"),
    reviewHistory: [],
    learningRef: null,
    email: null,
    emailError: null,
    supplements: {},
    version: 2,
  };
  return { ...base, ...overrides };
}

function findAllDataRecordRefs(html: string): string[] {
  const re = /data-record-ref="([^"]+)"/g;
  const refs: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) refs.push(m[1] ?? "");
  return refs;
}

function buttonTag(html: string, action: string): string {
  const re = new RegExp(`<button[^>]*data-action="${action}"[^>]*>`, "g");
  const m = re.exec(html);
  assert.ok(m, `button with data-action="${action}" must render`);
  return m[0];
}

function buildPageProps(overrides: Partial<Parameters<typeof CaseReviewPage>[0]> = {}): Parameters<typeof CaseReviewPage>[0] {
  return {
    caseData: makeStoredCase(),
    email: makeEmail(),
    claims: makeClaims(),
    decision: makeDecision(),
    critique: makeCritique(),
    knowledge: [
      {
        id: "ke-1",
        sourceId: "delay-refund",
        heading: "When to refund",
        version: "1.0.0",
        excerpt: "Refunds apply when delay > 30 minutes.",
        score: 0.9,
      },
    ],
    hindsight: [],
    priorHistory: [],
    rulesSummary: { outcome: "eligible", amount: 50 },
    confidence: "high",
    alternatives: ["information", "change"],
    followUp: [],
    onReviewAction: async () => ({ error: null, case: null }),
    ...overrides,
  };
}

type ApprovalCardTestProps = Parameters<typeof ApprovalCard>[0];

function buildApprovalProps(overrides: Partial<ApprovalCardTestProps> = {}): ApprovalCardTestProps {
  const decision = makeDecision();
  return {
    state: "reviewable",
    decision,
    form: { feedback: "", editedDraft: { ...decision } },
    onFormChange: () => {},
    editing: false,
    onStartEdit: () => {},
    onCancelEdit: () => {},
    onSaveEdit: async () => true,
    onApprove: async () => true,
    onReject: async () => true,
    pending: false,
    lastError: null,
    ...overrides,
  };
}

test("CaseReviewPage: renders recommendation card first, then record panels, then trace", () => {
  const stored = makeStoredCase();
  const html = renderToStaticMarkup(
    createElement(CaseReviewPage, buildPageProps({ caseData: stored })),
  );
  const recIdx = html.indexOf("data-section=\"recommendation\"");
  const recordsIdx = html.indexOf("data-section=\"records\"");
  const traceIdx = html.indexOf("data-section=\"trace\"");
  assert.ok(recIdx >= 0, "recommendation section must render");
  assert.ok(recordsIdx >= 0, "records section must render");
  assert.ok(traceIdx >= 0, "trace section must render");
  assert.ok(recIdx < recordsIdx, "recommendation must appear before records");
  assert.ok(recordsIdx < traceIdx, "records must appear before trace");
});

test("CaseReviewPage: every record fact rendered carries a data-record-ref attribute", () => {
  const stored = makeStoredCase();
  const html = renderToStaticMarkup(
    createElement(CaseReviewPage, buildPageProps({ caseData: stored, knowledge: [] })),
  );
  const refs = findAllDataRecordRefs(html);
  assert.ok(refs.length >= 5, `expected at least 5 record refs, got ${refs.length}`);
  for (const r of refs) {
    assert.match(r, /^(record|rule|hindsight):/);
  }
});

test("CaseReviewPage: synthetic-data badge is always visible on the header", () => {
  const stored = makeStoredCase();
  const html = renderToStaticMarkup(
    createElement(CaseReviewPage, buildPageProps({ caseData: stored, knowledge: [] })),
  );
  assert.match(html, /data-badge="synthetic"/);
  assert.match(html, /Synthetic data/i);
});

test("CaseReviewPage: shows structured trace timeline with stage + function + duration", () => {
  const stored = makeStoredCase();
  const html = renderToStaticMarkup(
    createElement(CaseReviewPage, buildPageProps({ caseData: stored, knowledge: [] })),
  );
  assert.match(html, /data-component="event-timeline"/);
  assert.match(html, /data-stage="drafting"/);
  assert.match(html, /DraftDecision/);
  assert.match(html, /150\s*ms/);
});

test("CaseReviewPage: inbound email body and subject are rendered", () => {
  const html = renderToStaticMarkup(
    createElement(CaseReviewPage, buildPageProps({ knowledge: [] })),
  );
  assert.match(html, /Delay refund request/);
  assert.match(html, /delayed by 45 minutes/);
});

test("ApprovalCard: disabled when case state is not reviewable", () => {
  const html = renderToStaticMarkup(
    createElement(ApprovalCard, buildApprovalProps({ state: "running" })),
  );
  assert.match(html, /data-disabled="true"/);
  for (const action of ["approve", "reject", "edit"]) {
    assert.match(buttonTag(html, action), /disabled=""/, `${action} must be disabled`);
  }
});

test("ApprovalCard: enabled when case state is reviewable", () => {
  const html = renderToStaticMarkup(
    createElement(ApprovalCard, buildApprovalProps()),
  );
  assert.match(html, /data-disabled="false"/);
  assert.match(html, /Approve/);
  assert.match(html, /Request changes/);
  assert.match(html, /Reject/);
  assert.doesNotMatch(html, /data-action="approve"[^>]*disabled/);
});

test("ApprovalCard: escalated state offers a retry action instead of a dead end", () => {
  const html = renderToStaticMarkup(
    createElement(ApprovalCard, buildApprovalProps({ state: "escalated", onRetry: () => {} })),
  );
  assert.match(html, /Run the agent again/);
  assert.doesNotMatch(buttonTag(html, "retry"), /disabled=""/);
  assert.doesNotMatch(html, /data-action="approve"/);
});

test("ApprovalCard: error state offers a retry action", () => {
  const html = renderToStaticMarkup(
    createElement(ApprovalCard, buildApprovalProps({ state: "error", onRetry: () => {} })),
  );
  assert.match(html, /Run the agent again/);
  assert.match(html, /data-action="retry"/);
});

test("ApprovalCard: surfaces API error gracefully when feedback is empty on reject", () => {
  const html = renderToStaticMarkup(
    createElement(ApprovalCard, buildApprovalProps({ lastError: "feedback_required" })),
  );
  assert.match(html, /Feedback is required to reject/i);
});

test("ApprovalCard: surfaces max_revisions_reached error when edit limit is hit", () => {
  const html = renderToStaticMarkup(
    createElement(ApprovalCard, buildApprovalProps({ lastError: "max_revisions_reached" })),
  );
  assert.match(html, /One revision per case/i);
});

test("RejectDialogBody: confirm is blocked without feedback and enabled with feedback", () => {
  const blocked = renderToStaticMarkup(
    createElement(
      AlertDialog,
      { open: false },
      createElement(RejectDialogBody, {
        feedback: "",
        onFeedback: () => {},
        onConfirm: () => {},
        busy: false,
      }),
    ),
  );
  assert.match(buttonTag(blocked, "confirm-reject"), /disabled=""/);
  assert.match(blocked, /data-field="reject-feedback"/);

  const allowed = renderToStaticMarkup(
    createElement(
      AlertDialog,
      { open: false },
      createElement(RejectDialogBody, {
        feedback: "amount should match policy",
        onFeedback: () => {},
        onConfirm: () => {},
        busy: false,
      }),
    ),
  );
  assert.doesNotMatch(buttonTag(allowed, "confirm-reject"), /disabled=""/);
});

test("buildReviewInput: reject without feedback returns a validation error", () => {
  const form: ReviewFormState = { feedback: "", editedDraft: null };
  const result = buildReviewInput({
    action: "reject",
    caseId: "case-1",
    version: 2,
    form,
    baseDraft: makeDecision(),
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error, "feedback_required");
  }
});

test("buildReviewInput: reject with feedback builds a correct ReviewInput", () => {
  const form: ReviewFormState = { feedback: "amount should be 75", editedDraft: null };
  const result = buildReviewInput({
    action: "reject",
    caseId: "case-1",
    version: 2,
    form,
    baseDraft: makeDecision(),
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    const input: ReviewInput = result.value;
    assert.equal(input.action, "reject");
    assert.equal(input.caseId, "case-1");
    assert.equal(input.expectedVersion, 2);
    assert.equal(input.feedback, "amount should be 75");
    assert.equal(input.editedDraft, undefined);
  }
});

test("buildReviewInput: edit requires an edited draft", () => {
  const form: ReviewFormState = { feedback: "", editedDraft: null };
  const result = buildReviewInput({
    action: "edit",
    caseId: "case-1",
    version: 2,
    form,
    baseDraft: makeDecision(),
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error, "edited_draft_required");
  }
});

test("buildReviewInput: edit with a valid edited draft builds a correct ReviewInput", () => {
  const edited: DecisionDraft = {
    outcome: "refund",
    proposedAmount: 75,
    decisionBasis: [{ claim: "increased amount", evidenceRef: "rule:1.0.0:delay_30", note: "manual" }],
    response: "Refunding at 75% instead.",
    evidenceRefs: ["rule:1.0.0:delay_30"],
  };
  const form: ReviewFormState = { feedback: "", editedDraft: edited };
  const result = buildReviewInput({
    action: "edit",
    caseId: "case-1",
    version: 2,
    form,
    baseDraft: makeDecision(),
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.action, "edit");
    assert.deepEqual(result.value.editedDraft, edited);
  }
});

test("buildReviewInput: approve with no edits is a valid request", () => {
  const result = buildReviewInput({
    action: "approve",
    caseId: "case-1",
    version: 2,
    form: { feedback: "", editedDraft: null },
    baseDraft: makeDecision(),
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.action, "approve");
    assert.equal(result.value.feedback, undefined);
  }
});

test("ApprovalCard: editing shows the draft diff and save/cancel controls", () => {
  const decision = makeDecision();
  const edited = makeDecision({ proposedAmount: 75 });
  const html = renderToStaticMarkup(
    createElement(
      ApprovalCard,
      buildApprovalProps({
        editing: true,
        form: { feedback: "", editedDraft: edited },
        decision,
      }),
    ),
  );
  assert.match(html, /data-component="edit-surface"/);
  assert.match(html, /data-component="draft-diff" data-empty="false"/);
  assert.match(html, /data-action="save-edit"/);
  assert.match(html, /data-action="cancel-edit"/);
});

test("ApprovalCard: save-edit stays disabled while the draft is unchanged", () => {
  const decision = makeDecision();
  const html = renderToStaticMarkup(
    createElement(
      ApprovalCard,
      buildApprovalProps({
        editing: true,
        form: { feedback: "", editedDraft: { ...decision } },
        decision,
      }),
    ),
  );
  assert.match(buttonTag(html, "save-edit"), /disabled=""/);
});

test("EmailPanel: read-only mode shows the draft response as text, not an editor", () => {
  const html = renderToStaticMarkup(
    createElement(EmailPanel, {
      email: makeEmail(),
      claims: makeClaims(),
      decision: makeDecision(),
      editing: false,
      editedDraft: null,
      onChangeEditedDraft: () => {},
    }),
  );
  assert.match(html, /Refund approved at 50% of paid price\./);
  assert.doesNotMatch(html, /<textarea/);
});

test("EmailPanel: editing mode renders editable outcome, amount, and response fields", () => {
  const decision = makeDecision();
  const html = renderToStaticMarkup(
    createElement(EmailPanel, {
      email: makeEmail(),
      claims: makeClaims(),
      decision,
      editing: true,
      editedDraft: { ...decision },
      onChangeEditedDraft: () => {},
    }),
  );
  assert.match(html, /data-field="draft-outcome"/);
  assert.match(html, /data-field="draft-amount"/);
  assert.match(html, /<textarea[^>]*data-field="draft-response-text"/);
});

test("DraftDiff: renders before/after per changed field", () => {
  const html = renderToStaticMarkup(
    createElement(DraftDiff, {
      base: makeDecision(),
      edited: makeDecision({ proposedAmount: 75 }),
    }),
  );
  assert.match(html, /data-component="draft-diff" data-empty="false"/);
  assert.match(html, /data-label="Proposed amount"/);
  assert.match(html, /data-field="before"/);
  assert.match(html, /data-field="after"/);
});

test("EventTimeline: rows are clickable and the raw evidence sheet starts closed", () => {
  const stored = makeStoredCase();
  const events = stored.trace;
  const html = renderToStaticMarkup(
    createElement(EventTimeline, {
      events,
      onSelectEvent: () => undefined,
    }),
  );
  const eventMatch = /data-event-id="([^"]+)"/.exec(html);
  assert.ok(eventMatch, "events must render with data-event-id");
  const buttons = html.match(/data-action="open-evidence"/g) ?? [];
  assert.equal(buttons.length, events.length, "every trace row must carry an open-evidence button");
});

test("RawEvidenceSheet: opens for a selected event and closes via callback wiring", () => {
  const stored = makeStoredCase();
  const event = stored.trace[0];
  assert.ok(event);
  const closed = renderToStaticMarkup(
    createElement(RawEvidenceSheet, { event: null, onClose: () => {} }),
  );
  assert.match(closed, /data-component="raw-evidence-sheet"[^>]*data-open="false"/);
  const open = renderToStaticMarkup(
    createElement(RawEvidenceSheet, { event, onClose: () => {} }),
  );
  assert.match(open, /data-component="raw-evidence-sheet"[^>]*data-open="true"/);
  assert.match(open, new RegExp(`data-event-id="${event.id}"`));
});

test("ToolChip: shows function name and duration in ms", () => {
  const html = renderToStaticMarkup(
    createElement(ToolChip, { functionName: "DraftDecision", durationMs: 150, status: "completed" }),
  );
  assert.match(html, /DraftDecision/);
  assert.match(html, /150\s*ms/);
});

test("DecisionBasisList: renders each claim, evidence ref, and note", () => {
  const items: DecisionBasis[] = [
    { claim: "delay > 30 min", evidenceRef: "rule:1.0.0:delay_30", note: "auto" },
    { claim: "ticket exists", evidenceRef: "record:ticket:TKT-000001", note: "lookup" },
  ];
  const html = renderToStaticMarkup(createElement(DecisionBasisList, { items }));
  assert.match(html, /delay &gt; 30 min|delay > 30 min/);
  assert.match(html, /rule:1\.0\.0:delay_30/);
  assert.match(html, /record:ticket:TKT-000001/);
});

function makeReviewRecord(overrides: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    action: "approve",
    reviewer: "demo-reviewer",
    feedback: null,
    editedOutcome: null,
    editedAmount: null,
    timestamp: "2026-08-27T01:00:00.000Z",
    ...overrides,
  };
}

function makeLearningRecord(overrides: Partial<LearningRecord> = {}): LearningRecord {
  return {
    id: "learning-abc",
    caseId: "case-x",
    topic: "delay_refund",
    outcome: "refund",
    reviewerAction: "approve",
    originalDraftSummary: "outcome=refund amount=50 refs=2",
    finalDraftSummary: "outcome=refund amount=50 refs=2",
    changedGuidance: ["Reviewer approved the draft as written."],
    timestamp: "2026-08-27T01:00:00.000Z",
    ...overrides,
  };
}

test("CaseReviewPage: after approve, LearningResult shows the persisted learning summary", () => {
  const stored = makeStoredCase({
    state: "approved",
    reviewHistory: [makeReviewRecord()],
    learningRef: "learning-abc",
  });
  const record = makeLearningRecord({ caseId: stored.caseId, id: "learning-abc" });
  const html = renderToStaticMarkup(
    createElement(CaseReviewPage, buildPageProps({ caseData: stored, hindsight: [record] })),
  );
  assert.match(html, /data-component="learning-result"/);
  assert.match(html, /What the AI Agent learned/);
  assert.match(html, /Reviewer approved the draft as written/);
  assert.match(html, /data-field="action-badge"[^>]*data-action="approve"/);
  assert.match(html, /does not change deterministic eligibility/);
});

test("CaseReviewPage: undo control is visible after reject", () => {
  const stored = makeStoredCase({
    state: "rejected",
    reviewHistory: [makeReviewRecord({ action: "reject", feedback: "amount should match policy" })],
    learningRef: "learning-xyz",
  });
  const record = makeLearningRecord({
    caseId: stored.caseId,
    id: "learning-xyz",
    reviewerAction: "reject",
    outcome: "information",
    changedGuidance: ["reviewer feedback: amount should match policy"],
  });
  const html = renderToStaticMarkup(
    createElement(
      CaseReviewPage,
      buildPageProps({
        caseData: stored,
        hindsight: [record],
        onUndoLearning: async () => {},
      }),
    ),
  );
  assert.match(html, /data-action="undo-learning"/);
});

test("CaseReviewPage: undo control is visible after edit", () => {
  const stored = makeStoredCase({
    state: "revising",
    reviewHistory: [makeReviewRecord({ action: "edit", editedOutcome: "refund", editedAmount: 75 })],
    learningRef: "learning-edit",
  });
  const record = makeLearningRecord({
    caseId: stored.caseId,
    id: "learning-edit",
    reviewerAction: "edit",
    finalDraftSummary: "outcome=refund amount=75 refs=1",
    changedGuidance: ["amount changed from 50 to 75"],
  });
  const html = renderToStaticMarkup(
    createElement(
      CaseReviewPage,
      buildPageProps({
        caseData: stored,
        hindsight: [record],
        onUndoLearning: async () => {},
      }),
    ),
  );
  assert.match(html, /data-action="undo-learning"/);
});

test("CaseReviewPage: shows Hindsight unavailable warning when learning was not saved", () => {
  const stored = makeStoredCase({
    state: "rejected",
    reviewHistory: [makeReviewRecord({ action: "reject", feedback: "not eligible" })],
    learningRef: null,
  });
  const record = makeLearningRecord({
    caseId: stored.caseId,
    id: "learning-local-1",
    reviewerAction: "reject",
    outcome: "information",
    changedGuidance: ["reviewer feedback: not eligible"],
  });
  const html = renderToStaticMarkup(
    createElement(CaseReviewPage, buildPageProps({ caseData: stored, hindsight: [record] })),
  );
  assert.match(html, /data-field="learning-warning"/);
  assert.match(html, /Hindsight unavailable/);
});

function makeEvent(
  overrides: Partial<TraceEvent> & Pick<TraceEvent, "id" | "sequence" | "stage" | "status">,
): TraceEvent {
  return {
    caseId: "c-1",
    runId: "run-1",
    summary: "",
    functionName: null,
    recordRefs: [],
    evidenceRefs: [],
    durationMs: null,
    error: null,
    timestamp: "2026-08-27T00:00:00.000Z",
    ...overrides,
  };
}

test("EventTimeline: started and completed events for a stage fold into one completed row", () => {
  const events: TraceEvent[] = [
    makeEvent({ id: "e-1", sequence: 1, stage: "extracting_claims", status: "started", summary: "Understanding the claim…" }),
    makeEvent({ id: "e-2", sequence: 2, stage: "extracting_claims", status: "completed", summary: "Claims extracted", durationMs: 80 }),
  ];
  const html = renderToStaticMarkup(
    createElement(EventTimeline, { events, onSelectEvent: () => undefined }),
  );
  const rows = html.match(/data-stage="extracting_claims"/g) ?? [];
  assert.equal(rows.length, 1, "started and completed must render as a single row");
  assert.match(html, /data-status="completed"/);
  assert.doesNotMatch(html, /data-status="started"/, "no lingering spinner row once completed");
  assert.match(html, /Claims extracted/);
  assert.match(html, /80\s*ms/);
});

test("EventTimeline: a stage that starts again after closing opens a new row (revision rounds)", () => {
  const events: TraceEvent[] = [
    makeEvent({ id: "e-1", sequence: 1, stage: "drafting", status: "started" }),
    makeEvent({ id: "e-2", sequence: 2, stage: "drafting", status: "completed", summary: "First draft" }),
    makeEvent({ id: "e-3", sequence: 3, stage: "critiquing", status: "started" }),
    makeEvent({ id: "e-4", sequence: 4, stage: "critiquing", status: "completed", summary: "Critic flagged issues" }),
    makeEvent({ id: "e-5", sequence: 5, stage: "drafting", status: "started" }),
    makeEvent({ id: "e-6", sequence: 6, stage: "drafting", status: "completed", summary: "Revised draft" }),
  ];
  const html = renderToStaticMarkup(
    createElement(EventTimeline, { events, onSelectEvent: () => undefined }),
  );
  const draftingRows = html.match(/data-stage="drafting"/g) ?? [];
  assert.equal(draftingRows.length, 2, "each drafting round gets its own row");
  assert.doesNotMatch(html, /data-status="started"/, "every row resolved to a final status");
  assert.match(html, /First draft/);
  assert.match(html, /Revised draft/);
});

test("EventTimeline: reviewable events stay standalone rows", () => {
  const events: TraceEvent[] = [
    makeEvent({ id: "e-1", sequence: 1, stage: "drafting", status: "started" }),
    makeEvent({ id: "e-2", sequence: 2, stage: "drafting", status: "completed" }),
    makeEvent({ id: "e-3", sequence: 3, stage: "reviewable", status: "completed", summary: "Decision ready for review" }),
  ];
  const html = renderToStaticMarkup(
    createElement(EventTimeline, { events, onSelectEvent: () => undefined }),
  );
  const buttons = html.match(/data-action="open-evidence"/g) ?? [];
  assert.equal(buttons.length, 2, "folded drafting row plus standalone reviewable row");
  assert.match(html, /data-stage="reviewable" data-status="completed"/);
});

function makeFollowUpCase(): StoredCase {
  const missingFields = ["ticket_number", "departure_station"];
  const payloadClaims: ExtractedClaims = {
    requestedAction: "refund",
    claims: [],
    missingFields,
    referencedTicketNumbers: [],
    referencedStations: [],
  };
  const trace: TraceEvent[] = [
    makeEvent({
      id: "f-1",
      sequence: 1,
      stage: "extracting_claims",
      status: "completed",
      summary: "Claims extracted",
      payload: payloadClaims,
    }),
    makeEvent({
      id: "f-2",
      sequence: 2,
      stage: "reviewable",
      status: "completed",
      summary: "Follow-up required: ticket_number, departure_station",
      payload: { outcome: "follow_up", draft: null, rules: null, claims: payloadClaims, knowledgeCount: 0 },
    }),
  ];
  return makeStoredCase({ state: "reviewable", trace });
}

test("CaseReviewPage: follow-up case renders the question card with a question per missing field", () => {
  const stored = makeFollowUpCase();
  const html = renderToStaticMarkup(
    createElement(CaseReviewPage, buildPageProps({ caseData: stored })),
  );
  assert.match(html, /data-component="follow-up-card"/);
  assert.match(html, /The agent needs a hand/);
  assert.match(html, /Can you confirm the ticket number\?/);
  assert.match(html, /Can you confirm the departure station\?/);
  assert.doesNotMatch(html, /data-action="approve"/, "approve buttons are replaced by the question card");
});

test("CaseReviewPage: complete reviewable case keeps the approve buttons (no question card)", () => {
  const stored = makeStoredCase();
  const html = renderToStaticMarkup(
    createElement(CaseReviewPage, buildPageProps({ caseData: stored })),
  );
  assert.doesNotMatch(html, /data-component="follow-up-card"/);
  assert.match(html, /data-action="approve"/);
});

test("buildFollowUpQuestions: ticket-ish fields get ticket options, station-ish fields get stations, others free text", () => {
  const pkg = createDemoCase({ topic: "delay_refund", truthMode: "supported_by_records", seed: 7 });
  const questions = buildFollowUpQuestions(
    ["original_ticket_number", "departure_station", "journey_date"],
    pkg,
  );
  assert.equal(questions.length, 3);
  assert.deepEqual(questions[0]?.options, pkg.tickets.map((t) => t.id));
  assert.deepEqual(questions[1]?.options, [pkg.route.origin, pkg.route.destination]);
  assert.deepEqual(questions[2]?.options, []);
  assert.equal(questions[0]?.id, "original_ticket_number");
  assert.match(questions[0]?.q ?? "", /Can you confirm the original ticket number\?/);
});

test("buildFollowUpAnswers: radio picks one option, check joins selections and appends custom text", () => {
  const questions: FollowUpQuestion[] = [
    { id: "ticket_number", q: "?", type: "radio", options: ["TKT-1", "TKT-2"] },
    { id: "stations", q: "?", type: "check", options: ["Warszawa", "Krakow"] },
    { id: "journey_date", q: "?", type: "radio", options: [] },
  ];
  const answers = buildFollowUpAnswers(
    questions,
    { 0: [1], 1: [0, 1] },
    { 1: "Gdansk", 2: "2026-08-01" },
  );
  assert.deepEqual(answers, {
    ticket_number: "TKT-2",
    stations: "Warszawa, Krakow, Gdansk",
    journey_date: "2026-08-01",
  });
});

test("buildRunRequest: resume body is POSTed as JSON, plain run has no body", () => {
  const resume = buildRunRequest("case-1", { answers: { ticket_number: "TKT-000001" } });
  assert.equal(resume.url, "/api/cases/case-1/run");
  assert.equal(resume.init.method, "POST");
  const headers = resume.init.headers as Record<string, string>;
  assert.equal(headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(String(resume.init.body)), {
    answers: { ticket_number: "TKT-000001" },
  });

  const plain = buildRunRequest("case-1");
  assert.equal(plain.url, "/api/cases/case-1/run");
  assert.equal(plain.init.method, "POST");
  assert.equal(plain.init.body, undefined);
});
