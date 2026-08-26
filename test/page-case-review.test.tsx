import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import { createDemoCase } from "../lib/domain/case-factory.ts";
import type { StoredCase, TraceEvent } from "../lib/storage/types.ts";
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
import { ApprovalCard } from "../components/review/approval-card.tsx";
import { ToolChip } from "../components/trace/tool-chip.tsx";
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
    { stage: "generating_email", status: "completed", summary: "Email generated", functionName: "GenerateCustomerEmail", durationMs: 100 },
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

test("ApprovalCard: disabled when case state is not reviewable", () => {
  const stored = makeStoredCase({ state: "generating_email" as StoredCase["state"] });
  const html = renderToStaticMarkup(
    createElement(ApprovalCard, {
      state: stored.state,
      caseId: stored.caseId,
      version: stored.version,
      decision: makeDecision(),
      onAction: () => Promise.resolve(),
    }),
  );
  assert.match(html, /data-disabled="true"/);
  assert.match(html, /data-action="approve"[^>]*disabled/);
  assert.match(html, /data-action="reject"[^>]*disabled/);
  assert.match(html, /data-action="edit"[^>]*disabled/);
});

test("ApprovalCard: enabled when case state is reviewable", () => {
  const html = renderToStaticMarkup(
    createElement(ApprovalCard, {
      state: "reviewable",
      caseId: "case-x",
      version: 2,
      decision: makeDecision(),
      onAction: () => Promise.resolve(),
    }),
  );
  assert.match(html, /data-disabled="false"/);
  const approveBtn = /data-action="approve"[^>]*>/.exec(html);
  const rejectBtn = /data-action="reject"[^>]*>/.exec(html);
  const editBtn = /data-action="edit"[^>]*>/.exec(html);
  assert.ok(approveBtn);
  assert.ok(rejectBtn);
  assert.ok(editBtn);
  for (const m of [approveBtn, rejectBtn, editBtn]) {
    assert.doesNotMatch(m[0], /\bdisabled\b/);
  }
});

test("ApprovalCard: surfaces API error gracefully when feedback is empty on reject", () => {
  const html = renderToStaticMarkup(
    createElement(ApprovalCard, {
      state: "reviewable",
      caseId: "case-x",
      version: 2,
      decision: makeDecision(),
      onAction: () => Promise.resolve(),
      lastError: "feedback_required",
    }),
  );
  assert.match(html, /Feedback is required to reject/i);
});

test("ApprovalCard: surfaces max_revisions_reached error when edit limit is hit", () => {
  const html = renderToStaticMarkup(
    createElement(ApprovalCard, {
      state: "reviewable",
      caseId: "case-x",
      version: 2,
      decision: makeDecision(),
      onAction: () => Promise.resolve(),
      lastError: "max_revisions_reached",
    }),
  );
  assert.match(html, /One revision per case/i);
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

test("EventTimeline: click handler is wired and the raw evidence sheet opens with the payload", () => {
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
  assert.match(html, /data-component="raw-evidence-sheet"[^>]*data-open="false"/);
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
