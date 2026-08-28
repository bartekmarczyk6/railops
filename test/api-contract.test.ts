import test from "node:test";
import assert from "node:assert/strict";

process.env.RAILOPS_FAKE_LLM = "1";
delete process.env.RAILOPS_DATA_DIR;

import { POST as emailRoute } from "../app/api/cases/email/route.ts";
import { POST as runCaseStream } from "../app/api/cases/[id]/run/route.ts";
import { POST as rewriteRoute } from "../app/api/cases/[id]/rewrite/route.ts";
import { createDemoCase } from "../lib/domain/case-factory.ts";
import {
  resetBamlClientForTesting,
  setBamlClientForTesting,
  type EmailDraft,
  type RawBamlCaller,
} from "../lib/llm/baml.ts";
import { resetLlmClientForTesting } from "../lib/pipeline/llm-resolver.ts";
import { resetState } from "../lib/storage/store.ts";
import type { StoredCase, TraceEvent } from "../lib/storage/types.ts";

const SECRET_PATTERNS = [
  /gsk_[A-Za-z0-9_-]{6,}/,
  /sk-[A-Za-z0-9]{6,}/,
  /PLK_API_KEY/,
  /GROQ_API_KEY/,
  /HINDSIGHT_API_KEY/,
  /HINDSIGHT_API_URL/,
];

function bodyContainsSecret(body: string): boolean {
  for (const pat of SECRET_PATTERNS) {
    if (pat.test(body)) return true;
  }
  return false;
}

function makeJsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeRawRequest(url: string, body: string): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

function paramsPromise<T>(value: T): Promise<T> {
  return Promise.resolve(value);
}

const CANNED_EMAIL: EmailDraft = {
  subject: "Re: delay refund",
  body: "Hello, my train was delayed and I would like a refund.",
  mentionedFacts: ["record:ticket:TKT-000001"],
};

function makeRawCaller(overrides: Partial<RawBamlCaller> = {}): RawBamlCaller {
  const claims = {
    requestedAction: "refund",
    claims: [],
    missingFields: [],
    referencedTicketNumbers: ["TKT-000001"],
    referencedStations: ["Warszawa Centralna", "Krakow Glowny"],
  };
  const decision = {
    outcome: "Refund",
    proposedAmount: 100,
    decisionBasis: [
      { claim: "delay", evidenceRef: "rule:v1:delay-30", note: "delay exceeds 30 minutes" },
    ],
    response: "Refund approved",
    evidenceRefs: ["rule:v1:delay-30", "record:ticket:TKT-000001"],
  };
  const critique = {
    passed: true,
    findings: [],
    correctedDraft: null,
  };
  return {
    GenerateCustomerEmail: overrides.GenerateCustomerEmail ?? (async () => ({ ...CANNED_EMAIL })),
    ExtractCaseClaims: overrides.ExtractCaseClaims ?? (async () => claims),
    DraftDecision: overrides.DraftDecision ?? (async () => decision),
    CritiqueDecision: overrides.CritiqueDecision ?? (async () => critique),
    RewriteResponseText:
      overrides.RewriteResponseText ?? (async () => ({ rewrittenSelection: "Rewritten." })),
  };
}

function makeStoredCase(): StoredCase {
  const seed = 42;
  const pkg = createDemoCase({
    topic: "delay_refund",
    truthMode: "supported_by_records",
    seed,
  });
  const now = new Date().toISOString();
  return {
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
      subject: CANNED_EMAIL.subject,
      body: CANNED_EMAIL.body,
      mentionedFacts: CANNED_EMAIL.mentionedFacts,
      receivedAt: now,
    },
    emailError: null,
    supplements: {},
    version: 1,
  };
}

type DoneFrame = { type: "done"; stored: StoredCase; events: TraceEvent[] };
type StreamFrameShape = { type: "stream"; stage: string; partial: Record<string, unknown> };

