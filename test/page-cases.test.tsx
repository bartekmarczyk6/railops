import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

process.env.RAILOPS_DATA_DIR ??= "";
process.env.RAILOPS_FAKE_LLM ??= "1";

import { Dashboard } from "../components/dashboard.tsx";
import { CreateCaseDialog } from "../components/cases/create-case-dialog.tsx";
import { EmptyOnboarding } from "../components/cases/empty-onboarding.tsx";
import { CaseList } from "../components/cases/case-list.tsx";
import { CaseStatusPill } from "../components/cases/case-status.tsx";
import { ReviewerAlignmentChart } from "../components/charts/reviewer-alignment-chart.tsx";
import { OutcomeDistributionChart } from "../components/charts/outcome-distribution-chart.tsx";
import { computeDashboardData, type DashboardData } from "../app/dashboard-data.ts";
import type { StoredCase } from "../lib/storage/types.ts";

function makeCase(overrides: Partial<StoredCase> = {}): StoredCase {
  const now = "2026-06-15T12:00:00.000Z";
  return {
    caseId: "c-1",
    topic: "delay_refund",
    truthMode: "supported_by_records",
    state: "reviewable",
    createdAt: now,
    updatedAt: now,
    seed: 1,
    pkg: {
      id: "c-1",
      seed: 1,
      topic: "delay_refund",
      truthMode: "supported_by_records",
      account: {
        id: "a-1",
        email: "alice@example.com",
        fullName: "Alice Nowak",
        status: "active",
        priorCaseCount: 0,
        createdAt: now,
      },
      tickets: [],
      payments: [],
      route: {
        id: "r-1",
        origin: "Warszawa",
        destination: "Krakow",
        scheduledDeparture: now,
        scheduledArrival: now,
        actualDeparture: null,
        actualArrival: null,
        operator: "PKP",
      },
      disruption: null,
      expected: {
        claimTopic: "delay_refund",
        truthMode: "supported_by_records",
        referencedTicketNumbers: [],
        referencedPassengerNames: [],
        referencedStationPair: null,
        claimedDelayMinutes: 30,
        actualDelayMinutes: 30,
        claimedPrice: 100,
        actualPrice: 100,
        actualOrigin: "Warszawa",
        actualDestination: "Krakow",
        missingFields: [],
        contradictionDetected: false,
        fabricationsDetected: [],
        passengerNameMatchesOwner: true,
        ticketExistsForClaim: true,
      },
      createdAt: now,
    },
    trace: [],
    reviewHistory: [],
    learningRef: null,
    version: 1,
    ...overrides,
  };
}

function dataFor(cases: StoredCase[]): DashboardData {
  return computeDashboardData(cases);
}

