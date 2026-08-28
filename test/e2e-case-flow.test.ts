import test from "node:test";
import assert from "node:assert/strict";

/* Fake LLM seams: setBamlClientForTesting (baml adapter) serves the EMAIL route;
 * RAILOPS_FAKE_LLM=1 (llm-resolver stub) serves the RUN route. */
process.env.RAILOPS_FAKE_LLM = "1";
delete process.env.RAILOPS_DATA_DIR;

import { POST as emailRoute } from "../app/api/cases/email/route.ts";
import { POST as runCaseStream } from "../app/api/cases/[id]/run/route.ts";
import { createDemoCase } from "../lib/domain/case-factory.ts";
import {
  resetBamlClientForTesting,
  setBamlClientForTesting,
  type EmailDraft,
  type RawBamlCaller,
} from "../lib/llm/baml.ts";
import type { DecisionDraft } from "../lib/llm/types.ts";
import { applyReview, applyRevertLearning } from "../lib/pipeline/review.ts";
import {
  readBrowserState,
  updateBrowserState,
  type KeyValueStorage,
} from "../lib/storage/browser-store.ts";
import { resetState } from "../lib/storage/store.ts";
import type { StoredCase, TraceEvent } from "../lib/storage/types.ts";

const CANNED_EMAIL: EmailDraft = {
  subject: "Re: delay refund",
  body: "Hello, my train was delayed and I would like a refund.",
  mentionedFacts: ["record:ticket:TKT-000001"],
};

function makeRawCaller(): RawBamlCaller {
  const unused = async (): Promise<never> => {
    throw new Error("unused — RAILOPS_FAKE_LLM owns the run pipeline");
  };
  return {
    GenerateCustomerEmail: async () => ({ ...CANNED_EMAIL }),
    ExtractCaseClaims: unused,
    DraftDecision: unused,
    CritiqueDecision: unused,
  };
}

function makeJsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function callEmailRoute(body: unknown): Promise<Response> {
  return emailRoute(makeJsonRequest("http://localhost/api/cases/email", body));
}

async function callRunRoute(id: string, body: unknown): Promise<Response> {
  return runCaseStream(makeJsonRequest(`http://localhost/api/cases/${id}/run`, body), {
    params: Promise.resolve({ id }),
  });
}

type DoneFrame = { type: "done"; stored: StoredCase; events: TraceEvent[] };