function makePriorFollowUpEvents(caseId: string): TraceEvent[] {
  const runId = "run-prior";
  const timestamp = new Date().toISOString();
  return [
    {
      id: "ev-claims",
      caseId,
      runId,
      sequence: 1,
      stage: "extracting_claims",
      status: "completed",
      summary: "Extracted 1 claims; 1 missing",
      functionName: "ExtractCaseClaims",
      recordRefs: [],
      evidenceRefs: [],
      durationMs: null,
      error: null,
      timestamp,
      payload: {
        requestedAction: "refund",
        claims: [{ kind: "delay_minutes", description: "Claimed 45 minute delay", value: 45 }],
        missingFields: ["claimed_delay_minutes"],
        referencedTicketNumbers: [],
        referencedStations: [],
      },
    },
    {
      id: "ev-records",
      caseId,
      runId,
      sequence: 2,
      stage: "checking_records",
      status: "completed",
      summary: "Captured record references",
      functionName: "collectRecordRefs",
      recordRefs: ["record:route:R-1"],
      evidenceRefs: [],
      durationMs: null,
      error: null,
      timestamp,
    },
    {
      id: "ev-reviewable",
      caseId,
      runId,
      sequence: 3,
      stage: "reviewable",
      status: "completed",
      summary: "Follow-up required: claimed_delay_minutes",
      functionName: null,
      recordRefs: [],
      evidenceRefs: [],
      durationMs: null,
      error: null,
      timestamp,
      payload: { outcome: "follow_up" },
    },
  ];
}

async function readSseStream(response: Response): Promise<{
  events: TraceEvent[];
  streamFrames: StreamFrameShape[];
  done: DoneFrame | null;
  lastPayloadType: string | null;
}> {
  assert.ok(response.body, "response must have a body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const events: TraceEvent[] = [];
  const streamFrames: StreamFrameShape[] = [];
  let done: DoneFrame | null = null;
  let lastPayloadType: string | null = null;
  const pushPayload = (payload: string): void => {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    lastPayloadType = typeof parsed.type === "string" ? parsed.type : "trace";
    if (parsed.type === "stream") {
      streamFrames.push(parsed as unknown as StreamFrameShape);
    } else if (parsed.type === "done") {
      done = parsed as unknown as DoneFrame;
    } else {
      events.push(parsed as unknown as TraceEvent);
    }
  };
  let buffer = "";
  while (true) {
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
          if (payload.length > 0) {
            pushPayload(payload);
          }
        }
      }
      sepIdx = buffer.indexOf("\n\n");
    }
  }
  if (buffer.trim().length > 0) {
    for (const line of buffer.split("\n")) {
      if (line.startsWith("data:")) {
        const payload = line.slice(5).trim();
        if (payload.length > 0) {
          pushPayload(payload);
        }
      }
    }
  }
  return { events, streamFrames, done, lastPayloadType };
}

async function emailRequest(body: unknown): Promise<Response> {
  return emailRoute(makeJsonRequest("http://localhost/api/cases/email", body));
}

async function emailRawRequest(body: string): Promise<Response> {
  return emailRoute(makeRawRequest("http://localhost/api/cases/email", body));
}

async function runRequest(id: string, body: unknown): Promise<Response> {
  return runCaseStream(makeJsonRequest(`http://localhost/api/cases/${id}/run`, body), {
    params: paramsPromise({ id }),
  });
}

async function runRawRequest(id: string, body: string): Promise<Response> {
  return runCaseStream(makeRawRequest(`http://localhost/api/cases/${id}/run`, body), {
    params: paramsPromise({ id }),
  });
}

function validRewriteBody(): Record<string, unknown> {
  return {
    selection: "the refund amount",
    instruction: "Shorten",
    response: "We reviewed your request and approved the refund amount.",
    topic: "delay_refund",
    truthMode: "supported_by_records",
    account: { fullName: "Jan Kowalski", email: "jan@example.com" },
  };
}

async function rewriteRequest(id: string, body: unknown): Promise<Response> {
  return rewriteRoute(makeJsonRequest(`http://localhost/api/cases/${id}/rewrite`, body), {
    params: paramsPromise({ id }),
  });
}

async function rewriteRawRequest(id: string, body: string): Promise<Response> {
  return rewriteRoute(makeRawRequest(`http://localhost/api/cases/${id}/rewrite`, body), {
    params: paramsPromise({ id }),
  });
}

async function readError(res: Response): Promise<{ error?: string }> {
  return (await res.json()) as { error?: string };
}

test.beforeEach(() => {
  resetState();
  resetBamlClientForTesting();
});

test.afterEach(() => {
  resetState();
  resetBamlClientForTesting();
});