test("empty state: 0 cases renders onboarding with Create demo case button", () => {
  const html = renderToStaticMarkup(createElement(Dashboard, { data: dataFor([]) }));
  assert.match(html, /Demo Cases/);
  assert.match(html, /Create demo case/i);
  assert.match(html, /Synthetic/);
  assert.match(html, /data-testid="empty-onboarding"/);
  assert.doesNotMatch(html, /data-testid="case-row-/);
});

test("empty onboarding exposes primary CTA and a three-step tour", () => {
  const html = renderToStaticMarkup(createElement(EmptyOnboarding, { onCreate: () => {} }));
  assert.match(html, /Create demo case/);
  const tourSteps = html.match(/data-tour-step="/g) ?? [];
  assert.equal(tourSteps.length, 3, "must show three tour steps");
});

test("create dialog: opens with exactly two labelled dropdowns, submit disabled until both are set", () => {
  const html = renderToStaticMarkup(
    createElement(CreateCaseDialog, { open: true, onCreated: () => {} }),
  );
  const labels = html.match(/data-select-for="(topic|truthMode)"/g) ?? [];
  assert.equal(labels.length, 2, "must render exactly two labelled dropdowns");
  assert.match(html, /data-testid="topic-select"/);
  assert.match(html, /data-testid="truthmode-select"/);
  assert.match(html, /data-testid="create-submit"[^>]*disabled/);
});

test("case list: each row shows id, topic, truth mode, status, reviewer outcome, learning state, created time", () => {
  const cases = [
    makeCase({ caseId: "c-1", topic: "delay_refund", truthMode: "supported_by_records", state: "reviewable" }),
    makeCase({ caseId: "c-2", topic: "cancelled_train_refund", truthMode: "fabricated_delay", state: "approved" }),
  ];
  const html = renderToStaticMarkup(createElement(CaseList, { cases, onOpen: () => {} }));
  assert.match(html, /c-1/);
  assert.match(html, /c-2/);
  assert.match(html, /Delay refund/);
  assert.match(html, /Cancelled train refund/);
  assert.match(html, /Supported by records/);
  assert.match(html, /Fabricated delay/);
  assert.match(html, /data-testid="case-row-c-1"/);
  assert.match(html, /data-testid="case-row-c-2"/);
  assert.match(html, /data-testid="created-time-c-1"/);
});

test("case status pill: icon + text, not color alone", () => {
  const html = renderToStaticMarkup(createElement(CaseStatusPill, { state: "reviewable" }));
  assert.match(html, /aria-label="Case is ready for review"/);
  assert.match(html, /Reviewable/);
  assert.match(html, /data-icon="check"/);
});

test("reviewer alignment chart: hidden when no reviewed cases exist", () => {
  const html = renderToStaticMarkup(createElement(ReviewerAlignmentChart, { data: [] }));
  assert.equal(html.trim(), "", "must render nothing when there is no data");
});

test("reviewer alignment chart: renders SVG and accessible table summary when at least one point exists", () => {
  const html = renderToStaticMarkup(
    createElement(ReviewerAlignmentChart, {
      data: [
        { caseSeq: 1, alignment: 0.8 },
        { caseSeq: 2, alignment: 1 },
        { caseSeq: 3, alignment: 0.4 },
      ],
    }),
  );
  assert.match(html, /<svg/);
  assert.match(html, /class="sr-only"/);
  assert.match(html, /Reviewer alignment over case sequence/);
  assert.match(html, /0\.8/);
});

test("outcome distribution chart: hidden when no reviewed cases exist", () => {
  const html = renderToStaticMarkup(createElement(OutcomeDistributionChart, { data: [] }));
  assert.equal(html.trim(), "");
});

test("outcome distribution chart: renders SVG and accessible table summary", () => {
  const html = renderToStaticMarkup(
    createElement(OutcomeDistributionChart, {
      data: [
        { outcome: "refund", count: 3 },
        { outcome: "information", count: 2 },
      ],
    }),
  );
  assert.match(html, /<svg/);
  assert.match(html, /class="sr-only"/);
  assert.match(html, /Outcome distribution/);
  assert.match(html, /refund/);
  assert.match(html, /3/);
  assert.match(html, /2/);
});

test("dashboard renders cases, status pills, and both charts when reviewed cases exist", () => {
  const cases = [
    makeCase({
      caseId: "c-1",
      topic: "delay_refund",
      truthMode: "supported_by_records",
      state: "approved",
      reviewHistory: [
        { action: "approve", reviewer: "demo", feedback: null, editedOutcome: null, editedAmount: null, timestamp: "2026-06-15T12:00:00.000Z" },
      ],
    }),
    makeCase({
      caseId: "c-2",
      topic: "cancelled_train_refund",
      truthMode: "fabricated_delay",
      state: "rejected",
      reviewHistory: [
        { action: "reject", reviewer: "demo", feedback: "x", editedOutcome: null, editedAmount: null, timestamp: "2026-06-15T12:00:00.000Z" },
      ],
    }),
  ];
  const html = renderToStaticMarkup(createElement(Dashboard, { data: dataFor(cases) }));
  assert.match(html, /data-testid="case-row-c-1"/);
  assert.match(html, /data-testid="case-row-c-2"/);
  assert.match(html, /Reviewer alignment over case sequence/);
  assert.match(html, /Outcome distribution/);
});

test("dashboard hides charts when zero reviewed cases", () => {
  const cases = [makeCase({ caseId: "c-1", state: "created" })];
  const html = renderToStaticMarkup(createElement(Dashboard, { data: dataFor(cases) }));
  assert.doesNotMatch(html, /Reviewer alignment over case sequence/);
  assert.doesNotMatch(html, /Outcome distribution/);
});