async function readSseStream(response: Response): Promise<{
  events: TraceEvent[];
  done: DoneFrame | null;
}> {
  assert.ok(response.body, "response must have a body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const events: TraceEvent[] = [];
  let done: DoneFrame | null = null;
  const pushPayload = (payload: string): void => {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    if (parsed.type === "done") {
      done = parsed as unknown as DoneFrame;
    } else if (parsed.type !== "stream") {
      events.push(parsed as unknown as TraceEvent);
    }
  };
  let buffer = "";
  for (;;) {
    const { value, done: readerDone } = await reader.read();
    if (readerDone) break;
    buffer += decoder.decode(value, { stream: true });
    let sepIdx = buffer.indexOf("\n\n");
    while (sepIdx >= 0) {
      const chunk = buffer.slice(0, sepIdx);
      buffer = buffer.slice(sepIdx + 2);
      for (const line of chunk.split("\n")) {
        if (line.startsWith("data:")) {
          const payload = line.slice(5).trim();
          if (payload.length > 0) pushPayload(payload);
        }
      }
      sepIdx = buffer.indexOf("\n\n");
    }
  }
  return { events, done };
}

function makeFakeBrowserStorage(): KeyValueStorage {
  const raw = new Map<string, string>();
  return {
    getItem: (key) => raw.get(key) ?? null,
    setItem: (key, value) => {
      raw.set(key, value);
    },
    removeItem: (key) => {
      raw.delete(key);
    },
  };
}

const browser = makeFakeBrowserStorage();

const journey: {
  caseId: string;
  rejectLearningId: string;
  approveLearningId: string;
} = {
  caseId: "",
  rejectLearningId: "",
  approveLearningId: "",
};

function browserCase(): StoredCase {
  const stored = readBrowserState(browser).cases.find((c) => c.caseId === journey.caseId);
  assert.ok(stored, "case must exist in browser storage");
  return stored;
}

function browserCaseEvents(): TraceEvent[] {
  return readBrowserState(browser).events.filter((e) => e.caseId === journey.caseId);
}

// mirrors components/review/case-review-page.tsx:140-150 (onDone) — keep in sync
function applyDoneFrame(done: DoneFrame): void {
  updateBrowserState(
    (s) => ({
      ...s,
      events: [...s.events.filter((e) => e.caseId !== done.stored.caseId), ...done.events],
      cases: s.cases.some((c) => c.caseId === done.stored.caseId)
        ? s.cases.map((c) => (c.caseId === done.stored.caseId ? done.stored : c))
        : [...s.cases, done.stored],
    }),
    browser,
  );
}

async function runFromBrowser(): Promise<{ streamed: TraceEvent[]; done: DoneFrame }> {
  const stored = browserCase();
  const events = browserCaseEvents();
  const body: Record<string, unknown> = { stored };
  if (events.length > 0) body.events = events;
  const res = await callRunRoute(stored.caseId, body);
  assert.equal(res.status, 200);
  const parsed = await readSseStream(res);
  assert.ok(parsed.done, "run must end with a done frame");
  applyDoneFrame(parsed.done);
  return { streamed: parsed.events, done: parsed.done };
}

// mirrors app/case/[id]/page.tsx:229-232 (caseEvents merge) — keep in sync
function mergedTimeline(): TraceEvent[] {
  const state = readBrowserState(browser);
  const stored = state.cases.find((c) => c.caseId === journey.caseId);
  assert.ok(stored, "case must exist in browser storage");
  return [
    ...state.events.filter((e) => e.caseId === journey.caseId),
    ...stored.trace.filter((e) => !state.events.some((s) => s.id === e.id)),
  ].sort((a, b) => a.sequence - b.sequence || a.timestamp.localeCompare(b.timestamp));
}

test.beforeEach(() => {
  resetState();
  setBamlClientForTesting(makeRawCaller());
  // browser storage is deliberately NOT reset here: journey state carries across tests
});

test.afterEach(() => {
  resetState();
  resetBamlClientForTesting();
});

test("e2e create: email route + dialog assembly writes the case to browser storage", async () => {
  const seed = 11;
  const pkg = createDemoCase({ topic: "delay_refund", truthMode: "supported_by_records", seed });
  journey.caseId = pkg.id;

  const res = await callEmailRoute({ topic: pkg.topic, truthMode: pkg.truthMode, seed });
  assert.equal(res.status, 200);
  const data = (await res.json()) as { email?: EmailDraft | null };
  assert.ok(data.email, "email route returns a generated email");
  assert.deepEqual(data.email, CANNED_EMAIL);

  const now = new Date().toISOString();
  // mirrors components/cases/create-case-dialog.tsx:223-246 — keep in sync
  const stored: StoredCase = {
    caseId: pkg.id,
    topic: pkg.topic,
    truthMode: pkg.truthMode,
    state: "created",
    createdAt: now,
    updatedAt: now,
    seed,
    pkg,
    trace: [],
    reviewHistory: [],
    learningRef: null,
    email: {
      from: pkg.account.email,
      subject: data.email.subject,
      body: data.email.body,
      mentionedFacts: data.email.mentionedFacts,
      receivedAt: now,
    },
    emailError: null,
    supplements: {},
    version: 1,
  };
  updateBrowserState((s) => ({ ...s, cases: [...s.cases, stored] }), browser);

  const fresh = readBrowserState(browser);
  assert.equal(fresh.cases.length, 1, "case persisted to browser storage");
  const saved = fresh.cases[0];
  assert.equal(saved?.caseId, pkg.id);
  assert.equal(saved?.state, "created");
  assert.equal(saved?.version, 1);
  assert.equal(saved?.email?.from, pkg.account.email, "email comes from the passenger account");
  assert.equal(saved?.email?.subject, CANNED_EMAIL.subject);
  assert.equal(saved?.email?.body, CANNED_EMAIL.body);
  assert.deepEqual(fresh.events, [], "no events before the first run");
});

test("e2e run: stored case from the browser streams to reviewable and onDone persists it back", async () => {
  const { streamed, done } = await runFromBrowser();
  assert.ok(streamed.length > 0, "trace events streamed");
  const firstStreamed = streamed.reduce((a, b) => (a.sequence <= b.sequence ? a : b));
  assert.equal(firstStreamed.stage, "reading_email", "stream starts at reading_email");
  assert.equal(firstStreamed.sequence, 1, "first run starts at sequence 1");
  assert.equal(done.stored.state, "reviewable", "fake-LLM run ends reviewable");
  assert.equal(done.stored.version, 2, "run bumps the version");

  const fresh = readBrowserState(browser);
  const stored = fresh.cases.find((c) => c.caseId === journey.caseId);
  assert.ok(stored, "case still present in browser storage after onDone");
  assert.equal(stored?.state, "reviewable");
  assert.equal(stored?.version, 2);

  const events = fresh.events.filter((e) => e.caseId === journey.caseId);
  assert.ok(events.length >= 10, "run events persisted to browser storage");
  assert.deepEqual(
    events.map((e) => e.id).sort(),
    done.events.map((e) => e.id).sort(),
    "browser events match the done frame exactly",
  );
  assert.ok(
    events.every((e) => e.status !== "failed"),
    "no stage failed on the happy path",
  );

  const draftEvent = events.find((e) => e.stage === "drafting" && e.status === "completed");
  assert.ok(draftEvent, "decision draft present in persisted events");
  const draft = draftEvent!.payload as DecisionDraft;
  assert.equal(draft.outcome, "information", "fake LLM draft outcome flows through");
  assert.equal(draft.proposedAmount, null);
  assert.ok(draft.evidenceRefs.length > 0, "draft carries evidence refs");
});

test("e2e reload: timeline rebuilt from browser storage is complete and ordered", () => {
  const timeline = mergedTimeline();
  const order = timeline.map((e) => `${e.stage}:${e.status}`);
  const readingDone = order.indexOf("reading_email:completed");
  const locatingDone = order.indexOf("locating_account:completed");
  const claimsStart = order.indexOf("extracting_claims:started");
  assert.ok(readingDone >= 0, "reading_email stage ran");
  assert.ok(locatingDone > readingDone, "locating_account runs after reading_email");
  assert.ok(claimsStart > locatingDone, "claims extraction runs after locating_account");
  const knowledgeDone = order.indexOf("retrieving_knowledge:completed");
  const recordsStart = order.indexOf("checking_records:started");
  assert.ok(knowledgeDone >= 0, "knowledge retrieval ran");
  assert.ok(recordsStart > knowledgeDone, "knowledge retrieval completes before record check starts");
  assert.ok(order.includes("evaluating_rules:completed"), "rules evaluation completed");
  assert.ok(order.includes("drafting:completed"), "drafting completed");
  assert.ok(order.includes("critiquing:completed"), "critique completed");
  const last = timeline[timeline.length - 1];
  assert.equal(last?.stage, "reviewable");
  assert.equal(last?.status, "completed");
  assert.equal(
    (last?.payload as { outcome?: string } | undefined)?.outcome,
    "reviewable",
    "final event marks the case reviewable",
  );
});

test("e2e review reject: client-side review stores learning locally while Hindsight is paused", async () => {
  const current = readBrowserState(browser);
  const stored = current.cases.find((c) => c.caseId === journey.caseId);
  assert.ok(stored);
  const feedback = "Amount must follow the recorded delay tier, not the claimed minutes.";
  const { state: next, updatedCase } = await applyReview(
    current,
    { caseId: journey.caseId, action: "reject", feedback, expectedVersion: stored!.version },
    { memoryClient: null },
  );
  updateBrowserState(() => next, browser);

  assert.equal(updatedCase.state, "rejected");
  assert.equal(updatedCase.version, stored!.version + 1);
  assert.equal(updatedCase.reviewHistory.length, 1);
  assert.equal(updatedCase.reviewHistory[0]?.action, "reject");
  assert.equal(updatedCase.learningRef, null, "no Hindsight memory id while paused");

  const fresh = readBrowserState(browser);
  assert.equal(fresh.learning.length, 1, "learning record kept in browser state");
  const learning = fresh.learning[0]!;
  assert.ok(learning.id, "learning record has a local id");
  journey.rejectLearningId = learning.id;
  assert.equal(learning.caseId, journey.caseId);
  assert.equal(learning.reviewerAction, "reject");
  assert.equal(learning.feedback, feedback, "reviewer feedback stored verbatim");

  const reviewEvent = updatedCase.trace.find(
    (e) => e.stage === "reviewable" && e.status === "completed",
  );
  assert.ok(reviewEvent, "review event recorded in case trace");
  assert.equal((reviewEvent!.payload as { action?: string } | undefined)?.action, "reject");
  assert.ok(
    fresh.events.some((e) => e.id === reviewEvent!.id),
    "review event also lands in state.events",
  );

  const learningSaved = updatedCase.trace.find((e) => e.stage === "learning_saved");
  assert.ok(learningSaved, "learning_saved event recorded");
  assert.equal(
    learningSaved?.status,
    "failed",
    "Hindsight paused means learning_saved fails gracefully",
  );
  assert.equal(learningSaved?.error, "hindsight_unavailable");
});

test("e2e re-run after rejection: sequences continue and history survives the replace", async () => {
  const priorEvents = browserCaseEvents();
  const priorIds = new Set(priorEvents.map((e) => e.id));
  const priorMax = Math.max(...priorEvents.map((e) => e.sequence));

  const { done } = await runFromBrowser();
  assert.equal(done.stored.state, "reviewable", "re-run brings the rejected case back to reviewable");
  assert.equal(done.stored.version, 4, "re-run bumps the version again");

  for (const prior of priorEvents) {
    assert.ok(
      done.events.some((e) => e.id === prior.id),
      `done frame must keep prior event ${prior.id} (replace semantics)`,
    );
  }
  const freshEvents = done.events.filter((e) => !priorIds.has(e.id));
  assert.ok(freshEvents.length > 0, "re-run adds new events");
  for (const ev of freshEvents) {
    assert.ok(
      ev.sequence > priorMax,
      `fresh event sequence must continue after ${priorMax}, got ${ev.sequence}`,
    );
  }

  const events = browserCaseEvents();
  const sequences = events.map((e) => e.sequence);
  assert.equal(new Set(sequences).size, sequences.length, "sequences stay unique after replace");
  assert.ok(Math.max(...sequences) > priorMax, "max sequence grows");

  const timeline = mergedTimeline();
  assert.ok(
    timeline.some(
      (e) =>
        e.stage === "reviewable" &&
        e.status === "completed" &&
        (e.payload as { action?: string } | undefined)?.action === "reject",
    ),
    "reject review event still in the merged timeline",
  );
  const drafts = timeline.filter((e) => e.stage === "drafting" && e.status === "completed");
  assert.ok(drafts.length >= 2, "both runs produced a decision draft");
  assert.ok(
    timeline.every((e) => e.status !== "failed" || e.stage === "learning_saved"),
    "only the expected hindsight failure is present",
  );
});

test("e2e review approve: approved state with a local learning record", async () => {
  const current = readBrowserState(browser);
  const stored = current.cases.find((c) => c.caseId === journey.caseId);
  assert.ok(stored);
  assert.equal(stored?.state, "reviewable");
  const { state: next, updatedCase } = await applyReview(
    current,
    { caseId: journey.caseId, action: "approve", expectedVersion: stored!.version },
    { memoryClient: null },
  );
  updateBrowserState(() => next, browser);

  assert.equal(updatedCase.state, "approved");
  assert.equal(updatedCase.version, 5);
  assert.equal(updatedCase.reviewHistory.map((r) => r.action).join(","), "reject,approve");
  assert.equal(updatedCase.learningRef, null, "still no Hindsight memory id while paused");

  const fresh = readBrowserState(browser);
  assert.equal(fresh.learning.length, 2, "both reviews stored learning records");
  const approveLearning = fresh.learning.find((r) => r.reviewerAction === "approve");
  assert.ok(approveLearning, "approve learning record present");
  assert.ok(approveLearning!.id, "approve learning record has a local id");
  journey.approveLearningId = approveLearning!.id;
  assert.equal(approveLearning?.outcome, "information", "learning outcome follows the fake draft");

  const saved = updatedCase.trace.find((e) => e.stage === "learning_saved" && e.status === "failed");
  assert.ok(saved, "learning_saved fails gracefully while Hindsight is paused");
  assert.equal(saved?.error, "hindsight_unavailable");
});

test("e2e revert learning: record removed from browser state and learningRef cleared", async () => {
  const current = readBrowserState(browser);
  const result = await applyRevertLearning(current, journey.approveLearningId, {
    memoryClient: null,
  });
  assert.equal(result.undone, true);
  assert.equal(result.error, null);
  updateBrowserState(() => result.state, browser);

  const fresh = readBrowserState(browser);
  assert.equal(fresh.learning.length, 1, "only the reject learning record remains");
  assert.equal(fresh.learning[0]?.id, journey.rejectLearningId);
  assert.ok(!fresh.learning.some((r) => r.id === journey.approveLearningId));
  const stored = fresh.cases.find((c) => c.caseId === journey.caseId);
  // trivially true while Hindsight is paused; owner/undo path covered in test/memory.test.ts:663-689
  assert.equal(stored?.learningRef, null);
  assert.equal(stored?.state, "approved", "reverting learning does not change the review outcome");
});