test("POST /api/cases/email with valid input returns 200 and passes the draft through", async () => {
  setBamlClientForTesting(makeRawCaller());
  const res = await emailRequest({
    topic: "delay_refund",
    truthMode: "supported_by_records",
    seed: 7,
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { email?: EmailDraft };
  assert.deepEqual(body.email, CANNED_EMAIL);
  const text = JSON.stringify(body);
  assert.ok(!bodyContainsSecret(text), "email response must not include any secret");
});

test("POST /api/cases/email with invalid topic returns 400 invalid_input", async () => {
  const res = await emailRequest({
    topic: "not_a_real_topic",
    truthMode: "supported_by_records",
    seed: 1,
  });
  assert.equal(res.status, 400);
  assert.equal((await readError(res)).error, "invalid_input");
});

test("POST /api/cases/email with invalid truthMode returns 400 invalid_input", async () => {
  const res = await emailRequest({
    topic: "delay_refund",
    truthMode: "made_up",
    seed: 1,
  });
  assert.equal(res.status, 400);
  assert.equal((await readError(res)).error, "invalid_input");
});

test("POST /api/cases/email with missing or non-integer seed returns 400 invalid_input", async () => {
  const missing = await emailRequest({
    topic: "delay_refund",
    truthMode: "supported_by_records",
  });
  assert.equal(missing.status, 400);
  assert.equal((await readError(missing)).error, "invalid_input");

  const fractional = await emailRequest({
    topic: "delay_refund",
    truthMode: "supported_by_records",
    seed: 1.5,
  });
  assert.equal(fractional.status, 400);
  assert.equal((await readError(fractional)).error, "invalid_input");

  const negative = await emailRequest({
    topic: "delay_refund",
    truthMode: "supported_by_records",
    seed: -1,
  });
  assert.equal(negative.status, 400);
  assert.equal((await readError(negative)).error, "invalid_input");
});

test("POST /api/cases/email with unparseable body returns 400 invalid_body", async () => {
  const notJson = await emailRawRequest("{not json");
  assert.equal(notJson.status, 400);
  assert.equal((await readError(notJson)).error, "invalid_body");

  const notObject = await emailRawRequest("null");
  assert.equal(notObject.status, 400);
  assert.equal((await readError(notObject)).error, "invalid_body");
});

test("POST /api/cases/email returns 502 email_failed when the LLM call fails", async () => {
  setBamlClientForTesting(
    makeRawCaller({
      GenerateCustomerEmail: async () => {
        throw new Error("provider unavailable");
      },
    }),
  );
  const res = await emailRequest({
    topic: "delay_refund",
    truthMode: "supported_by_records",
    seed: 7,
  });
  assert.equal(res.status, 502);
  assert.equal((await readError(res)).error, "email_failed");
});

test("POST /api/cases/:id/run streams trace events and ends with a done frame", async () => {
  const stored = makeStoredCase();
  const res = await runRequest(stored.caseId, { stored });
  assert.equal(res.status, 200);
  const contentType = res.headers.get("content-type") ?? "";
  assert.match(contentType, /text\/event-stream/);
  const { events, streamFrames, done, lastPayloadType } = await readSseStream(res);
  assert.ok(events.length > 0, "at least one trace event should be streamed");
  const firstEvent = events.reduce((a, b) => (a.sequence <= b.sequence ? a : b));
  assert.equal(
    firstEvent.stage,
    "reading_email",
    "lowest-sequence streamed event must be reading_email",
  );
  assert.ok(
    events.some((e) => e.stage === "locating_account"),
    "locating_account stage must appear in the stream",
  );
  assert.ok(
    events.some((e) => e.stage === "drafting" && e.status === "completed"),
    "a decision must be drafted",
  );
  for (const ev of events) {
    assert.equal(typeof ev.stage, "string");
    assert.equal(typeof ev.status, "string");
    assert.equal(typeof ev.summary, "string");
    assert.equal(typeof ev.id, "string");
  }
  assert.ok(streamFrames.length > 0, "at least one token stream frame should be streamed");
  for (const frame of streamFrames) {
    assert.equal(frame.type, "stream");
    assert.ok(
      frame.stage === "generating_email" || frame.stage === "drafting",
      `unexpected stream stage: ${frame.stage}`,
    );
    assert.ok(frame.partial && typeof frame.partial === "object");
  }
  assert.equal(lastPayloadType, "done", "the last frame must be the done frame");
  assert.ok(done, "done frame must be present");
  assert.equal(done!.stored.caseId, stored.caseId);
  assert.equal(done!.stored.state, "reviewable", "fake-LLM run must end reviewable");
  assert.equal(done!.stored.version, stored.version + 1, "version must grow");
  assert.ok(Array.isArray(done!.stored.trace));
  assert.ok(Array.isArray(done!.events), "done frame must carry the run's events");
  assert.ok(done!.events.length > 0, "done frame events must not be empty");
  for (const ev of done!.events) {
    assert.equal(ev.caseId, stored.caseId, "done frame events must belong to the case");
  }
  assert.ok(
    done!.events.some(
      (e) =>
        e.status === "completed" &&
        (e.stage === "reading_email" || e.stage === "drafting"),
    ),
    "done frame events must include at least one completed stage event",
  );
  const streamedIds = [...new Set(events.map((e) => e.id))].sort();
  const doneEventIds = [...new Set(done!.events.map((e) => e.id))].sort();
  assert.deepEqual(
    doneEventIds,
    streamedIds,
    "done frame events id-set must equal the streamed trace-event id-set",
  );
  const text = JSON.stringify({ events, streamFrames, done });
  assert.ok(!bodyContainsSecret(text), "streamed frames must not include any secret");
});

test("POST /api/cases/:id/run twice with the same stored case works with no cross-request leakage", async () => {
  const stored = makeStoredCase();
  const first = await runRequest(stored.caseId, { stored });
  assert.equal(first.status, 200);
  const r1 = await readSseStream(first);
  assert.equal(r1.done?.stored.state, "reviewable");
  assert.equal(r1.events[0]?.sequence, 1, "first run starts at sequence 1");

  const second = await runRequest(stored.caseId, { stored });
  assert.equal(second.status, 200);
  const r2 = await readSseStream(second);
  assert.equal(r2.done?.stored.state, "reviewable");
  assert.equal(
    r2.events[0]?.sequence,
    1,
    "second run must start from a fresh per-request store (no leaked state)",
  );
});

test("POST /api/cases/:id/run resumes a follow-up case from seeded prior events", async () => {
  const stored: StoredCase = { ...makeStoredCase(), state: "reviewable" };
  const priorEvents = makePriorFollowUpEvents(stored.caseId);
  const res = await runRequest(stored.caseId, {
    stored,
    answers: { claimed_delay_minutes: "45" },
    events: priorEvents,
  });
  assert.equal(res.status, 200);
  const { events: streamed, done } = await readSseStream(res);
  assert.ok(
    !streamed.some((e) => e.stage === "reviewable" && e.status === "failed"),
    "resume must not fail with invalid_state",
  );
  assert.ok(done, "done frame must be present");
  assert.equal(done!.stored.state, "reviewable", "supplemented answers clear the follow-up");
  const priorIds = new Set(priorEvents.map((e) => e.id));
  const doneIds = new Set(done!.events.map((e) => e.id));
  for (const prior of priorEvents) {
    assert.ok(doneIds.has(prior.id), `done events must include seeded event ${prior.id}`);
  }
  const newEvents = done!.events.filter((e) => !priorIds.has(e.id));
  assert.ok(newEvents.length > 0, "resume must add new events");
  for (const ev of newEvents) {
    assert.ok(ev.sequence > 3, `new event sequence must continue from 3, got ${ev.sequence}`);
  }
  const lastReviewable = [...done!.events]
    .reverse()
    .find((e) => e.stage === "reviewable" && e.status === "completed");
  assert.equal(
    (lastReviewable?.payload as { outcome?: string } | undefined)?.outcome,
    "reviewable",
    "final reviewable outcome must be reviewable, not follow_up",
  );
});

test("POST /api/cases/:id/run with prior events continues sequence numbers instead of restarting", async () => {
  const stored = makeStoredCase();
  const first = await runRequest(stored.caseId, { stored });
  assert.equal(first.status, 200);
  const r1 = await readSseStream(first);
  assert.ok(r1.done, "first run must end with a done frame");
  const priorEvents = r1.done!.events;
  const maxSeq = Math.max(...priorEvents.map((e) => e.sequence));

  const second = await runRequest(stored.caseId, {
    stored: r1.done!.stored,
    events: priorEvents,
  });
  assert.equal(second.status, 200);
  const r2 = await readSseStream(second);
  assert.ok(r2.done, "second run must end with a done frame");
  const all = r2.done!.events;
  const sequences = all.map((e) => e.sequence);
  assert.equal(new Set(sequences).size, sequences.length, "sequences must be unique");
  assert.ok(Math.max(...sequences) > maxSeq, `max sequence must grow beyond ${maxSeq}`);
  const priorIds = new Set(priorEvents.map((e) => e.id));
  const fresh = all.filter((e) => !priorIds.has(e.id));
  assert.ok(fresh.length > 0, "re-run must add new events");
  for (const ev of fresh) {
    assert.ok(
      ev.sequence > maxSeq,
      `fresh event sequence must continue after ${maxSeq}, got ${ev.sequence}`,
    );
  }
});

test("POST /api/cases/:id/run with non-array events returns 400 invalid_input", async () => {
  const stored = makeStoredCase();
  const res = await runRequest(stored.caseId, { stored, events: "nope" });
  assert.equal(res.status, 400);
  assert.equal((await readError(res)).error, "invalid_input");
});

test("POST /api/cases/:id/run with stored.caseId mismatch returns 400 invalid_input", async () => {
  const stored = makeStoredCase();
  const res = await runRequest("some-other-id", { stored });
  assert.equal(res.status, 400);
  assert.equal((await readError(res)).error, "invalid_input");
});

test("POST /api/cases/:id/run with missing stored case returns 400 invalid_input", async () => {
  const res = await runRequest("case-1", {});
  assert.equal(res.status, 400);
  assert.equal((await readError(res)).error, "invalid_input");
});

test("POST /api/cases/:id/run with unparseable body returns 400 invalid_body", async () => {
  const res = await runRawRequest("case-1", "{not json");
  assert.equal(res.status, 400);
  assert.equal((await readError(res)).error, "invalid_body");
});

test("POST /api/cases/:id/run with invalid answers shape returns 400 invalid_input", async () => {
  const stored = makeStoredCase();
  const notObject = await runRequest(stored.caseId, { stored, answers: "yes" });
  assert.equal(notObject.status, 400);
  assert.equal((await readError(notObject)).error, "invalid_input");

  const badValue = await runRequest(stored.caseId, { stored, answers: { field: 42 } });
  assert.equal(badValue.status, 400);
  assert.equal((await readError(badValue)).error, "invalid_input");
});

test("POST /api/cases/:id/rewrite with valid body returns 200 and the rewritten selection", async () => {
  const res = await rewriteRequest("case-1", validRewriteBody());
  assert.equal(res.status, 200);
  const body = (await res.json()) as { rewritten?: string };
  assert.equal(typeof body.rewritten, "string");
  assert.ok(body.rewritten!.includes("Shorten"), "fake rewrite echoes the instruction");
  assert.ok(body.rewritten!.includes("the refund amount"), "fake rewrite echoes the selection");
  const text = JSON.stringify(body);
  assert.ok(!bodyContainsSecret(text), "rewrite response must not include any secret");
});

test("POST /api/cases/:id/rewrite with missing fields returns 400 invalid_input", async () => {
  const noInstruction = validRewriteBody();
  delete noInstruction.instruction;
  const res1 = await rewriteRequest("case-1", noInstruction);
  assert.equal(res1.status, 400);
  assert.equal((await readError(res1)).error, "invalid_input");

  const noAccount = validRewriteBody();
  delete noAccount.account;
  const res2 = await rewriteRequest("case-1", noAccount);
  assert.equal(res2.status, 400);
  assert.equal((await readError(res2)).error, "invalid_input");
});

test("POST /api/cases/:id/rewrite with blank response returns 400 invalid_input", async () => {
  const res = await rewriteRequest("case-1", { ...validRewriteBody(), response: "   " });
  assert.equal(res.status, 400);
  assert.equal((await readError(res)).error, "invalid_input");
});

test("POST /api/cases/:id/rewrite with unparseable body returns 400 invalid_body", async () => {
  const res = await rewriteRawRequest("case-1", "{not json");
  assert.equal(res.status, 400);
  assert.equal((await readError(res)).error, "invalid_body");
});

test("POST /api/cases/:id/rewrite returns 502 rewrite_failed when the LLM call fails", async () => {
  resetLlmClientForTesting();
  const prevFake = process.env.RAILOPS_FAKE_LLM;
  delete process.env.RAILOPS_FAKE_LLM;
  setBamlClientForTesting(
    makeRawCaller({
      RewriteResponseText: async () => {
        throw new Error("provider unavailable");
      },
    }),
  );
  try {
    const res = await rewriteRequest("case-1", validRewriteBody());
    assert.equal(res.status, 502);
    assert.equal((await readError(res)).error, "rewrite_failed");
  } finally {
    resetBamlClientForTesting();
    process.env.RAILOPS_FAKE_LLM = prevFake ?? "1";
    resetLlmClientForTesting();
  }
});
